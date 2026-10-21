// App state + actions. All data now comes from the backend (see src/api.js).
// Every action calls the server, then reloads the data, so the screen always shows what is in the database.
import { createContext, useContext, useEffect, useState } from 'react';
import { canDo } from './permissions.js';
import { api, getToken, setToken } from './api.js';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const ts = (x) => new Date(x).getTime();
const overlap = (aS, aE, bS, bE) => aS < bE && aE > bS;
// A vehicle that is assigned to an approved trip is taken until the Admin marks that trip completed
// (a trip can run late, so the end time alone is not proof that the vehicle is back).
// The server sends these open trips with every vehicle (v.openTrips), so every user sees the same availability.

// Why this vehicle cannot be assigned to this request (empty list = it is free to assign).
// Each item has a short label for the drop-down and a full sentence for the message.
export function vehicleConflicts(db, req, vehicleId) {
  if (!vehicleId) return [];
  const out = [];
  const v = db.vehicles.find((x) => x.id === Number(vehicleId));
  if (!v) return out;
  if (v.status !== 'available') out.push({ short: 'under repair', text: `${v.number} is under repair or out of service.` });
  (v.openTrips || []).forEach((t) => {
    if (t.id && t.id === req?.id) return;
    out.push({ short: `on ${t.id || 'a trip'}`, text: `${v.number} is assigned to ${t.id || 'another trip'} and that trip is not completed yet.` });
  });
  return out;
}

// Live state of a vehicle. It is free again only when the Admin marks its trip completed.
// The manual status on the vehicle is only for repairs and out-of-service vehicles.
export function vehicleState(db, v, at = Date.now()) {
  if (v.status !== 'available') return { label: 'Not available', tone: 'bad', note: 'Under repair or out of service' };
  const mine = [...(v.openTrips || [])];
  const out = mine.find((t) => ts(t.start) <= at);
  if (out) {
    return at > ts(out.end)
      ? { label: 'Overdue', tone: 'bad', note: `${out.id || 'A trip'} was due back ${out.end.replace('T', ' ')}` }
      : { label: 'In use', tone: 'wait', note: `${out.id || 'A trip'}, due back ${out.end.replace('T', ' ')}` };
  }
  const next = mine.sort((x, y) => ts(x.start) - ts(y.start))[0];
  return next
    ? { label: 'Assigned', tone: 'wait', note: `${next.id || 'A trip'}, trip starts ${next.start.replace('T', ' ')}` }
    : { label: 'Available', tone: 'ok', note: '' };
}

// Vehicles that can be requested right now, and the numbers shown on the dashboard
export const availableVehicles = (db) => db.vehicles.filter((v) => v.active && vehicleState(db, v).label === 'Available');
export function fleetCounts(db) {
  const list = db.vehicles.filter((v) => v.active);
  const c = { total: list.length, available: 0, onTrip: 0, repair: 0 };
  list.forEach((v) => {
    const s = vehicleState(db, v).label;
    if (s === 'Available') c.available++; else if (s === 'Not available') c.repair++; else c.onTrip++;
  });
  return c;
}

// ---- Drivers: same idea as vehicles. A driver is busy while on an assigned trip that is not completed yet.
const holdsDriver = (r, driverId) => r.type === 'vehicle' && r.trip?.driverId === Number(driverId) && r.status === 'Approved';

// Trips that make this driver unavailable for this request:
//  - another trip at the same time, or
//  - a trip that is past its end time but not marked completed yet (the driver may still be out)
export function driverConflicts(db, req, driverId) {
  if (!driverId || !req?.trip) return [];
  const now = Date.now();
  return db.requests
    .filter((o) => o.id !== req.id && holdsDriver(o, driverId)
      && (now > ts(o.trip.end) || overlap(ts(req.trip.start), ts(req.trip.end), ts(o.trip.start), ts(o.trip.end))))
    .map((o) => (now > ts(o.trip.end)
      ? `${o.id} (past its end time and not marked completed yet)`
      : `${o.id} (${o.trip.start.replace('T', ' ')} to ${o.trip.end.replace('T', ' ')})`));
}

