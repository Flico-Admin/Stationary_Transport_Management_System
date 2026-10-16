// Master data: items, categories, stock, vehicles, drivers, suppliers, purchase orders, maintenance, fuel.
import { Router } from 'express';
import { q, tx, bad, notFound } from '../db.js';
import { need } from '../auth.js';

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
  try {
    if (b.id) await q('UPDATE items SET code=?, name=?, category_id=?, unit=?, description=?, stock=?, min_stock=? WHERE id=?',
      [b.code.trim(), b.name.trim(), cat.id, b.unit || 'piece', b.description || '', stock, min, b.id]);
    else await q('INSERT INTO items (code, name, category_id, unit, description, stock, min_stock, active) VALUES (?,?,?,?,?,?,?,1)',
      [b.code.trim(), b.name.trim(), cat.id, b.unit || 'piece', b.description || '', stock, min]);
  } catch (e) { dupMsg(e, 'This item code is already used.'); }
  res.json({ ok: true });
});
r.post('/items/:id/stock', async (req, res) => {
  need(req.user, 'items', 'edit');
  const qty = int(req.body?.qty, 'Enter a whole number.');
  if (qty < 1) throw bad('Quantity must be at least 1.');
  const upd = await q('UPDATE items SET stock = stock + ? WHERE id = ?', [qty, req.params.id]);
  if (!upd.affectedRows) throw notFound('Item not found.');
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
      const lines = await q('SELECT item_id, qty FROM purchase_order_lines WHERE po_id = ?', [id], conn);
      for (const l of lines) await q('UPDATE items SET stock = stock + ? WHERE id = ?', [l.qty, l.item_id], conn);   // FR-48
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
