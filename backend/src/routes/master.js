// Master data: items, categories, stock, vehicles, drivers, suppliers, purchase orders, maintenance, fuel.
import { Router } from 'express';
import { q, tx, bad, notFound } from '../db.js';
import { need } from '../auth.js';
import { insertBatch, consumeFifo, lkToday } from '../stockCosting.js';

const r = Router();
const now = () => new Date();
const int = (v, msg) => { const n = Number(v); if (v === '' || v === null || v === undefined || !Number.isInteger(n)) throw bad(msg); return n; };
const dupMsg = (e, msg) => { if (e.code === 'ER_DUP_ENTRY') throw bad(msg); throw e; };
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

// ---------- stationery items ----------
r.post('/items/save', async (req, res) => {
  const b = req.body || {};
  need(req.user, 'items', b.id ? 'edit' : 'add');
  if (!b.name?.trim() || !b.code?.trim() || !b.category) throw bad('Name, code and category are required.');
  const [cat] = await q('SELECT id FROM categories WHERE name = ?', [b.category]);
  if (!cat) throw bad('Choose a category from the list.');
  const stock = int(b.stock, 'Stock must be a whole number.'); const min = int(b.min, 'Minimum stock must be a whole number.');
  if (stock < 0 || min < 0) throw bad('Stock cannot be negative.');
  const price = b.unitPrice === '' || b.unitPrice == null ? 0 : Number(b.unitPrice);
  if (!Number.isFinite(price) || price < 0 || price > 9999999999) throw bad('Unit price must be a number, 0 or more.');
  await tx(async (conn) => {
    try {
      if (b.id) {
        const [old] = await q('SELECT stock FROM items WHERE id = ? FOR UPDATE', [b.id], conn);
        if (!old) throw notFound('Item not found.');
        await q('UPDATE items SET code=?, name=?, category_id=?, unit=?, description=?, stock=?, min_stock=?, unit_price=? WHERE id=?',
          [b.code.trim(), b.name.trim(), cat.id, b.unit || 'piece', b.description || '', stock, min, price, b.id], conn);
        // Changing the stock number here is a correction. The stock batches follow it.
        const change = stock - old.stock;
        if (change > 0) await insertBatch(conn, { itemId: b.id, qty: change, unitPrice: price, source: 'adjustment', note: 'Stock number changed by editing the item', by: req.user.name });
        if (change < 0) await consumeFifo(conn, b.id, -change, price);
      } else {
        const ins = await q('INSERT INTO items (code, name, category_id, unit, description, stock, min_stock, unit_price, active) VALUES (?,?,?,?,?,?,?,?,1)',
          [b.code.trim(), b.name.trim(), cat.id, b.unit || 'piece', b.description || '', stock, min, price], conn);
        if (stock > 0) await insertBatch(conn, { itemId: ins.insertId, qty: stock, unitPrice: price, source: 'opening', note: 'Stock when the item was added', by: req.user.name });
      }
    } catch (e) { dupMsg(e, 'This item code is already used.'); }
  });
  res.json({ ok: true });
});
// Add stock = one delivery with its own price. The price is saved with the delivery, so costs follow the real purchase prices.
r.post('/items/:id/stock', async (req, res) => {
  need(req.user, 'items', 'edit');
  const b = req.body || {};
  const qty = int(b.qty, 'Enter a whole number.');
  if (qty < 1) throw bad('Quantity must be at least 1.');
  if (qty > 1000000) throw bad('That quantity is too large.');
  if (b.unitPrice === '' || b.unitPrice == null) throw bad('Enter the price of one unit for this stock.');
  const price = Number(b.unitPrice);
  if (!Number.isFinite(price) || price < 0 || price > 9999999999) throw bad('Unit price must be a number, 0 or more.');
  const date = b.receivedDate || lkToday();
  const when = new Date(`${date}T00:00:00Z`);
  const real = isDate(date) && !Number.isNaN(when.getTime()) && when.toISOString().slice(0, 10) === date;
  if (!real) throw bad('Enter a valid date received.');
  if (date > new Date(Date.now() + 330 * 60000 + 86400000).toISOString().slice(0, 10)) throw bad('The date received cannot be in the future.');
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (note.length > 255) throw bad('The note is too long (maximum 255 characters).');
  await tx(async (conn) => {
    const [item] = await q('SELECT id FROM items WHERE id = ? FOR UPDATE', [req.params.id], conn);
    if (!item) throw notFound('Item not found.');
    // the newest price becomes the item's current price
    await q('UPDATE items SET stock = stock + ?, unit_price = ? WHERE id = ?', [qty, Math.round(price * 100) / 100, item.id], conn);
    await insertBatch(conn, { itemId: item.id, qty, unitPrice: Math.round(price * 100) / 100, receivedDate: date, source: 'purchase', note, by: req.user.name });
  });
  res.json({ ok: true });
});

