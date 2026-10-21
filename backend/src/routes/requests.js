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

// ---------- validation helpers ----------
const MAX_QTY = 10000;        // biggest quantity allowed on one item line
const MAX_LINES = 50;         // most item lines in one stationery request
const MAX_PASSENGERS = 100;   // most passengers on one trip
const TZ = process.env.APP_TZ || 'Asia/Colombo';   // company time zone (trip times are typed in this time zone)

// Current time in the company time zone, as 'YYYY-MM-DDTHH:mm' (same shape as trip_start / trip_end)
const localNow = () => new Date().toLocaleString('sv-SE', { timeZone: TZ, hour12: false }).slice(0, 16).replace(' ', 'T');
const localToday = () => localNow().slice(0, 10);
const isRealDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const isRealDateTime = (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s || '') && !isNaN(new Date(`${s}:00Z`)) && new Date(`${s}:00Z`).toISOString().slice(0, 16) === s;
const clean = (v) => (typeof v === 'string' ? v.trim() : '');   // text only, trimmed (a number or object becomes '')

// Nobody may approve or reject their own request (another person must do it)
const notOwn = (row, user, what) => {
  if (row.user_id === user.id) throw forbidden(`You cannot ${what} your own request. Another person must do this.`);
};
// A vehicle trip whose end time is already over cannot be approved any more
const tripPassed = (row) => row.type === 'vehicle' && !!row.trip_end && row.trip_end < localNow();
const PASSED_MSG = 'The trip time of this request has already passed, so it cannot be approved. Reject it and ask the requester to send a new request.';
// A reason for rejecting: at least 3 characters, at most 1000
const reasonOf = (comment) => {
  const c = clean(comment);
  if (c.length > 1000) throw bad('The comment is too long (maximum 1000 characters).');
  return c;
};

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

// Validation: Admin can decide on a request only after the HOD step is finished.
// Finished = HOD approved it, or HOD approval was skipped because the requester is the approving HOD.
async function hodStepDone(conn, requestId) {
  const rows = await q(
    "SELECT id FROM request_history WHERE request_id = ? AND (action = 'HOD approved' OR action LIKE 'HOD approval skipped%') LIMIT 1",
    [requestId], conn);
  return rows.length > 0;
}
const wrongStatus = (row) => bad(`This request is now "${row.status}", so this action is not possible.`);

