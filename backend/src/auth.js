import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { q, HttpError, forbidden } from './db.js';
import { can } from './permissions.js';

const secret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is missing in the .env file');
  return process.env.JWT_SECRET;
};

export const signToken = (userId) => jwt.sign({ uid: userId }, secret(), { expiresIn: '12h' });
export const hashPassword = (p) => bcrypt.hashSync(p, 10);
export const checkPassword = (p, hash) => bcrypt.compareSync(p, hash);

// Loads the user and merges role permissions + extra permissions
export async function loadUser(id) {
  const [u] = await q(
    `SELECT u.id, u.name, u.email, u.role_key AS role, u.unit_id AS unitId, u.active, un.name AS dept
       FROM users u JOIN units un ON un.id = u.unit_id WHERE u.id = ?`, [id]);
  if (!u) return null;
  const rows = [
    ...(await q('SELECT module, action FROM role_permissions WHERE role_key = ?', [u.role])),
    ...(await q('SELECT module, action FROM user_permissions WHERE user_id = ?', [u.id])),
  ];
  const perms = {};
  rows.forEach((r) => { (perms[r.module] ||= []).includes(r.action) || perms[r.module].push(r.action); });
  return { ...u, active: !!u.active, perms };
}

// Express middleware: checks the login token on every request
export async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) throw new HttpError(401, 'Please log in.');
    let payload;
    try { payload = jwt.verify(header.slice(7), secret()); } catch { throw new HttpError(401, 'Your session has expired. Please log in again.'); }
    const user = await loadUser(payload.uid);
    if (!user || !user.active) throw new HttpError(401, 'This account is not active.');
    req.user = user;
    next();
  } catch (e) { next(e); }
}

// Use inside a route: need(req.user, 'items', 'edit')
export const need = (user, module, action) => { if (!can(user, module, action)) throw forbidden(); };