// The deliveries (batches) of one item: what came in, at what price, and how much of it is still in the store
r.get('/items/:id/batches', async (req, res) => {
  need(req.user, 'items', 'view');
  let rows;
  try {
    rows = await q(
      `SELECT id, DATE_FORMAT(received_date, '%Y-%m-%d') AS receivedDate, qty_received AS qtyReceived, qty_left AS qtyLeft, unit_price AS unitPrice,
              source, note, created_by AS createdBy
         FROM stock_batches WHERE item_id = ? ORDER BY received_date DESC, id DESC`, [req.params.id]);
  } catch (e) { if (e.code === 'ER_NO_SUCH_TABLE') throw bad('Run "npm run db:migrate-batches" in the backend folder first.'); throw e; }
  res.json({ rows: rows.map((x) => ({ ...x, unitPrice: Number(x.unitPrice) })) });
});

// Correct a wrongly typed price. Only possible while none of that delivery has been issued yet.
r.post('/items/batches/:id/price', async (req, res) => {
  need(req.user, 'items', 'edit');
  const v = req.body?.unitPrice;
  const price = Number(v);
  if (v === '' || v == null || !Number.isFinite(price) || price < 0 || price > 9999999999) throw bad('Unit price must be a number, 0 or more.');
  const fixed = Math.round(price * 100) / 100;
  await tx(async (conn) => {
    const [b] = await q('SELECT * FROM stock_batches WHERE id = ? FOR UPDATE', [req.params.id], conn);
    if (!b) throw notFound('Stock record not found.');
    if (b.qty_left !== b.qty_received) throw bad('Some of this stock has already been issued, so its price can no longer be changed.');
    await q('UPDATE stock_batches SET unit_price = ? WHERE id = ?', [fixed, b.id], conn);
    // if this is the newest delivery, it also sets the item's current price
    const [newest] = await q('SELECT id FROM stock_batches WHERE item_id = ? ORDER BY received_date DESC, id DESC LIMIT 1', [b.item_id], conn);
    if (newest && newest.id === b.id) await q('UPDATE items SET unit_price = ? WHERE id = ?', [fixed, b.item_id], conn);
  });
  res.json({ ok: true });
});
r.post('/categories', async (req, res) => {
  need(req.user, 'items', 'edit');
  const name = (req.body?.name || '').trim();
  if (!name) throw bad('Enter a category name.');
  await q('INSERT IGNORE INTO categories (name) VALUES (?)', [name]);
  res.json({ ok: true });
});

// ---------- vehicles ----------
r.post('/vehicles/save', async (req, res) => {
  const b = req.body || {};
  need(req.user, 'vehicles', b.id ? 'edit' : 'add');
  if (!b.number?.trim()) throw bad('Vehicle number is required.');
  if (!b.type?.trim()) throw bad('Vehicle type is required.');
  const capacity = int(b.capacity, 'Capacity must be a whole number.');
  // If this type already exists (any upper/lower case), reuse its exact spelling so "van" and "Van" do not become two types
  const [same] = await q('SELECT type FROM vehicles WHERE type = ? LIMIT 1', [b.type.trim()]);
  const type = same ? same.type : b.type.trim();
  try {
    if (b.id) await q('UPDATE vehicles SET number=?, type=?, capacity=? WHERE id=?', [b.number.trim(), type, capacity, b.id]);
    else await q('INSERT INTO vehicles (number, type, capacity) VALUES (?,?,?)', [b.number.trim(), type, capacity]);
  } catch (e) { dupMsg(e, 'This vehicle number already exists.'); }
  res.json({ ok: true });
});

