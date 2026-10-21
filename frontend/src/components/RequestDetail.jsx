import { useState } from 'react';
import { useStore, vehicleConflicts, driverConflicts, hodCovers, approverUnitId } from '../store.jsx';
import { driverMessage, whatsappLink, phoneForWhatsApp } from '../driverMessage.js';
import { Badge, Field, Modal, fmtDT, fmtDate } from './ui.jsx';
import { adminCanAct, hodCanAct, isOwn, tripPassed, LIMITS } from '../approval.js';

const STEPS = ['Submitted', 'HOD approval', 'Admin approval', 'Issued'];

// The approval track is the one thing people look at first: where is my request right now?
function Track({ r }) {
  let current = { 'Pending HOD Approval': 1, 'Pending Admin Approval': 2, Approved: 3, 'No Vehicle Available': 3, 'Issued / Completed': 4 }[r.status];
  const rejected = r.status === 'Rejected';
  const failAt = rejected ? (r.rejectedAt === 'hod' ? 1 : 2) : -1;
  if (r.status === 'Cancelled') current = -1;
  return (
    <ol className="track">
      {STEPS.map((s, i) => {
        const state = rejected ? (i < failAt ? 'done' : i === failAt ? 'fail' : 'todo')
          : r.status === 'Cancelled' ? (i === 0 ? 'done' : 'todo')
          : i < current ? 'done' : i === current ? 'now' : 'todo';
        return <li key={s} className={state}><span className="dot" />{s}</li>;
      })}
    </ol>
  );
}