export function driverState(db, d, at = Date.now()) {
  const mine = db.requests.filter((r) => holdsDriver(r, d.id));
  const out = mine.find((r) => ts(r.trip.start) <= at);
  if (out) {
    return at > ts(out.trip.end)
      ? { label: 'Overdue', tone: 'bad', note: `${out.id} was due back ${out.trip.end.replace('T', ' ')}` }
      : { label: 'On a trip', tone: 'wait', note: `${out.id}, until ${out.trip.end.replace('T', ' ')}` };
  }
  const next = mine.filter((r) => ts(r.trip.start) > at).sort((x, y) => ts(x.trip.start) - ts(y.trip.start))[0];
  return { label: 'Available', tone: 'ok', note: next ? `Next trip ${next.trip.start.replace('T', ' ')}` : '' };
}

// Whose HOD signs requests from a unit: its own, or another unit's (showrooms and warehouses -> Operations)
export const approverUnitId = (db, unitId) => db.units.find((x) => x.id === unitId)?.approverUnitId || unitId;
// Is this user the approving HOD for this request? (IT has full control, so it can act on any request)
export const hodCovers = (db, user, r) => !!user && (user.role === 'it' || approverUnitId(db, r.unitId) === user.unitId);

const EMPTY = {
  roles: {}, units: [], users: [], categories: [], items: [], vehicles: [], drivers: [], suppliers: [],
  purchaseOrders: [], maintenance: [], fuel: [], requests: [], audit: [],
  utilityAccounts: [], utilityBills: [], buildingJobs: [],
};