// ---------- create ----------
r.post('/', async (req, res) => {
  const u = req.user; const b = req.body || {};
  need(u, 'requests', 'add');
  if (!['stationery', 'vehicle'].includes(b.type)) throw bad('Request type must be stationery or vehicle.');
  const note = clean(b.note);
  if (note.length > 1000) throw bad('The note is too long (maximum 1000 characters).');
  const id = await tx(async (conn) => {
    const selfApprover = can(u, 'hodApproval', 'edit') && (await approverUnit(conn, u.unitId)) === u.unitId;
    const status = selfApprover ? 'Pending Admin Approval' : 'Pending HOD Approval';
    let result;
    if (b.type === 'stationery') {
      const lines = Array.isArray(b.lines) ? b.lines : [];
      if (!lines.length) throw bad('Add at least one item with a quantity.');
      if (lines.length > MAX_LINES) throw bad(`A request can have at most ${MAX_LINES} items.`);
      if (!isRealDate(b.requiredDate)) throw bad('Choose the date you need the items.');
      if (b.requiredDate < localToday()) throw bad('The date you need the items cannot be in the past.');
      const seen = new Set();
      for (const l of lines) {
        if (!isInt(l.itemId) || !isInt(l.qty) || Number(l.qty) < 1) throw bad('Every line needs an item and a quantity of 1 or more.');
        if (Number(l.qty) > MAX_QTY) throw bad(`A quantity cannot be more than ${MAX_QTY}.`);
        if (seen.has(Number(l.itemId))) throw bad('An item appears twice. Combine them into one line.');
        seen.add(Number(l.itemId));
        const [it] = await q('SELECT id, active FROM items WHERE id = ?', [l.itemId], conn);
        if (!it || !it.active) throw bad('One of the items is not available.');
      }
      result = await q('INSERT INTO requests (type, user_id, unit_id, status, created_at, required_date, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['stationery', u.id, u.unitId, status, now(), b.requiredDate, note], conn);
      for (let i = 0; i < lines.length; i++) {
        await q('INSERT INTO request_lines (request_id, line_no, item_id, qty) VALUES (?, ?, ?, ?)', [result.insertId, i, lines[i].itemId, lines[i].qty], conn);
      }
    } else {
      const t = b.trip || {};
      const purpose = clean(t.purpose); const from = clean(t.from); const to = clean(t.to);
      if (!purpose || !from || !to || !t.start || !t.end) throw bad('Fill in the purpose, pickup, destination and both date and times.');
      if (purpose.length > 255 || from.length > 255 || to.length > 255) throw bad('The purpose, pickup and destination can each be at most 255 characters.');
      if (!isRealDateTime(t.start) || !isRealDateTime(t.end)) throw bad('Enter a valid start and end date and time.');
      if (t.start < localNow()) throw bad('The trip cannot start in the past. Choose a later start time.');
      if (t.end <= t.start) throw bad('The end time must be after the start time.');
      const passengers = Number(t.passengers);
      if (!Number.isInteger(passengers) || passengers < 1 || passengers > MAX_PASSENGERS) throw bad(`Passengers must be a whole number between 1 and ${MAX_PASSENGERS}.`);
      // The same person cannot book two vehicles for the same time
      const [mine] = await q(
        `SELECT id FROM requests WHERE type = 'vehicle' AND user_id = ?
            AND status IN ('Pending HOD Approval', 'Pending Admin Approval', 'Approved', 'No Vehicle Available')
            AND trip_start < ? AND trip_end > ? LIMIT 1`, [u.id, t.end, t.start], conn);
      if (mine) throw bad(`You already have a vehicle request (${REQ(mine.id)}) for that time. Cancel it first or choose another time.`);
      // Only a vehicle type that has a free vehicle with enough seats right now can be requested
      // (free = active, not under repair, and not assigned to a trip that is still open)
      const [free] = await q(
        `SELECT v.type FROM vehicles v
          WHERE v.active = 1 AND v.status = 'available' AND v.type = ? AND v.capacity >= ?
            AND NOT EXISTS (SELECT 1 FROM requests r WHERE r.type = 'vehicle' AND r.status = 'Approved' AND r.trip_vehicle_id = v.id)
          LIMIT 1`, [t.vehicleType || '', passengers], conn);
      if (!free) throw bad(`No ${t.vehicleType || 'vehicle'} with ${passengers} or more seats is available right now. Choose another vehicle type, fewer passengers, or try again later.`);
      result = await q(
        `INSERT INTO requests (type, user_id, unit_id, status, created_at, note, trip_purpose, trip_from, trip_to, trip_start, trip_end, trip_passengers, trip_vehicle_type)
         VALUES ('vehicle', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [u.id, u.unitId, status, now(), note, purpose, from, to, t.start, t.end, passengers, free.type], conn);
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
  if (typeof approve !== 'boolean') throw bad('Send approve as true or false.');
  const text = reasonOf(comment);
  await tx(async (conn) => {
    const row = await lockRequest(conn, req.params.ref);
    if (row.status !== 'Pending HOD Approval') throw wrongStatus(row);
    notOwn(row, req.user, approve ? 'approve' : 'reject');
    const covers = req.user.role === 'it' || (await approverUnit(conn, row.unit_id)) === req.user.unitId;
    if (!covers) throw forbidden('This request belongs to another HOD.');
    if (approve) {
      if (tripPassed(row)) throw bad(PASSED_MSG);
      await q("UPDATE requests SET status = 'Pending Admin Approval' WHERE id = ?", [row.id], conn);
      await history(conn, row.id, req.user.name, 'HOD approved', text);
    } else {
      if (text.length < 3) throw bad('Write a reason (at least 3 characters) before rejecting.');
      await q("UPDATE requests SET status = 'Rejected', rejected_at = 'hod', rejection_reason = ? WHERE id = ?", [text, row.id], conn);
      await history(conn, row.id, req.user.name, 'HOD rejected', text);
    }
  });
  res.json({ ok: true });
});

// ---------- Admin decision (can approve a smaller quantity) ----------
r.post('/:ref/admin-decision', async (req, res) => {
  const { approve, comment, qtyMap } = req.body || {};
  need(req.user, 'adminApproval', 'edit');
  if (typeof approve !== 'boolean') throw bad('Send approve as true or false.');
  const text = reasonOf(comment);
  await tx(async (conn) => {
    const row = await lockRequest(conn, req.params.ref);
    if (row.status === 'Pending HOD Approval') throw bad('The HOD has not approved this request yet. Admin can approve only after the HOD approves.');
    if (row.status !== 'Pending Admin Approval') throw wrongStatus(row);
    // Double check: the HOD step must really be finished (status alone is not trusted)
    if (!(await hodStepDone(conn, row.id))) throw bad('The HOD has not approved this request yet. Admin can approve only after the HOD approves.');
    notOwn(row, req.user, approve ? 'approve' : 'reject');
    if (approve) {
      if (tripPassed(row)) throw bad(PASSED_MSG);
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
      await history(conn, row.id, req.user.name, partial ? 'Admin approved (partial quantity)' : 'Admin approved', text);
    } else {
      if (text.length < 3) throw bad('Write a reason (at least 3 characters) before rejecting.');
      await q("UPDATE requests SET status = 'Rejected', rejected_at = 'admin', rejection_reason = ? WHERE id = ?", [text, row.id], conn);
      await history(conn, row.id, req.user.name, 'Admin rejected', text);
    }
  });
  res.json({ ok: true });
});

// ---------- issue stationery (reduces stock) ----------
r.post('/:ref/issue', async (req, res) => {
  const { issuedMap, receivedBy } = req.body || {};
  need(req.user, 'issue', 'edit');
  const recv = clean(receivedBy);
  if (!recv) throw bad('Enter who received the items.');
  if (recv.length > 100) throw bad('The name of the person who received the items is too long (maximum 100 characters).');
  await tx(async (conn) => {
    const row = await lockRequest(conn, req.params.ref);
    if (row.type !== 'stationery') throw bad('This is not a stationery request.');
    if (row.status !== 'Approved') throw wrongStatus(row);
    const lines = await q('SELECT l.*, i.name AS item_name, i.unit_price AS item_price FROM request_lines l JOIN items i ON i.id = l.item_id WHERE l.request_id = ? ORDER BY l.line_no', [row.id], conn);
    for (let i = 0; i < lines.length; i++) {
      const v = Number(issuedMap?.[i]);
      if (!Number.isInteger(v) || v < 0 || v > (lines[i].approved_qty ?? lines[i].qty)) throw bad('Issued quantity cannot be more than the approved quantity.');
      const upd = await q('UPDATE items SET stock = stock - ? WHERE id = ? AND stock >= ?', [v, lines[i].item_id, v], conn);
      if (!upd.affectedRows) throw bad(`Not enough stock for ${lines[i].item_name}.`);
      await q('UPDATE request_lines SET issued_qty = ?, unit_price = ? WHERE id = ?', [v, lines[i].item_price, lines[i].id], conn);
    }
    await q("UPDATE requests SET status = 'Issued / Completed', received_by = ?, issued_at = ? WHERE id = ?", [recv, now(), row.id], conn);
    await history(conn, row.id, req.user.name, `Issued items. Received by ${recv}`);
  });
  res.json({ ok: true });
});

// ---------- assign a vehicle (and driver) ----------
r.post('/:ref/assign-vehicle', async (req, res) => {
  const { vehicleId, driverId, receivedBy } = req.body || {};
  need(req.user, 'issue', 'edit');
  if (!vehicleId) throw bad('Choose a vehicle to assign.');
  const recv = clean(receivedBy);
  if (!recv) throw bad('Enter who received the vehicle.');
  if (recv.length > 100) throw bad('The name of the person who received the vehicle is too long (maximum 100 characters).');
  await tx(async (conn) => {
    const row = await lockRequest(conn, req.params.ref);
    if (row.type !== 'vehicle') throw bad('This is not a vehicle request.');
    if (!['Approved', 'No Vehicle Available'].includes(row.status)) throw wrongStatus(row);
    // FOR UPDATE locks this vehicle, so two people cannot assign it at the same moment
    const [v] = await q('SELECT id, number, status, capacity FROM vehicles WHERE id = ? AND active = 1 FOR UPDATE', [vehicleId], conn);
    if (!v) throw bad('That vehicle is not available.');
    if (v.status !== 'available') throw bad(`${v.number} is under repair or out of service. Choose another vehicle.`);
    // The vehicle must have enough seats for the passengers
    if (row.trip_passengers && v.capacity < row.trip_passengers) throw bad(`${v.number} has ${v.capacity} seats but this trip needs ${row.trip_passengers}. Choose a bigger vehicle.`);
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
      [v.id, driverId || null, recv, now(), row.id], conn);
    await history(conn, row.id, req.user.name, `Vehicle ${v.number} assigned. Received by ${recv}`);
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
    await history(conn, row.id, req.user.name, 'No vehicle available. Waiting for a vehicle to be free', clean(comment).slice(0, 500));
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
    if (!isRealDateTime(newEnd) || newEnd <= row.trip_start) throw bad('The new end time must be a valid date and time after the start time.');
    // The driver must not be on another trip during the longer time
    if (row.trip_driver_id) {
      const [clash] = await q(
        "SELECT id FROM requests WHERE type = 'vehicle' AND status = 'Approved' AND trip_driver_id = ? AND id <> ? AND trip_start < ? AND trip_end > ? LIMIT 1",
        [row.trip_driver_id, row.id, newEnd, row.trip_start], conn);
      if (clash) throw bad(`The driver is already on trip ${REQ(clash.id)} during that time. Choose an earlier end time or change the driver.`);
    }
    await history(conn, row.id, req.user.name, `Trip end time changed from ${row.trip_end.replace('T', ' ')} to ${newEnd.replace('T', ' ')}`);
    await q('UPDATE requests SET trip_end = ? WHERE id = ?', [newEnd, row.id], conn);
  });
  res.json({ ok: true });
});

export default r;