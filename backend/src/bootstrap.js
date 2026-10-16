// Builds the complete data object the frontend expects (same shape as the old mock.js),
// limited to what the logged-in user is allowed to see.
import { q } from './db.js';
import { can } from './permissions.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);
const group = (rows, key) => { const m = new Map(); rows.forEach((r) => { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); }); return m; };
export const REQ = (n) => `REQ-${n}`;
export const PO = (n) => `PO-${n}`;

export async function buildDb(user) {
  // ----- roles -----
  const roleRows = await q('SELECT role_key, label FROM roles ORDER BY role_key');
  const rpRows = await q('SELECT role_key, module, action FROM role_permissions');
  const roles = {};
  roleRows.forEach((r) => { roles[r.role_key] = { label: r.label, perms: {} }; });
  rpRows.forEach((r) => { (roles[r.role_key].perms[r.module] ||= []).push(r.action); });

  // ----- units and users -----
  const units = (await q('SELECT id, name, type, approver_unit_id AS approverUnitId, active FROM units ORDER BY id'))
    .map((u) => ({ ...u, active: !!u.active }));
  const upRows = await q('SELECT user_id, module, action FROM user_permissions');
  const extraBy = group(upRows, 'user_id');
  const users = (await q(
    `SELECT u.id, u.name, u.email, u.role_key AS role, u.unit_id AS unitId, un.name AS dept, u.active
       FROM users u JOIN units un ON un.id = u.unit_id ORDER BY u.id`)).map((u) => {
    const extra = {};
    (extraBy.get(u.id) || []).forEach((r) => { (extra[r.module] ||= []).push(r.action); });
    return { ...u, active: !!u.active, extra };
  });

  // ----- stationery -----
  const categories = (await q('SELECT name FROM categories ORDER BY id')).map((c) => c.name);
  const items = (await q(
    `SELECT i.id, i.code, i.name, c.name AS category, i.unit, i.description, i.stock, i.min_stock AS min, i.active
       FROM items i JOIN categories c ON c.id = i.category_id ORDER BY i.id`)).map((i) => ({ ...i, active: !!i.active }));

  // ----- vehicles, drivers, suppliers -----
  // Trips that are assigned a vehicle and not completed yet. This is sent to everyone, so every user can see how many
  // vehicles are free (employees only see their own requests). The request number is only shown to people who manage vehicles.
  const showTripIds = can(user, 'vehicles', 'view') || can(user, 'issue', 'view');
  const openTrips = group(await q(
    `SELECT id, trip_vehicle_id, trip_start, trip_end FROM requests
      WHERE type = 'vehicle' AND status = 'Approved' AND trip_vehicle_id IS NOT NULL`), 'trip_vehicle_id');
  const vehicles = (await q('SELECT id, number, type, capacity, status, active FROM vehicles ORDER BY id')).map((v) => ({
    ...v, active: !!v.active,
    openTrips: (openTrips.get(v.id) || []).map((t) => ({ id: showTripIds ? REQ(t.id) : '', start: t.trip_start, end: t.trip_end })),
  }));
  const drivers = (await q('SELECT id, name, phone, active FROM drivers ORDER BY id')).map((v) => ({ ...v, active: !!v.active }));
  const suppliers = (await q('SELECT id, name, contact, active FROM suppliers ORDER BY id')).map((v) => ({ ...v, active: !!v.active }));

  // ----- purchase orders -----
  const poRows = await q('SELECT id, supplier_id AS supplierId, status, created_at FROM purchase_orders ORDER BY id DESC');
  const poLines = group(await q('SELECT po_id, item_id AS itemId, qty FROM purchase_order_lines ORDER BY id'), 'po_id');
  const poHist = group(await q('SELECT po_id, at, by_name, action FROM purchase_order_history ORDER BY id'), 'po_id');
  const purchaseOrders = poRows.map((p) => ({
    id: PO(p.id), supplierId: p.supplierId, status: p.status, createdAt: iso(p.created_at),
    lines: (poLines.get(p.id) || []).map((l) => ({ itemId: l.itemId, qty: l.qty })),
    history: (poHist.get(p.id) || []).map((h) => ({ at: iso(h.at), by: h.by_name, action: h.action })),
  }));

  // ----- maintenance and fuel (only for people who manage them or may see the cost report) -----
  const seesCosts = can(user, 'maintenance', 'view') || can(user, 'costReports', 'view');
  const maintenance = !seesCosts ? [] : (await q(
    `SELECT id, vehicle_id AS vehicleId, DATE_FORMAT(date,'%Y-%m-%d') AS date, type, details, cost,
            DATE_FORMAT(next_service,'%Y-%m-%d') AS nextService, under_repair AS underRepair
       FROM maintenance ORDER BY date DESC, id DESC`))
    .map((m) => ({ ...m, cost: Number(m.cost), nextService: m.nextService || '', underRepair: !!m.underRepair }));
  const fuel = !seesCosts ? [] : (await q(
    `SELECT id, vehicle_id AS vehicleId, DATE_FORMAT(date,'%Y-%m-%d') AS date, litres, cost, meter FROM fuel_logs ORDER BY date DESC, id DESC`))
    .map((f) => ({ ...f, litres: Number(f.litres), cost: Number(f.cost) }));

  // ----- requests: everyone sees their own; approvers / admin / IT see all -----
  const seesAll = ['allRequests', 'hodApproval', 'adminApproval', 'issue'].some((m) => can(user, m, 'view'));
  const reqRows = await q(
    `SELECT r.*, un.name AS dept, DATE_FORMAT(r.required_date,'%Y-%m-%d') AS required_date_s
       FROM requests r JOIN units un ON un.id = r.unit_id
       ${seesAll ? '' : 'WHERE r.user_id = ?'} ORDER BY r.id DESC`, seesAll ? [] : [user.id]);
  const ids = reqRows.map((r) => r.id);
  const lineBy = ids.length ? group(await q('SELECT * FROM request_lines WHERE request_id IN (?) ORDER BY line_no', [ids]), 'request_id') : new Map();
  const histBy = ids.length ? group(await q('SELECT * FROM request_history WHERE request_id IN (?) ORDER BY id', [ids]), 'request_id') : new Map();
  const requests = reqRows.map((r) => {
    const out = {
      id: REQ(r.id), type: r.type, userId: r.user_id, dept: r.dept, unitId: r.unit_id, status: r.status,
      createdAt: iso(r.created_at), note: r.note || '',
      history: (histBy.get(r.id) || []).map((h) => ({ at: iso(h.at), by: h.by_name, action: h.action, ...(h.comment ? { comment: h.comment } : {}) })),
    };
    if (r.type === 'stationery') {
      out.requiredDate = r.required_date_s || '';
      out.lines = (lineBy.get(r.id) || []).map((l) => ({
        itemId: l.item_id, qty: l.qty,
        ...(l.approved_qty != null ? { approvedQty: l.approved_qty } : {}),
        ...(l.issued_qty != null ? { issuedQty: l.issued_qty } : {}),
      }));
    } else {
      out.trip = {
        purpose: r.trip_purpose, from: r.trip_from, to: r.trip_to, start: r.trip_start, end: r.trip_end,
        passengers: r.trip_passengers, vehicleType: r.trip_vehicle_type,
        vehicleId: r.trip_vehicle_id, driverId: r.trip_driver_id, completedAt: iso(r.trip_completed_at),
      };
    }
    if (r.rejected_at) { out.rejectedAt = r.rejected_at; out.rejectionReason = r.rejection_reason; }
    if (r.received_by) out.receivedBy = r.received_by;
    if (r.issued_at) out.issuedAt = iso(r.issued_at);
    return out;
  });

  // ----- logs (only for people allowed to see them) -----
  const audit = can(user, 'users', 'view')
    ? (await q('SELECT at, by_name AS `by`, text FROM audit_log ORDER BY id DESC LIMIT 500')).map((a) => ({ ...a, at: iso(a.at) })) : [];

  return { roles, units, users, categories, items, vehicles, drivers, suppliers, purchaseOrders, maintenance, fuel, requests, audit };
}