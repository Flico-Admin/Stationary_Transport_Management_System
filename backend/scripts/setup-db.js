// One command to create the database, all tables, the starting data and the two logins:  npm run db:setup
// Uses the MySQL login in your .env file. WARNING: it resets request_desk (drops and recreates every table).
// Logins created: Admin (Admin department) and Sadeep (IT department). Passwords come from .env (never stored in the code).
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { migrateStockBatches } from './stockBatchesMigration.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'database');

const LOGINS = [
  { name: 'Admin',  email: (process.env.ADMIN_EMAIL  || 'admin@company.example').trim().toLowerCase(),  password: process.env.ADMIN_PASSWORD,  role: 'admin', unit: 'Admin' },
  { name: 'Sadeep', email: (process.env.SADEEP_EMAIL || 'sadeep@company.example').trim().toLowerCase(), password: process.env.SADEEP_PASSWORD, role: 'it',    unit: 'IT' },
];

try {
  const missing = LOGINS.filter((l) => !l.password).map((l) => l.name === 'Admin' ? 'ADMIN_PASSWORD' : 'SADEEP_PASSWORD');
  if (missing.length) throw new Error(`Add ${missing.join(' and ')} to the .env file first (choose strong passwords).`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    // Needed for TiDB Cloud / hosted MySQL. Set DB_SSL=true in .env. Leave unset for local MySQL.
    ssl: process.env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
  });
  // the stock batches table is not in schema.sql, so clear an old one first (it points to items)
  try { await conn.query('DROP TABLE IF EXISTS request_desk.stock_batches'); } catch { /* the database does not exist yet */ }
  for (const file of ['schema.sql', 'seed.sql']) {
    await conn.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    console.log(`Done: ${file}`);
  }

  // Stock batches (price of every delivery) + an opening balance batch for the stock in seed.sql
  await migrateStockBatches(conn, 'request_desk');

  // The only two users: Admin and Sadeep (IT, full access)
  for (const l of LOGINS) {
    const [[unit]] = await conn.query('SELECT id FROM request_desk.units WHERE name = ?', [l.unit]);
    if (!unit) throw new Error(`Department "${l.unit}" was not found in seed.sql.`);
    await conn.query(
      'INSERT INTO request_desk.users (name, email, password_hash, role_key, unit_id, active) VALUES (?,?,?,?,?,1)',
      [l.name, l.email, bcrypt.hashSync(l.password, 10), l.role, unit.id]);
  }

  const [[t]] = await conn.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'request_desk'");
  const [[u]] = await conn.query('SELECT COUNT(*) AS n FROM request_desk.users');
  console.log(`\nDatabase "request_desk" is ready: ${t.n} tables, ${u.n} users.`);
  LOGINS.forEach((l) => console.log(`  ${l.name} (${l.role}): ${l.email}`));
  await conn.end();
} catch (e) {
  console.error('\nSetup failed:', e.message);
  console.error('Check DB_HOST / DB_USER / DB_PASSWORD (and DB_SSL=true for TiDB), ADMIN_PASSWORD and SADEEP_PASSWORD in the .env file.');
  process.exit(1);
}