export default function RequestDetail({ id, onClose }) {
  const { db, user, can, act } = useStore();
  const r = db.requests.find((x) => x.id === id);
  const [comment, setComment] = useState('');
  const [qty, setQty] = useState(() => Object.fromEntries((r?.lines || []).map((l, i) => [i, l.approvedQty ?? l.qty])));
  const [iss, setIss] = useState(() => Object.fromEntries((r?.lines || []).map((l, i) => [i, l.approvedQty ?? l.qty])));
  const [recv, setRecv] = useState('');
  const [vehicleId, setVehicleId] = useState(r?.trip?.vehicleId || '');
  // When the Admin opens an approved vehicle request, start with the first driver who is free at that trip time
  const firstFreeDriver = (r && r.type === 'vehicle' && r.status === 'Approved' && !r.trip?.vehicleId)
    ? db.drivers.find((d) => d.active && driverConflicts(db, r, d.id).length === 0)?.id : null;
  const [driverId, setDriverId] = useState(r?.trip?.driverId || firstFreeDriver || '');
  const [newEnd, setNewEnd] = useState(r?.trip?.end || '');
  const [msgText, setMsgText] = useState(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  if (!r) return null;

  const item = (i) => db.items.find((x) => x.id === i);
  const who = db.users.find((u) => u.id === r.userId);
  const isMine = r.userId === user.id;
  const done = (fn) => { fn(); onClose(); };

  const canCancel = isMine && ['Pending HOD Approval', 'Pending Admin Approval'].includes(r.status);
  const canHod = can('hodApproval', 'edit') && hodCanAct(r, user.id) && hodCovers(db, user, r);   // never your own request
  const approverName = db.units.find((x) => x.id === approverUnitId(db, r.unitId))?.name;
  const canAdmin = can('adminApproval', 'edit') && adminCanAct(r, user.id);   // only after the HOD has approved, never your own request
  const adminBlocked = can('adminApproval', 'edit') && !can('hodApproval', 'edit') && r.status === 'Pending HOD Approval';
  // You are an approver for this step, but it is your own request
  const ownBlocked = isOwn(r, user.id) && ((can('hodApproval', 'edit') && r.status === 'Pending HOD Approval') || (can('adminApproval', 'edit') && r.status === 'Pending Admin Approval'));
  const passed = (canHod || canAdmin) && tripPassed(r);   // the trip time is already over
  const canIssue = can('issue', 'edit') && ['Approved', 'No Vehicle Available'].includes(r.status);

  const reject = (fn) => { if (comment.trim().length < 3) return setErr('Write a reason (at least 3 characters) before rejecting.'); done(() => fn(false, comment.trim())); };

  const approveAdmin = () => {
    const lines = r.lines || []; // vehicle requests have no item lines
    for (let i = 0; i < lines.length; i++) {
      const v = Number(qty[i]);
      if (!Number.isInteger(v) || v < 0 || v > lines[i].qty) return setErr('Approved quantity must be a whole number between 0 and the quantity requested.');
    }
    if (lines.length > 0 && lines.every((_, i) => Number(qty[i]) === 0)) return setErr('Approve at least one item, or reject the request.');
    done(() => act.adminDecision(r.id, true, comment.trim(), qty));
  };

  const issue = () => {
    for (let i = 0; i < r.lines.length; i++) {
      const v = Number(iss[i]); const stock = item(r.lines[i].itemId).stock;
      if (!Number.isInteger(v) || v < 0 || v > (r.lines[i].approvedQty ?? r.lines[i].qty)) return setErr('Issued quantity must be a whole number, not more than the approved quantity.');
      if (v > stock) return setErr(`Not enough stock for ${item(r.lines[i].itemId).name} (only ${stock} left).`);
    }
    if (!recv.trim()) return setErr('Enter who received the items.');
    if (recv.trim().length > LIMITS.name) return setErr('The name is too long (maximum 100 characters).');
    done(() => act.issueStationery(r.id, iss, recv.trim()));
  };

  const assigned = r.type === 'vehicle' && !!r.trip.vehicleId;
  const needsAssign = canIssue && r.type === 'vehicle' && !assigned;
  const canFinish = canIssue && r.type === 'vehicle' && assigned;
  const overdue = canFinish && Date.now() > new Date(r.trip.end).getTime();
  const extend = () => {
    if (!newEnd || newEnd <= r.trip.start) return setErr('The new end time must be after the start time.');
    done(() => act.extendTrip(r.id, newEnd));
  };
  const conflicts = needsAssign ? vehicleConflicts(db, r, vehicleId) : [];
  const freeVehicles = needsAssign ? db.vehicles.filter((v) => v.active && vehicleConflicts(db, r, v.id).length === 0).length : 0;
  const nvEntry = r.status === 'No Vehicle Available' ? [...r.history].reverse().find((h) => h.action.startsWith('No vehicle available')) : null;
  const freeDrivers = needsAssign ? db.drivers.filter((d) => d.active && driverConflicts(db, r, d.id).length === 0).length : 0;
  const assign = async () => {
    if (!vehicleId) return setErr('Choose a vehicle to assign.');
    if (conflicts.length) return setErr(`${conflicts[0].text} Choose another vehicle.`);
    const chosen = db.vehicles.find((v) => v.id === Number(vehicleId));
    if (chosen && chosen.capacity < r.trip.passengers) return setErr(`${chosen.number} has ${chosen.capacity} seats but this trip needs ${r.trip.passengers}. Choose a bigger vehicle.`);
    if (!recv.trim()) return setErr('Enter who received the vehicle.');
    if (recv.trim().length > LIMITS.name) return setErr('The name is too long (maximum 100 characters).');
    if (driverId && driverConflicts(db, r, driverId).length) {
      return setErr(`${db.drivers.find((d) => d.id === Number(driverId))?.name} is already on another trip at that time. Choose a free driver.`);
    }
    setErr('');
    await act.assignVehicle(r.id, vehicleId, driverId, recv.trim()); // the window stays open: the message to the driver appears below
  };

  // Message to the driver (after a vehicle and driver are assigned)
  const drv = assigned ? db.drivers.find((d) => d.id === r.trip.driverId) : null;
  const msg = msgText ?? (drv ? driverMessage(db, r) : '');
  const wa = drv ? whatsappLink(drv.phone, msg) : '';
  const copyMsg = async () => {
    try { await navigator.clipboard.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setErr('Could not copy. Select the text and press Ctrl+C.'); }
  };

  return (
    <Modal title={`${r.id} · ${r.type === 'vehicle' ? 'Vehicle' : 'Stationery'} request`} onClose={onClose} wide>
      <div className="detail-top"><Badge status={r.status} /><span>{who?.name}, {r.dept} · {fmtDate(r.createdAt)}</span></div>
      <Track r={r} />
      {r.status === 'Pending HOD Approval' && <p className="sub">Waiting for the {approverName} HOD to approve.</p>}
      {ownBlocked && <p className="note warn-box">You cannot approve or reject your own request. Another person must do this.</p>}
      {passed && <p className="note bad">The trip time of this request has already passed, so it cannot be approved. You can reject it with a reason.</p>}
      {adminBlocked && <p className="note warn-box">Admin cannot approve this request yet. The {approverName} HOD must approve it first.</p>}

      {r.status === 'Rejected' && <p className="note bad">Rejected by {r.rejectedAt === 'hod' ? 'HOD' : 'Admin'}: {r.rejectionReason}</p>}
      {r.status === 'No Vehicle Available' && <p className="note bad">No vehicle was available for this trip. {can('issue', 'edit') ? 'Assign a vehicle below when one is free.' : 'The Admin department will assign a vehicle when one is free.'}{nvEntry?.comment ? ` Reason: ${nvEntry.comment}` : ''}</p>}
      {r.note && <p className="note">Note: {r.note}</p>}

      {r.type === 'stationery' ? (
        <>
          <table className="table">
            <thead><tr><th>Item</th><th>Requested</th><th>Approved</th><th>Issued</th><th>Stock</th></tr></thead>
            <tbody>
              {r.lines.map((l, i) => (
                <tr key={i}>
                  <td>{item(l.itemId)?.name}</td>
                  <td>{l.qty} {item(l.itemId)?.unit}</td>
                  <td>{canAdmin ? <input className="qty" type="number" min="0" max={l.qty} value={qty[i]} onChange={(e) => setQty({ ...qty, [i]: e.target.value })} /> : l.approvedQty ?? '-'}</td>
                  <td>{canIssue ? <input className="qty" type="number" min="0" value={iss[i]} onChange={(e) => setIss({ ...iss, [i]: e.target.value })} /> : l.issuedQty ?? '-'}</td>
                  <td>{item(l.itemId)?.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="sub">Needed by {fmtDate(r.requiredDate)}</p>
        </>
      ) : (
        <dl className="kv">
          <dt>Purpose</dt><dd>{r.trip.purpose}</dd>
          <dt>Route</dt><dd>{r.trip.from} to {r.trip.to}</dd>
          <dt>When</dt><dd>{r.trip.start.replace('T', ' ')} to {r.trip.end.replace('T', ' ')}</dd>
          <dt>Passengers</dt><dd>{r.trip.passengers}</dd>
          <dt>Vehicle type</dt><dd>{r.trip.vehicleType}</dd>
          {r.trip.vehicleId && <><dt>Assigned</dt><dd>{db.vehicles.find((v) => v.id === r.trip.vehicleId)?.number}{r.trip.driverId ? `, driver ${db.drivers.find((d) => d.id === r.trip.driverId)?.name}` : ''}</dd></>}
        </dl>
      )}
      {r.receivedBy && <p className="sub">Received by {r.receivedBy} on {fmtDT(r.issuedAt)}</p>}

      {(canHod || canAdmin || (needsAssign && r.status === 'Approved')) && (
        <Field label="Comment" hint={needsAssign ? 'Optional. If you mark "No vehicle available", the requester sees this comment.' : 'Required when rejecting (at least 3 characters).'}><textarea rows="2" maxLength={LIMITS.note} value={comment} onChange={(e) => { setComment(e.target.value); setErr(''); }} /></Field>
      )}

      {needsAssign && (
        <div className="row">
          <Field label="Assign vehicle" hint={freeVehicles ? `${freeVehicles} vehicle${freeVehicles > 1 ? 's are' : ' is'} available.` : 'No vehicle is available right now.'}>
            <select value={vehicleId} onChange={(e) => { setVehicleId(e.target.value); setErr(''); }}>
              <option value="">Select a vehicle</option>
              {db.vehicles.filter((v) => v.active).map((v) => {
                const busy = vehicleConflicts(db, r, v.id);
                const small = v.capacity < r.trip.passengers;
                return <option key={v.id} value={v.id} disabled={busy.length > 0 || small}>{v.number} ({v.type}, seats {v.capacity}) {busy.length ? `(not available: ${busy[0].short})` : small ? `(too small: trip needs ${r.trip.passengers} seats)` : '(available)'}</option>;
              })}
            </select>
          </Field>
          <Field label="Driver (optional)" hint={freeDrivers ? `${freeDrivers} driver${freeDrivers > 1 ? 's are' : ' is'} free at the trip time.` : 'No driver is free at the trip time.'}>
            <select value={driverId} onChange={(e) => { setDriverId(e.target.value); setErr(''); }}>
              <option value="">No driver</option>
              {db.drivers.filter((d) => d.active).map((d) => {
                const busy = driverConflicts(db, r, d.id);
                return <option key={d.id} value={d.id} disabled={busy.length > 0}>{d.name} {busy.length ? `(busy: ${busy[0].split(' ')[0]})` : '(available)'}</option>;
              })}
            </select>
          </Field>
        </div>
      )}
      {conflicts.length > 0 && <div className="note warn-box">{conflicts.map((c) => <div key={c.text}>{c.text}</div>)}Choose another vehicle.</div>}
      {(needsAssign || (canIssue && r.type === 'stationery')) && <Field label="Received by"><input maxLength={LIMITS.name} value={recv} onChange={(e) => { setRecv(e.target.value); setErr(''); }} /></Field>}

      {overdue && <p className="note bad">This trip is past its planned end time and the vehicle is still marked as out. Mark the trip completed when it is back, or extend the end time if the trip is still going.</p>}
      {canFinish && (
        <div className="row">
          <Field label="Trip end time" hint="Change this if the trip is running late. The vehicle stays booked until you mark the trip completed.">
            <input type="datetime-local" value={newEnd} onChange={(e) => { setNewEnd(e.target.value); setErr(''); }} />
          </Field>
          <button className="btn" onClick={extend}>Update end time</button>
        </div>
      )}
      {err && <p className="err">{err}</p>}
      <div className="actions">
        {canCancel && <button className="btn danger" onClick={() => done(() => act.cancel(r.id))}>Cancel request</button>}
        {canHod && <><button className="btn danger" onClick={() => reject((a, c) => act.hodDecision(r.id, a, c))}>Reject</button><button className="btn primary" disabled={passed} onClick={() => done(() => act.hodDecision(r.id, true, comment.trim()))}>Approve</button></>}
        {canAdmin && <><button className="btn danger" onClick={() => reject((a, c) => act.adminDecision(r.id, a, c))}>Reject</button><button className="btn primary" disabled={passed} onClick={approveAdmin}>Approve</button></>}
        {canIssue && r.type === 'stationery' && <button className="btn primary" onClick={issue}>Issue items</button>}
        {needsAssign && r.status === 'Approved' && <button className="btn danger" onClick={() => done(() => act.noVehicle(r.id, comment.trim()))}>No vehicle available</button>}
        {needsAssign && <button className="btn primary" onClick={assign}>Assign vehicle</button>}
        {canFinish && <button className="btn primary" onClick={() => done(() => act.completeTrip(r.id))}>Mark trip completed</button>}
      </div>

      {canIssue && drv && (
        <section className="panel" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Message to the driver</h3>
          <p className="sub">{drv.name}{drv.phone ? `, ${drv.phone}` : ''}</p>
          <textarea rows="10" value={msg} onChange={(e) => setMsgText(e.target.value)} aria-label="Message to the driver" />
          {!phoneForWhatsApp(drv.phone) && <p className="err">This driver has no phone number. Add it on the Vehicles and drivers page.</p>}
          <div className="actions">
            <button className="btn" onClick={copyMsg}>{copied ? 'Copied' : 'Copy message'}</button>
            {wa && <a className="btn primary" href={wa} target="_blank" rel="noreferrer">Send on WhatsApp</a>}
          </div>
          <p className="sub">WhatsApp opens with this message ready. Press send there. If the trip time changes later, send the message again.</p>
        </section>
      )}

      <h3>History</h3>
      <ul className="history">
        {r.history.map((h, i) => (
          <li key={i}><b>{h.action}</b> <span>{h.by} · {fmtDT(h.at)}</span>{h.comment && <em>"{h.comment}"</em>}</li>
        ))}
      </ul>
    </Modal>
  );
}