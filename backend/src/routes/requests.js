// Request workflow: create, HOD approval, Admin approval, issue / assign vehicle, trips.
import { Router } from 'express';
import { q, tx, bad, forbidden, notFound } from '../db.js';
import { need } from '../auth.js';
import { can } from '../permissions.js';
import { REQ } from '../bootstrap.js';

const r = Router();
const now = () => new Date();
const isInt = (v) => Number.isInteger(Number(v)) && v !== '' && v !== null;
const parseRef = (ref) => { const n = Number(String(ref).replace(/^REQ-/, '')); if (!Number.isInteger(n)) throw notFound('Request not found.'); return n; };

const history = (conn, requestId, by, action, comment) =>
  q('INSERT INTO request_history (request_id, at, by_name, action, comment) VALUES (?, ?, ?, ?, ?)', [requestId, now(), by, action, comment || null], conn);

// Whose HOD signs requests from this unit: its own, or another unit's (showrooms/warehouses -> Operations)
const approverUnit = async (conn, unitId) => {
  const [u] = await q('SELECT id, approver_unit_id FROM units WHERE id = ?', [unitId], conn);
  return u?.approver_unit_id || unitId;
};

// Locks the request row while we change it, so two people cannot approve it at the same time
async function lockRequest(conn, ref) {
  const [row] = await q('SELECT * FROM requests WHERE id = ? FOR UPDATE', [parseRef(ref)], conn);
  if (!row) throw notFound('Request not found.');
  return row;
}
const wrongStatus = (row) => bad(`This request is now "${row.status}", so this action is not possible.`);