// ---------- drivers ----------
r.post('/drivers/save', async (req, res) => {
  const b = req.body || {};
  need(req.user, 'vehicles', b.id ? 'edit' : 'add');
  if (!b.name?.trim()) throw bad('Driver name is required.');
  if (b.id) await q('UPDATE drivers SET name=?, phone=? WHERE id=?', [b.name.trim(), b.phone || '', b.id]);
  else await q('INSERT INTO drivers (name, phone) VALUES (?,?)', [b.name.trim(), b.phone || '']);
  res.json({ ok: true });
});

// ---------- suppliers ----------
r.post('/suppliers/save', async (req, res) => {
  const b = req.body || {};
  need(req.user, 'purchasing', b.id ? 'edit' : 'add');
  if (!b.name?.trim()) throw bad('Supplier name is required.');
  if (b.id) await q('UPDATE suppliers SET name=?, contact=? WHERE id=?', [b.name.trim(), b.contact || '', b.id]);
  else await q('INSERT INTO suppliers (name, contact) VALUES (?,?)', [b.name.trim(), b.contact || '']);
  res.json({ ok: true });
});

// ---------- activate / deactivate (items, vehicles, drivers, suppliers) ----------
const ACTIVE = { items: ['items', 'items'], vehicles: ['vehicles', 'vehicles'], drivers: ['drivers', 'vehicles'], suppliers: ['suppliers', 'purchasing'] };
r.post('/:collection(items|vehicles|drivers|suppliers)/:id/active', async (req, res) => {
  const c = ACTIVE[req.params.collection];
  if (!c) throw notFound();
  need(req.user, c[1], 'delete');
  await q(`UPDATE ${c[0]} SET active = ? WHERE id = ?`, [req.body?.active ? 1 : 0, req.params.id]);
  res.json({ ok: true });
});

// ---------- purchase orders ----------
const NEXT = { Draft: 'Approved', Approved: 'Sent', Sent: 'Received' };
r.post('/purchase-orders', async (req, res) => {
  need(req.user, 'purchasing', 'add');
  const { supplierId, lines } = req.body || {};
  if (!supplierId) throw bad('Choose a supplier.');
  if (!Array.isArray(lines) || !lines.length) throw bad('Add at least one item with a quantity.');
  const id = await tx(async (conn) => {
    const [s] = await q('SELECT id FROM suppliers WHERE id = ? AND active = 1', [supplierId], conn);
    if (!s) throw bad('That supplier is not available.');
    const ins = await q("INSERT INTO purchase_orders (supplier_id, status, created_at) VALUES (?, 'Draft', ?)", [supplierId, now()], conn);
    for (const l of lines) {
      const qty = int(l.qty, 'Quantity must be a whole number.');
      if (qty < 1) throw bad('Quantity must be at least 1.');
      await q('INSERT INTO purchase_order_lines (po_id, item_id, qty) VALUES (?,?,?)', [ins.insertId, int(l.itemId, 'Choose an item.'), qty], conn);
    }
    await q('INSERT INTO purchase_order_history (po_id, at, by_name, action) VALUES (?,?,?,?)', [ins.insertId, now(), req.user.name, 'Created as Draft'], conn);
    return ins.insertId;
  });
  res.json({ id: `PO-${id}` });
});
r.post('/purchase-orders/:ref/status', async (req, res) => {
  need(req.user, 'purchasing', 'edit');
  const id = Number(String(req.params.ref).replace(/^PO-/, ''));
  const status = req.body?.status;
  await tx(async (conn) => {
    const [po] = await q('SELECT * FROM purchase_orders WHERE id = ? FOR UPDATE', [id], conn);
    if (!po) throw notFound('Purchase order not found.');
    if (NEXT[po.status] !== status) throw bad(`A ${po.status} purchase order cannot be changed to ${status}.`);
    await q('UPDATE purchase_orders SET status = ? WHERE id = ?', [status, id], conn);
    await q('INSERT INTO purchase_order_history (po_id, at, by_name, action) VALUES (?,?,?,?)', [id, now(), req.user.name, `Status changed to ${status}`], conn);
    if (status === 'Received') {
      const lines = await q('SELECT l.item_id, l.qty, i.unit_price FROM purchase_order_lines l JOIN items i ON i.id = l.item_id WHERE l.po_id = ?', [id], conn);
      for (const l of lines) {
        await q('UPDATE items SET stock = stock + ? WHERE id = ?', [l.qty, l.item_id], conn);   // FR-48
        // a purchase order has no prices, so the delivery is saved at the item's current price (it can be corrected in Stock history)
        await insertBatch(conn, { itemId: l.item_id, qty: l.qty, unitPrice: Number(l.unit_price), source: 'po', note: `Received on PO-${id} (item's current price)`, by: req.user.name });
      }
    }
  });
  res.json({ ok: true });
});

