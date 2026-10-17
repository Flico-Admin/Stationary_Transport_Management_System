import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool, q, HttpError } from './db.js';
import { auth, signToken, checkPassword, loadUser } from './auth.js';
import { buildDb } from './bootstrap.js';
import requests from './routes/requests.js';
import master from './routes/master.js';
import admin from './routes/admin.js';
import costs from './routes/costs.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Express 4 does not catch errors from async routes by itself. This makes it do so.
const wrapRouter = (router) => {
  router.stack.forEach((layer) => {
    if (!layer.route) return;
    layer.route.stack.forEach((l) => {
      const fn = l.handle;
      l.handle = (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
    });
  });
  return router;
};

// ---------- login (the only open route) ----------
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const [u] = await q('SELECT id, password_hash, active FROM users WHERE email = ?', [email]);
    if (!u || !checkPassword(String(req.body?.password || ''), u.password_hash)) throw new HttpError(401, 'The email or password is not correct.');
    if (!u.active) throw new HttpError(403, 'This account is deactivated. Contact the IT department.');
    res.json({ token: signToken(u.id), userId: u.id });
  } catch (e) { next(e); }
});

// ---------- everything below needs a valid login ----------
app.use('/api', auth);
app.get('/api/bootstrap', async (req, res, next) => {
  try { res.json({ userId: req.user.id, db: await buildDb(req.user) }); } catch (e) { next(e); }
});
app.use('/api/requests', wrapRouter(requests));
app.use('/api', wrapRouter(master));
app.use('/api', wrapRouter(admin));
app.use('/api', wrapRouter(costs));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Every error ends here and goes back to the screen as { error: "message" }
app.use((err, req, res, next) => {
  if (!(err instanceof HttpError)) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong on the server.' });
});

const port = Number(process.env.PORT || 4000);
try {
  await pool.query('SELECT 1');
  console.log(`Connected to MySQL database "${process.env.DB_NAME || 'request_desk'}"`);
} catch (e) {
  // Show exactly what the app tried to connect to (never the password), so hosting problems are easy to spot.
  const first = e.errors?.[0] || e;
  console.error('\nCould not connect to MySQL.');
  console.error(`  Host: ${process.env.DB_HOST || '(DB_HOST not set, using localhost)'}`);
  console.error(`  Port: ${process.env.DB_PORT || '(not set, using 3306)'}`);
  console.error(`  User: ${process.env.DB_USER || '(not set, using root)'}`);
  console.error(`  Database: ${process.env.DB_NAME || '(not set, using request_desk)'}`);
  console.error(`  SSL: ${process.env.DB_SSL === 'true' ? 'on' : 'off (DB_SSL is not "true")'}`);
  console.error(`  Error: ${first.code || ''} ${first.message || e.message || String(e)}`);
  console.error('Check DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME / DB_SSL in the hosting Environment settings (or .env locally).\n');
  process.exit(1);
}
app.listen(port, () => console.log(`Backend running at http://localhost:${port}`));