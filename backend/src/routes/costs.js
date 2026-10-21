// Stationery cost report: one row for every item line that was issued, with its price.
// The screen (frontend/src/stationeryCostData.js) groups these rows by department, item, category and month.
import { Router } from 'express';
import { q, bad } from '../db.js';
import { need } from '../auth.js';
import { REQ } from '../bootstrap.js';

const r = Router();

r.get('/reports/stationery-costs', async (req, res) => {
  need(req.user, 'costReports', 'view');
  // Cost used = the cost saved when the items were issued (taken from the oldest stock first, so it follows the price of each delivery).
  // Lines issued before that was saved use quantity x the price saved at that time, or the item's current price.
  // Dates are stored in UTC, so +330 minutes turns the issue time into the Sri Lanka date.
  const rows = await q(
    `SELECT l.id, r.id AS requestId, DATE_FORMAT(DATE_ADD(r.issued_at, INTERVAL 330 MINUTE), '%Y-%m-%d') AS date,
            r.unit_id AS unitId, un.name AS unitName, un.type AS unitType, u.name AS requester,
            i.id AS itemId, i.code, i.name AS itemName, c.name AS category, i.unit,
            l.issued_qty AS qty, COALESCE(l.unit_price, i.unit_price) AS unitPrice, l.issued_cost AS issuedCost
       FROM request_lines l
       JOIN requests r ON r.id = l.request_id
       JOIN units un ON un.id = r.unit_id
       JOIN users u ON u.id = r.user_id
       JOIN items i ON i.id = l.item_id
       JOIN categories c ON c.id = i.category_id
      WHERE r.type = 'stationery' AND r.issued_at IS NOT NULL AND l.issued_qty > 0
      ORDER BY r.issued_at DESC, l.id`);
  res.json({
    rows: rows.map((x) => {
      const amount = x.issuedCost != null ? Number(x.issuedCost) : Math.round(x.qty * Number(x.unitPrice) * 100) / 100;
      return { ...x, id: undefined, issuedCost: undefined, requestId: REQ(x.requestId), unitPrice: x.qty > 0 ? Math.round((amount / x.qty) * 100) / 100 : Number(x.unitPrice), amount };
    }),
  });
});

// Stock value: what the stock in the store is worth right now, using the price of each delivery that is still in the store.
// Stock that has no delivery record (older data) is valued at the item's current price.
r.get('/reports/stock-value', async (req, res) => {
  need(req.user, 'costReports', 'view');
  let rows;
  try {
    rows = await q(
      `SELECT i.id AS itemId, i.stock, i.unit_price AS unitPrice, COALESCE(b.qty, 0) AS batchQty, COALESCE(b.value, 0) AS batchValue
         FROM items i
         LEFT JOIN (SELECT item_id, SUM(qty_left) AS qty, SUM(qty_left * unit_price) AS value FROM stock_batches WHERE qty_left > 0 GROUP BY item_id) b ON b.item_id = i.id`);
  } catch (e) { if (e.code === 'ER_NO_SUCH_TABLE') throw bad('Run "npm run db:migrate-batches" in the backend folder first.'); throw e; }
  res.json({
    rows: rows.map((x) => {
      const stock = Number(x.stock);
      const value = Math.round((Number(x.batchValue) + Math.max(0, stock - Number(x.batchQty)) * Number(x.unitPrice)) * 100) / 100;
      return { itemId: x.itemId, value, avgCost: stock > 0 ? Math.round((value / stock) * 100) / 100 : Number(x.unitPrice) };
    }),
  });
});

export default r;