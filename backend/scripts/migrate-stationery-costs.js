// Adds the price columns for the Stationery costs report to an EXISTING database (local MySQL or TiDB).
// Safe: nothing is deleted, no data is changed, and it can be run more than once.
//   npm run db:migrate-costs
// It uses the DB_* values in .env, so it runs against whichever database .env points to.
import 'dotenv/config';
import mysql from 'mysql2/promise';

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

  const hasColumn = async (table, column) => {
    const [[row]] = await conn.query(
      'SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
      [dbName, table, column]);
    return row.n > 0;
  };
  const addColumn = async (table, column, definition) => {
    if (await hasColumn(table, column)) return console.log(`Already there: ${table}.${column}`);
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`Added: ${table}.${column}`);
  };

  await addColumn('items', 'unit_price', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
  await addColumn('request_lines', 'unit_price', 'DECIMAL(12,2) NULL');

  console.log('\nDone. Now open "Stationery items" in the app and enter the unit price of each item.');
  await conn.end();
} catch (e) {
  console.error('\nMigration failed:', e.message);
  console.error('Check DB_HOST / DB_USER / DB_PASSWORD / DB_NAME (and DB_SSL=true for TiDB) in the .env file.');
  process.exit(1);
}