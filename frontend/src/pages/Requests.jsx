import { useState } from 'react';
import { useStore, hodCovers } from '../store.jsx';
import { Badge, Empty, PageHeader, fmtDate } from '../components/ui.jsx';
import { REQUEST_STATUSES } from '../data/mock.js';
import RequestDetail from '../components/RequestDetail.jsx';

const TITLES = {
  mine: ['My requests', 'Track the status of everything you have asked for.'],
  queue: ['Waiting for me', 'Requests that need your approval or action.'],
  all: ['All requests', 'Search every request by date, status, department and type.'],
};

export default function Requests({ mode }) {
  const { db, user, can } = useStore();
  const [f, setF] = useState({ q: '', status: '', type: '', dept: '', from: '', to: '' });
  const [openId, setOpenId] = useState(null);
  const set = (k, v) => setF({ ...f, [k]: v });
  const nameOf = (id) => db.users.find((u) => u.id === id)?.name || '-';
  const itemName = (id) => db.items.find((i) => i.id === id)?.name || '';

  let rows = db.requests;
  if (mode === 'mine') rows = rows.filter((r) => r.userId === user.id);
  if (mode === 'queue') {
    rows = rows.filter((r) =>
      (can('hodApproval', 'edit') && r.status === 'Pending HOD Approval' && hodCovers(db, user, r)) ||
      (can('adminApproval', 'edit') && r.status === 'Pending Admin Approval') ||
      (can('issue', 'edit') && ['Approved', 'No Vehicle Available'].includes(r.status)));
  }
  rows = rows.filter((r) => {
    const text = [r.id, nameOf(r.userId), r.note, r.trip?.purpose, ...(r.lines || []).map((l) => itemName(l.itemId))].join(' ').toLowerCase();
    const created = r.createdAt.slice(0, 10);
    return (!f.q || text.includes(f.q.toLowerCase())) && (!f.status || r.status === f.status) && (!f.type || r.type === f.type)
      && (!f.dept || r.dept === f.dept) && (!f.from || created >= f.from) && (!f.to || created <= f.to);
  });

  const [title, sub] = TITLES[mode];
  return (
    <>
      <PageHeader title={title} sub={sub} />
      <div className="filters">
        <input placeholder="Search by request number, person or item" value={f.q} onChange={(e) => set('q', e.target.value)} />
        <select value={f.status} onChange={(e) => set('status', e.target.value)}><option value="">All statuses</option>{REQUEST_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={f.type} onChange={(e) => set('type', e.target.value)}><option value="">All types</option><option value="stationery">Stationery</option><option value="vehicle">Vehicle</option></select>
        {mode !== 'mine' && <select value={f.dept} onChange={(e) => set('dept', e.target.value)}><option value="">All locations</option>{db.units.map((u) => <option key={u.id}>{u.name}</option>)}</select>}
        <input type="date" aria-label="Created from" value={f.from} onChange={(e) => set('from', e.target.value)} />
        <input type="date" aria-label="Created to" value={f.to} onChange={(e) => set('to', e.target.value)} />
      </div>

      <section className="panel flush">
        {rows.length === 0 ? <Empty>{mode === 'queue' ? 'Nothing is waiting for you right now.' : 'No requests match these filters.'}</Empty> : (
          <div className="scroll">
            <table className="table clickable">
              <thead><tr><th>Request</th><th>Type</th><th>Requested by</th><th>Location</th><th>Details</th><th>Created</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} tabIndex="0" onClick={() => setOpenId(r.id)} onKeyDown={(e) => e.key === 'Enter' && setOpenId(r.id)}>
                    <td><b>{r.id}</b></td>
                    <td className="cap">{r.type}</td>
                    <td>{nameOf(r.userId)}</td>
                    <td>{r.dept}</td>
                    <td>{r.type === 'vehicle' ? `${r.trip.from} to ${r.trip.to}` : `${r.lines.length} item${r.lines.length > 1 ? 's' : ''}, needed ${fmtDate(r.requiredDate)}`}</td>
                    <td>{fmtDate(r.createdAt)}</td>
                    <td><Badge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {openId && <RequestDetail id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}