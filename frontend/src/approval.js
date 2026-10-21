// Approval and form validation helpers (used by the request screens).

// The HOD step is finished when the history shows "HOD approved",
// or "HOD approval skipped" (the requester is the approving HOD himself).
export const hodStepDone = (r) =>
  (r?.history || []).some((h) => h.action === 'HOD approved' || h.action.startsWith('HOD approval skipped'));

// Nobody approves or rejects their own request
export const isOwn = (r, userId) => !!r && r.userId === userId;

// Admin can approve / reject only when: status is "Pending Admin Approval", the HOD step is done,
// and the request is not the Admin's own request.
export const adminCanAct = (r, userId) => r?.status === 'Pending Admin Approval' && hodStepDone(r) && !isOwn(r, userId);

// HOD can approve / reject only when the request is waiting for HOD and is not the HOD's own request
// (whether this HOD covers the unit is checked separately with hodCovers).
export const hodCanAct = (r, userId) => r?.status === 'Pending HOD Approval' && !isOwn(r, userId);

// ---- date helpers (browser time, shaped like the values of <input type="date"> and "datetime-local") ----
const p2 = (n) => String(n).padStart(2, '0');
export const todayText = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const nowText = () => `${todayText()}T${p2(new Date().getHours())}:${p2(new Date().getMinutes())}`;

// A vehicle trip whose end time is already over cannot be approved any more
export const tripPassed = (r) => r?.type === 'vehicle' && !!r.trip?.end && r.trip.end < nowText();

// Limits (same numbers as the server)
export const LIMITS = { qty: 10000, lines: 50, passengers: 100, note: 1000, place: 255, name: 100 };