// Stationery cost report: one row for every item line that was issued, with its price.
// The screen (frontend/src/stationeryCostData.js) groups these rows by department, item, category and month.
import { Router } from 'express';
import { q } from '../db.js';
import { need } from '../auth.js';
import { REQ } from '../bootstrap.js';

const r = Router();

r.get('/reports/stationery-costs', async (req, res) => {
  need(req.user, 'costReports', 'view');
  // Price used = the price saved when the items were issued. Lines issued before prices existed use the item's current price.
  // Dates are stored in UTC, so +330 minutes turns the issue time into the Sri Lanka date.
  const rows = await q(
    `SELECT l.id, r.id AS requestId, DATE_FORMAT(DATE_ADD(r.issued_at, INTERVAL 330 MINUTE), '%Y-%m-%d') AS date,
            r.unit_id AS unitId, un.name AS unitName, un.type AS unitType, u.name AS requester,
            i.id AS itemId, i.code, i.name AS itemName, c.name AS category, i.unit,
            l.issued_qty AS qty, COALESCE(l.unit_price, i.unit_price) AS unitPrice
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
      const unitPrice = Number(x.unitPrice);
      return { ...x, id: undefined, requestId: REQ(x.requestId), unitPrice, amount: Math.round(x.qty * unitPrice * 100) / 100 };
    }),
  });
});

export default r;