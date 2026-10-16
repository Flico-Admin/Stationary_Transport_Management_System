// One command to create the database, all tables and the demo data:  npm run db:setup
// Uses the MySQL login in your .env file. WARNING: it resets request_desk (drops and recreates every table).
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'database');
try {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });
  for (const file of ['schema.sql', 'seed.sql']) {
    await conn.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    console.log(`Done: ${file}`);
  }
  const [[t]] = await conn.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'request_desk'");
  const [[u]] = await conn.query('SELECT COUNT(*) AS n FROM request_desk.users');
  console.log(`\nDatabase "request_desk" is ready: ${t.n} tables, ${u.n} demo users.`);
  await conn.end();
} catch (e) {
  console.error('\nSetup failed:', e.message);
  console.error('Check DB_USER / DB_PASSWORD in the .env file and that MySQL is running.');
  process.exit(1);
}
