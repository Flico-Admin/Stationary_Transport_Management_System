// All the report calculations. The Reports screen only shows what this file returns.
import { REQUEST_STATUSES } from './data/mock.js';

export const PENDING = ['Pending HOD Approval', 'Pending Admin Approval'];
export const DONE = ['Approved', 'Issued / Completed'];
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : '');

// Which locations may this person see reports for?
//  - Admin / IT (permission "Reports for all locations"): every location
//  - HOD: the locations they approve for, plus their own location
export function scopeUnitIds(db, user, seeAll, covers) {
  if (seeAll) return new Set(db.units.map((u) => u.id));
  const ids = new Set(db.units.filter((u) => covers(u.id)).map((u) => u.id));
  if (user) ids.add(user.unitId);
  return ids;
}

// Requests inside the person's scope, then narrowed by the filters on screen
export function filterRequests(db, scopeIds, { loc, type, from, to }) {
  return db.requests.filter((r) => {
    const day = String(r.createdAt).slice(0, 10);
    return scopeIds.has(r.unitId)
      && (!loc || r.unitId === Number(loc))
      && (!type || r.type === type)
      && (!from || day >= from)
      && (!to || day <= to);
  });
}

export function summarize(reqs) {
  return {
    total: reqs.length,
    pending: reqs.filter((r) => PENDING.includes(r.status)).length,
    done: reqs.filter((r) => DONE.includes(r.status)).length,
    rejected: reqs.filter((r) => r.status === 'Rejected').length,
  };
}

const withTotal = (rows, cols) => {
  if (rows.length < 2) return rows;
  const sums = cols.map((c) => rows.reduce((s, r) => s + Number(r[c]), 0));
  const row = rows[0].map(() => '');
  row[0] = 'Total';
  cols.forEach((c, i) => { row[c] = sums[i]; });
  return [...rows, row];
};

export function buildReport(db, kind, reqs) {
  const unit = (id) => db.units.find((u) => u.id === id);

  if (kind === 'Requests by location') {
    const m = new Map();
    reqs.forEach((r) => {
      const o = m.get(r.unitId) || { st: 0, ve: 0, pend: 0, done: 0, rej: 0 };
      if (r.type === 'stationery') o.st++; else o.ve++;
      if (PENDING.includes(r.status)) o.pend++; else if (DONE.includes(r.status)) o.done++; else if (r.status === 'Rejected') o.rej++;
      m.set(r.unitId, o);
    });
    const rows = [...m.entries()]
      .map(([id, o]) => [unit(id)?.name || '-', cap(unit(id)?.type), o.st, o.ve, o.st + o.ve, o.pend, o.done, o.rej])
      .sort((a, b) => b[4] - a[4] || a[0].localeCompare(b[0]));
    return { head: ['Location', 'Type', 'Stationery requests', 'Vehicle requests', 'Total', 'Pending', 'Approved or completed', 'Rejected'], rows: withTotal(rows, [2, 3, 4, 5, 6, 7]) };
  }

  if (kind === 'Stationery usage') {
    const m = new Map();
    reqs.filter((r) => r.type === 'stationery' && r.status !== 'Cancelled').forEach((r) => (r.lines || []).forEach((l) => {
      const o = m.get(l.itemId) || { req: 0, app: 0, iss: 0 };
      o.req += l.qty; o.app += l.approvedQty ?? 0; o.iss += l.issuedQty ?? 0;
      m.set(l.itemId, o);
    }));
    const rows = [...m.entries()].map(([id, o]) => {
      const i = db.items.find((x) => x.id === id);
      return [i?.name || '-', i?.unit || '', o.req, o.app, o.iss];
    }).sort((a, b) => b[4] - a[4] || b[2] - a[2]);
    return { head: ['Item', 'Unit', 'Quantity requested', 'Quantity approved', 'Quantity issued'], rows };
  }

  if (kind === 'Stock') {
    return {
      head: ['Code', 'Item', 'Category', 'Unit', 'In stock', 'Minimum', 'Low stock'],
      rows: db.items.filter((i) => i.active).map((i) => [i.code, i.name, i.category, i.unit, i.stock, i.min, i.stock <= i.min ? 'Yes' : 'No']),
    };
  }

  if (kind === 'Vehicle usage') {
    const m = new Map();
    reqs.filter((r) => r.type === 'vehicle' && r.trip?.vehicleId).forEach((r) => {
      const o = m.get(r.trip.vehicleId) || { done: 0, active: 0, pax: 0, by: {} };
      if (r.status === 'Issued / Completed') o.done++; else if (r.status === 'Approved') o.active++;
      o.pax += Number(r.trip.passengers) || 0;
      o.by[r.dept] = (o.by[r.dept] || 0) + 1;
      m.set(r.trip.vehicleId, o);
    });
    const rows = [...m.entries()].map(([id, o]) => {
      const v = db.vehicles.find((x) => x.id === id);
      return [v?.number || '-', v?.type || '', o.done, o.active, o.pax, Object.entries(o.by).map(([d, n]) => `${d} (${n})`).join(', ')];
    }).sort((a, b) => (b[2] + b[3]) - (a[2] + a[3]));
    return { head: ['Vehicle', 'Type', 'Completed trips', 'In progress', 'Passengers carried', 'By location'], rows: withTotal(rows, [2, 3, 4]) };
  }

  // Request status summary
  const rows = REQUEST_STATUSES.map((s) => {
    const st = reqs.filter((r) => r.status === s && r.type === 'stationery').length;
    const ve = reqs.filter((r) => r.status === s && r.type === 'vehicle').length;
    return [s, st, ve, st + ve];
  });
  return { head: ['Status', 'Stationery', 'Vehicle', 'Total'], rows: withTotal(rows, [1, 2, 3]) };
}