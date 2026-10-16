// MySQL connection. All SQL in this project goes through q() and tx().
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'request_desk',
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',          // all dates are stored and read as UTC
  charset: 'utf8mb4',
});

// Run one query. Pass a connection (from tx) to run inside a transaction.
export const q = async (sql, params = [], conn = pool) => (await conn.query(sql, params))[0];

// Run several queries as one unit: all succeed or none are saved.
export async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = (msg) => new HttpError(400, msg);
export const forbidden = (msg = 'You do not have permission to do this.') => new HttpError(403, msg);
export const notFound = (msg = 'Not found.') => new HttpError(404, msg);
