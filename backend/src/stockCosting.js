// Stock costing: every delivery of stock is a "batch" with its own price.
// Items are issued oldest batch first (FIFO), so the cost of an issue is the price those units were bought at.
import { q } from './db.js';

const round2 = (n) => Math.round(n * 100) / 100;
// Before "npm run db:migrate-batches" has been run the table / column does not exist yet. The app then keeps working the old way.
const missing = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');

// Today's date in Sri Lanka (UTC + 5:30), as YYYY-MM-DD
export const lkToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

// Saves one delivery. (The caller updates items.stock itself.)
export async function insertBatch(conn, { itemId, qty, unitPrice, receivedDate, source = 'purchase', note = '', by = '' }) {
  try {
    await q(
      `INSERT INTO stock_batches (item_id, received_date, qty_received, qty_left, unit_price, source, note, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [itemId, receivedDate || lkToday(), qty, qty, unitPrice, source, String(note).slice(0, 255), String(by).slice(0, 100), new Date()], conn);
    return true;
  } catch (e) { if (missing(e)) return false; throw e; }
}

// Takes `qty` units out of the oldest batches and returns what they cost.
// If the batches hold less than qty (stock from before batches existed), the rest is costed at fallbackPrice.
export async function consumeFifo(conn, itemId, qty, fallbackPrice = 0) {
  let left = qty; let total = 0; let batches = [];
  try {
    batches = await q('SELECT id, qty_left, unit_price FROM stock_batches WHERE item_id = ? AND qty_left > 0 ORDER BY received_date, id FOR UPDATE', [itemId], conn);
  } catch (e) { if (!missing(e)) throw e; }
  for (const b of batches) {
    if (left <= 0) break;
    const take = Math.min(left, b.qty_left);
    await q('UPDATE stock_batches SET qty_left = qty_left - ? WHERE id = ?', [take, b.id], conn);
    total += take * Number(b.unit_price);
    left -= take;
  }
  if (left > 0) total += left * Number(fallbackPrice || 0);
  total = round2(total);
  return { total, unitPrice: qty > 0 ? round2(total / qty) : Number(fallbackPrice || 0) };
}