// ---------- vehicle maintenance and fuel ----------
r.post('/maintenance', async (req, res) => {
  need(req.user, 'maintenance', 'add');
  const b = req.body || {};
  if (!b.vehicleId || !isDate(b.date)) throw bad('Choose a vehicle and a date.');
  if (!b.details?.trim()) throw bad('Describe the work done.');
  await tx(async (conn) => {
    const [v] = await q('SELECT id FROM vehicles WHERE id = ?', [b.vehicleId], conn);
    if (!v) throw bad('Vehicle not found.');
    await q('INSERT INTO maintenance (vehicle_id, date, type, details, cost, next_service, under_repair) VALUES (?,?,?,?,?,?,?)',
      [b.vehicleId, b.date, b.type || 'Service', b.details.trim(), Number(b.cost) || 0, isDate(b.nextService) ? b.nextService : null, b.underRepair ? 1 : 0], conn);
    if (b.underRepair) await q("UPDATE vehicles SET status = 'not available' WHERE id = ?", [b.vehicleId], conn);   // FR-51
  });
  res.json({ ok: true });
});
r.post('/maintenance/:id/repaired', async (req, res) => {
  need(req.user, 'maintenance', 'edit');
  await tx(async (conn) => {
    const [m] = await q('SELECT * FROM maintenance WHERE id = ? FOR UPDATE', [req.params.id], conn);
    if (!m) throw notFound('Record not found.');
    await q('UPDATE maintenance SET under_repair = 0 WHERE id = ?', [m.id], conn);
    const [still] = await q('SELECT COUNT(*) AS n FROM maintenance WHERE vehicle_id = ? AND under_repair = 1', [m.vehicle_id], conn);
    if (!still.n) await q("UPDATE vehicles SET status = 'available' WHERE id = ?", [m.vehicle_id], conn);
  });
  res.json({ ok: true });
});
r.post('/fuel', async (req, res) => {
  need(req.user, 'maintenance', 'add');
  const b = req.body || {};
  if (!b.vehicleId || !isDate(b.date)) throw bad('Choose a vehicle and a date.');
  if (!(Number(b.litres) > 0) || !(Number(b.cost) >= 0)) throw bad('Enter litres and cost.');
  await q('INSERT INTO fuel_logs (vehicle_id, date, litres, cost, meter) VALUES (?,?,?,?,?)',
    [b.vehicleId, b.date, Number(b.litres), Number(b.cost), Number.isFinite(Number(b.meter)) && b.meter !== null && b.meter !== '' ? Math.round(Number(b.meter)) : null]);
  res.json({ ok: true });
});

export default r;