// ---------- create ----------
r.post('/', async (req, res) => {
  const u = req.user; const b = req.body || {};
  need(u, 'requests', 'add');
  if (!['stationery', 'vehicle'].includes(b.type)) throw bad('Request type must be stationery or vehicle.');
  const id = await tx(async (conn) => {
    const selfApprover = can(u, 'hodApproval', 'edit') && (await approverUnit(conn, u.unitId)) === u.unitId;
    const status = selfApprover ? 'Pending Admin Approval' : 'Pending HOD Approval';
    let result;
    if (b.type === 'stationery') {
      const lines = Array.isArray(b.lines) ? b.lines : [];
      if (!lines.length) throw bad('Add at least one item with a quantity.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.requiredDate || '')) throw bad('Choose the date you need the items.');
      const seen = new Set();
      for (const l of lines) {
        if (!isInt(l.itemId) || !isInt(l.qty) || Number(l.qty) < 1) throw bad('Every line needs an item and a quantity of 1 or more.');
        if (seen.has(Number(l.itemId))) throw bad('An item appears twice. Combine them into one line.');
        seen.add(Number(l.itemId));
        const [it] = await q('SELECT id, active FROM items WHERE id = ?', [l.itemId], conn);
        if (!it || !it.active) throw bad('One of the items is not available.');
      }
      result = await q('INSERT INTO requests (type, user_id, unit_id, status, created_at, required_date, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['stationery', u.id, u.unitId, status, now(), b.requiredDate, (b.note || '').slice(0, 1000)], conn);
      for (let i = 0; i < lines.length; i++) {
        await q('INSERT INTO request_lines (request_id, line_no, item_id, qty) VALUES (?, ?, ?, ?)', [result.insertId, i, lines[i].itemId, lines[i].qty], conn);
      }
    } else {
      const t = b.trip || {};
      if (!t.purpose || !t.from || !t.to || !t.start || !t.end) throw bad('Fill in the purpose, pickup, destination and both date and times.');
      if (t.end <= t.start) throw bad('The end time must be after the start time.');
      // Only a vehicle type that has a free vehicle right now can be requested
      // (free = active, not under repair, and not assigned to a trip that is still open)
      const [free] = await q(
        `SELECT v.type FROM vehicles v
          WHERE v.active = 1 AND v.status = 'available' AND v.type = ?
            AND NOT EXISTS (SELECT 1 FROM requests r WHERE r.type = 'vehicle' AND r.status = 'Approved' AND r.trip_vehicle_id = v.id)
          LIMIT 1`, [t.vehicleType || ''], conn);
      if (!free) throw bad(`No ${t.vehicleType || 'vehicle'} is available right now. Choose another vehicle type or try again later.`);
      result = await q(
        `INSERT INTO requests (type, user_id, unit_id, status, created_at, note, trip_purpose, trip_from, trip_to, trip_start, trip_end, trip_passengers, trip_vehicle_type)
         VALUES ('vehicle', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [u.id, u.unitId, status, now(), (b.note || '').slice(0, 1000), t.purpose, t.from, t.to, t.start, t.end, Number(t.passengers) || 1, free.type], conn);
    }
    await history(conn, result.insertId, u.name, 'Created request');
    if (selfApprover) await history(conn, result.insertId, 'System', 'HOD approval skipped because the requester is the approving HOD');
    return result.insertId;
  });
  res.json({ id: REQ(id) });
});

// ---------- cancel (by the requester) ----------
r.post('/:ref/cancel', async (req, res) => {
  await tx(async (conn) => {
    const row = await lockRequest(conn, req.params.ref);
    if (row.user_id !== req.user.id) throw forbidden('Only the person who made the request can cancel it.');
    if (!['Pending HOD Approval', 'Pending Admin Approval'].includes(row.status)) throw wrongStatus(row);
    await q("UPDATE requests SET status = 'Cancelled' WHERE id = ?", [row.id], conn);
    await history(conn, row.id, req.user.name, 'Cancelled by requester');
  });
  res.json({ ok: true });
});

// ---------- HOD decision ----------
r.post('/:ref/hod-decision', async (req, res) => {
  const { approve, comment } = req.body || {};
  need(req.user, 'hodApproval', 'edit');
  await tx(async (conn) => {
    const row = await lockRequest(conn, req.params.ref);
    if (row.status !== 'Pending HOD Approval') throw wrongStatus(row);
    const covers = req.user.role === 'it' || (await approverUnit(conn, row.unit_id)) === req.user.unitId;
    if (!covers) throw forbidden('This request belongs to another HOD.');
    if (approve) {
      await q("UPDATE requests SET status = 'Pending Admin Approval' WHERE id = ?", [row.id], conn);
      await history(conn, row.id, req.user.name, 'HOD approved', comment);
    } else {
      if (!comment?.trim()) throw bad('Write a reason before rejecting.');
      await q("UPDATE requests SET status = 'Rejected', rejected_at = 'hod', rejection_reason = ? WHERE id = ?", [comment, row.id], conn);
      await history(conn, row.id, req.user.name, 'HOD rejected', comment);
    }
  });
  res.json({ ok: true });
});

// ---------- Admin decision (can approve a smaller quantity) ----------
r.post('/:ref/admin-decision', async (req, res) => {
  const { approve, comment, qtyMap } = req.body || {};
  need(req.user, 'adminApproval', 'edit');
  await tx(async (conn) => {
    const row = await lockRequest(conn, req.params.ref);
    if (row.status !== 'Pending Admin Approval') throw wrongStatus(row);
    if (approve) {
      const lines = await q('SELECT * FROM request_lines WHERE request_id = ? ORDER BY line_no', [row.id], conn);
      let partial = false; let any = false;
      for (let i = 0; i < lines.length; i++) {
        const v = Number(qtyMap?.[i]);
        if (!Number.isInteger(v) || v < 0 || v > lines[i].qty) throw bad('Approved quantity must be between 0 and the quantity requested.');
        if (v < lines[i].qty) partial = true;
        if (v > 0) any = true;
        await q('UPDATE request_lines SET approved_qty = ? WHERE id = ?', [v, lines[i].id], conn);
      }
      if (lines.length && !any) throw bad('Approve at least one item, or reject the request.');
      await q("UPDATE requests SET status = 'Approved' WHERE id = ?", [row.id], conn);
      await history(conn, row.id, req.user.name, partial ? 'Admin approved (partial quantity)' : 'Admin approved', comment);
    } else {
      if (!comment?.trim()) throw bad('Write a reason before rejecting.');
      await q("UPDATE requests SET status = 'Rejected', rejected_at = 'admin', rejection_reason = ? WHERE id = ?", [comment, row.id], conn);
      await history(conn, row.id, req.user.name, 'Admin rejected', comment);
    }
  });
  res.json({ ok: true });
});

// ---------- issue stationery (reduces stock) ----------
r.post('/:ref/issue', async (req, res) => {
  const { issuedMap, receivedBy } = req.body || {};
  need(req.user, 'issue', 'edit');
  if (!receivedBy?.trim()) throw bad('Enter who received the items.');
  await tx(async (conn) => {
    const row = await lockRequest(conn, req.params.ref);
    if (row.type !== 'stationery') throw bad('This is not a stationery request.');
    if (row.status !== 'Approved') throw wrongStatus(row);
    const lines = await q('SELECT l.*, i.name AS item_name FROM request_lines l JOIN items i ON i.id = l.item_id WHERE l.request_id = ? ORDER BY l.line_no', [row.id], conn);
    for (let i = 0; i < lines.length; i++) {
      const v = Number(issuedMap?.[i]);
      if (!Number.isInteger(v) || v < 0 || v > (lines[i].approved_qty ?? lines[i].qty)) throw bad('Issued quantity cannot be more than the approved quantity.');
      const upd = await q('UPDATE items SET stock = stock - ? WHERE id = ? AND stock >= ?', [v, lines[i].item_id, v], conn);
      if (!upd.affectedRows) throw bad(`Not enough stock for ${lines[i].item_name}.`);
      await q('UPDATE request_lines SET issued_qty = ? WHERE id = ?', [v, lines[i].id], conn);
    }
    await q("UPDATE requests SET status = 'Issued / Completed', received_by = ?, issued_at = ? WHERE id = ?", [receivedBy.trim(), now(), row.id], conn);
    await history(conn, row.id, req.user.name, `Issued items. Received by ${receivedBy.trim()}`);
  });
  res.json({ ok: true });
});

// ---------- assign a vehicle (and driver) ----------
r.post('/:ref/assign-vehicle', async (req, res) => {
  const { vehicleId, driverId, receivedBy } = req.body || {};
  need(req.user, 'issue', 'edit');
  if (!vehicleId) throw bad('Choose a vehicle to assign.');
  if (!receivedBy?.trim()) throw bad('Enter who received the vehicle.');
  await tx(async (conn) => {
    const row = await lockRequest(conn, req.params.ref);
    if (row.type !== 'vehicle') throw bad('This is not a vehicle request.');
    if (!['Approved', 'No Vehicle Available'].includes(row.status)) throw wrongStatus(row);
    // FOR UPDATE locks this vehicle, so two people cannot assign it at the same moment
    const [v] = await q('SELECT id, number, status FROM vehicles WHERE id = ? AND active = 1 FOR UPDATE', [vehicleId], conn);
    if (!v) throw bad('That vehicle is not available.');
    if (v.status !== 'available') throw bad(`${v.number} is under repair or out of service. Choose another vehicle.`);
    // A vehicle stays taken until the trip it is assigned to is marked completed
    const [taken] = await q(
      "SELECT id FROM requests WHERE type = 'vehicle' AND status = 'Approved' AND trip_vehicle_id = ? AND id <> ? LIMIT 1",
      [v.id, row.id], conn);
    if (taken) throw bad(`${v.number} is assigned to ${REQ(taken.id)} and that trip is not completed yet. Choose another vehicle.`);
    if (driverId) {
      const [d] = await q('SELECT id, name FROM drivers WHERE id = ? AND active = 1', [driverId], conn);
      if (!d) throw bad('That driver is not available.');
      // A driver cannot be on two trips at the same time (trip times are 'YYYY-MM-DDTHH:mm' text, so they compare correctly)
      const [clash] = await q(
        "SELECT id FROM requests WHERE type = 'vehicle' AND status = 'Approved' AND trip_driver_id = ? AND id <> ? AND trip_start < ? AND trip_end > ? LIMIT 1",
        [d.id, row.id, row.trip_end, row.trip_start], conn);
      if (clash) throw bad(`${d.name} is already on trip ${REQ(clash.id)} at that time. Choose another driver.`);
    }
    await q("UPDATE requests SET status = 'Approved', trip_vehicle_id = ?, trip_driver_id = ?, received_by = ?, issued_at = ? WHERE id = ?",
      [v.id, driverId || null, receivedBy.trim(), now(), row.id], conn);
    await history(conn, row.id, req.user.name, `Vehicle ${v.number} assigned. Received by ${receivedBy.trim()}`);
  });
  res.json({ ok: true });
});

// ---------- Admin cannot find a free vehicle: the requester sees "No Vehicle Available" ----------
r.post('/:ref/no-vehicle', async (req, res) => {
  const { comment } = req.body || {};
  need(req.user, 'issue', 'edit');
  await tx(async (conn) => {
    const row = await lockRequest(conn, req.params.ref);
    if (row.type !== 'vehicle' || row.status !== 'Approved' || row.trip_vehicle_id) throw wrongStatus(row);
    await q("UPDATE requests SET status = 'No Vehicle Available' WHERE id = ?", [row.id], conn);
    await history(conn, row.id, req.user.name, 'No vehicle available. Waiting for a vehicle to be free', (comment || '').trim().slice(0, 500));
  });
  res.json({ ok: true });
});

// ---------- trip finished: the vehicle is free again ----------
r.post('/:ref/complete-trip', async (req, res) => {
  need(req.user, 'issue', 'edit');
  await tx(async (conn) => {
    const row = await lockRequest(conn, req.params.ref);
    if (row.type !== 'vehicle' || row.status !== 'Approved' || !row.trip_vehicle_id) throw wrongStatus(row);
    await q("UPDATE requests SET status = 'Issued / Completed', trip_completed_at = ? WHERE id = ?", [now(), row.id], conn);
    await history(conn, row.id, req.user.name, 'Trip completed. Vehicle is free again');
  });
  res.json({ ok: true });
});

// ---------- change the trip end time ----------
r.post('/:ref/extend-trip', async (req, res) => {
  const { newEnd } = req.body || {};
  need(req.user, 'issue', 'edit');
  await tx(async (conn) => {
    const row = await lockRequest(conn, req.params.ref);
    if (row.type !== 'vehicle' || row.status !== 'Approved') throw wrongStatus(row);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(newEnd || '') || newEnd <= row.trip_start) throw bad('The new end time must be after the start time.');
    await history(conn, row.id, req.user.name, `Trip end time changed from ${row.trip_end.replace('T', ' ')} to ${newEnd.replace('T', ' ')}`);
    await q('UPDATE requests SET trip_end = ? WHERE id = ?', [newEnd, row.id], conn);
  });
  res.json({ ok: true });
});

export default r;