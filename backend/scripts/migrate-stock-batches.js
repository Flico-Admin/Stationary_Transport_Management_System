// Adds price-per-delivery costing to an EXISTING database (local MySQL or TiDB).
// Safe: nothing is deleted, no data is changed, and it can be run more than once.
//   npm run db:migrate-batches
// It uses the DB_* values in .env, so it runs against whichever database .env points to.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { migrateStockBatches } from './stockBatchesMigration.js';

const dbName = process.env.DB_NAME || 'request_desk';
try {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: dbName,
    ssl: process.env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
  });
  console.log(`Connected to ${process.env.DB_HOST || 'localhost'} / database "${dbName}"`);
  await migrateStockBatches(conn, dbName);
  console.log('\nDone. From now on enter the price every time you use "Add stock".');
  await conn.end();
} catch (e) {
  console.error('\nMigration failed:', e.message);
  console.error('Check DB_HOST / DB_USER / DB_PASSWORD / DB_NAME (and DB_SSL=true for TiDB) in the .env file.');
  process.exit(1);
}