export function StoreProvider({ children }) {
  const [db, setDb] = useState(EMPTY);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(!!getToken());   // true while we restore a saved login
  const [toast, setToast] = useState('');

  const user = db.users.find((u) => u.id === userId) || null;
  const can = (module, action = 'view') => canDo(user, db.roles, module, action);
  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  // The page address is kept in the URL (#/users). Go back to the dashboard on login and logout,
  // so the next person never lands on the page the previous person was looking at.
  const goHome = () => { window.location.hash = '#/'; };

  const logout = () => { setToken(null); setUserId(null); setDb(EMPTY); goHome(); };

  // Load everything this user is allowed to see from the database
  const reload = async () => {
    const data = await api('GET', '/bootstrap');
    setDb(data.db);
    setUserId(data.userId);
  };

  // Stay logged in after a page refresh
  useEffect(() => {
    if (!getToken()) return;
    reload().catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    try {
      const { token } = await api('POST', '/auth/login', { email, password });
      setToken(token);
      goHome();
      await reload();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  // Runs one backend call, refreshes the data, shows the message. Errors from the server show as a message.
  const run = async (fn, okMsg) => {
    try {
      const result = await fn();
      await reload();
      if (okMsg) notify(okMsg);
      return result;
    } catch (e) {
      if (e.status === 401) { logout(); return; }
      notify(e.message);
    }
  };

  const act = {
    // ---------- requests ----------
    createRequest: (data) => run(async () => { const r = await api('POST', '/requests', data); notify(`Request ${r.id} submitted`); return r.id; }),
    cancel: (id) => run(() => api('POST', `/requests/${id}/cancel`), 'Request cancelled'),
    hodDecision: (id, approve, comment) =>
      run(() => api('POST', `/requests/${id}/hod-decision`, { approve, comment }), approve ? 'Sent to Admin department' : 'Request rejected'),
    adminDecision: (id, approve, comment, qtyMap) =>
      run(() => api('POST', `/requests/${id}/admin-decision`, { approve, comment, qtyMap }), approve ? 'Request approved' : 'Request rejected'),
    issueStationery: (id, issuedMap, receivedBy) =>
      run(() => api('POST', `/requests/${id}/issue`, { issuedMap, receivedBy }), 'Items issued and stock updated'),
    assignVehicle: (id, vehicleId, driverId, receivedBy) =>
      run(() => api('POST', `/requests/${id}/assign-vehicle`, { vehicleId, driverId, receivedBy }), 'Vehicle assigned'),
    noVehicle: (id, comment) => run(() => api('POST', `/requests/${id}/no-vehicle`, { comment }), 'Marked as no vehicle available'),
    completeTrip: (id) => run(() => api('POST', `/requests/${id}/complete-trip`), 'Trip completed. The vehicle is free again'),
    extendTrip: (id, newEnd) => run(() => api('POST', `/requests/${id}/extend-trip`, { newEnd }), 'Trip end time updated'),

    // ---------- generic master data (items, vehicles, drivers, suppliers) ----------
    save: (collection, record) => run(() => api('POST', `/${collection}/save`, record), 'Saved'),
    setActive: (collection, id, active) => run(() => api('POST', `/${collection}/${id}/active`, { active })),
    // every delivery is saved with its own price (stock batch), so costs follow the real purchase prices
    addStock: (itemId, { qty, unitPrice, receivedDate, note }) =>
      run(() => api('POST', `/items/${itemId}/stock`, { qty: Number(qty), unitPrice: Number(unitPrice), receivedDate, note }), 'Stock added'),
    setBatchPrice: (batchId, unitPrice) => run(() => api('POST', `/items/batches/${batchId}/price`, { unitPrice: Number(unitPrice) }), 'Price corrected'),
    addCategory: (name) => run(() => api('POST', '/categories', { name })),

    // ---------- purchase orders ----------
    createPO: (supplierId, lines) => run(() => api('POST', '/purchase-orders', { supplierId: Number(supplierId), lines }), 'Purchase order created'),
    setPOStatus: (id, status) => run(() => api('POST', `/purchase-orders/${id}/status`, { status }), `Purchase order ${status.toLowerCase()}`),

    // ---------- vehicles: maintenance and fuel ----------
    addMaintenance: (rec) => run(() => api('POST', '/maintenance', rec), 'Maintenance record saved'),
    markRepaired: (recId) => run(() => api('POST', `/maintenance/${recId}/repaired`), 'Vehicle is available again'),
    addFuel: (rec) => run(() => api('POST', '/fuel', rec), 'Fuel record saved'),

    // ---------- utility bills (Admin department) ----------
    saveUtilityAccount: (a) => run(() => api('POST', '/utility-accounts/save', a), 'Account saved'),
    setUtilityAccountActive: (id, active) => run(() => api('POST', `/utility-accounts/${id}/active`, { active })),
    saveUtilityBill: (b) => run(() => api('POST', '/utility-bills/save', b), 'Bill saved'),
    payUtilityBill: (id, paidDate, ref) => run(() => api('POST', `/utility-bills/${id}/pay`, { paidDate, ref }), 'Bill marked as paid'),
    unpayUtilityBill: (id) => run(() => api('POST', `/utility-bills/${id}/unpay`), 'Bill marked as unpaid'),
    deleteUtilityBill: (id) => run(() => api('POST', `/utility-bills/${id}/delete`), 'Bill deleted'),

    // ---------- building maintenance (Admin department) ----------
    saveBuildingJob: (j) => run(() => api('POST', '/building-jobs/save', j), 'Job saved'),
    setBuildingJobStatus: (id, body) => run(() => api('POST', `/building-jobs/${id}/status`, body), `Job marked ${body.status.toLowerCase()}`),
    deleteBuildingJob: (id) => run(() => api('POST', `/building-jobs/${id}/delete`), 'Job deleted'),

    // ---------- departments, showrooms and warehouses ----------
    saveUnit: (u) => run(() => api('POST', '/units/save', u), 'Saved'),
    setUnitActive: (id, active) => run(() => api('POST', `/units/${id}/active`, { active })),

    // ---------- users and permissions (all changes audited, FR-10) ----------
    saveUser: (u) => run(() => api('POST', '/users/save', u), 'User saved'),
    setUserActive: (id, active) => run(() => api('POST', `/users/${id}/active`, { active })),
    toggleRolePerm: (role, module, action) => run(() => api('POST', `/roles/${role}/perm`, { module, action })),
    toggleUserPerm: (id, module, action) => run(() => api('POST', `/users/${id}/perm`, { module, action })),
    addRole: (label) => run(() => api('POST', '/roles', { label })),
  };

  const value = { db, user, can, act, toast, loading, login, logout };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}