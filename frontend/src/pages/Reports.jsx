import { useMemo, useState } from 'react';
import { useStore, hodCovers } from '../store.jsx';
import { Empty, PageHeader, downloadCsv, fmtDate } from '../components/ui.jsx';
import { downloadPdf } from '../pdf.js';
import { buildReport, filterRequests, scopeUnitIds, summarize } from '../reportData.js';

const TYPE_TITLES = { department: 'Departments', showroom: 'Showrooms', warehouse: 'Warehouses' };

export default function Reports() {
  const { db, user, can } = useStore();
  const seeAll = can('reportsAll');   // Admin and IT: every location. HODs: only the locations they approve.
  const seeStock = can('items');      // stock is not about one location, so only people who manage items see it

  const kinds = ['Requests by location', 'Stationery usage', ...(seeStock ? ['Stock'] : []), 'Vehicle usage', 'Request status summary'];
  const [kind, setKind] = useState(kinds[0]);
  const [loc, setLoc] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const isStock = kind === 'Stock';

  const scopeIds = useMemo(
    () => scopeUnitIds(db, user, seeAll, (id) => hodCovers(db, user, { unitId: id })),
    [db, user, seeAll]);
  const scopeUnits = db.units.filter((u) => scopeIds.has(u.id));

  const reqs = useMemo(() => filterRequests(db, scopeIds, { loc, type, from, to }), [db, scopeIds, loc, type, from, to]);
  const { head, rows } = useMemo(() => buildReport(db, kind, reqs), [db, kind, reqs]);
  const sum = summarize(reqs);

  const where = loc ? db.units.find((u) => u.id === Number(loc))?.name : (seeAll ? 'All locations' : 'All my locations');
  const period = from || to ? `${from ? fmtDate(from) : 'the start'} to ${to ? fmtDate(to) : 'today'}` : 'all dates';
  const showing = isStock ? 'Current stock of all active items.' : `Showing: ${where}${type ? `, ${type} requests` : ''}, ${period}.`;

  const exportCsv = () => downloadCsv(`${kind}${isStock ? '' : ` - ${where}`}.csv`.toLowerCase().replace(/\s+/g, '-'), [head, ...rows]);
  const exportPdf = () => downloadPdf({
    filename: `${kind}${isStock ? '' : ` - ${where}`}.pdf`.toLowerCase().replace(/\s+/g, '-'),
    title: `Report - ${kind}`,
    subtitle: showing,
    summary: isStock ? [] : [['Requests', sum.total], ['Pending', sum.pending], ['Approved or completed', sum.done], ['Rejected', sum.rejected]],
    head, rows,
  });

  return (
    <>
      <PageHeader title="Reports" sub={showing}>
        <button className="btn" onClick={exportCsv}>Export to Excel (CSV)</button>
        <button className="btn" onClick={exportPdf}>Save as PDF</button>
      </PageHeader>

      {!seeAll && <p className="note">You see reports for the locations you approve requests for ({scopeUnits.length}). The Admin department and IT see every location.</p>}

      <div className="filters">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Report">{kinds.map((k) => <option key={k}>{k}</option>)}</select>
        {!isStock && scopeUnits.length > 1 && (
          <select value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Location">
            <option value="">{seeAll ? 'All locations' : 'All my locations'}</option>
            {['department', 'showroom', 'warehouse'].map((t) => {
              const list = scopeUnits.filter((u) => u.type === t);
              return list.length ? <optgroup key={t} label={TYPE_TITLES[t]}>{list.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup> : null;
            })}
          </select>
        )}
        {!isStock && (
          <>
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Request type">
              <option value="">Stationery and vehicle</option><option value="stationery">Stationery only</option><option value="vehicle">Vehicle only</option>
            </select>
            <label className="inline">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="inline">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </>
        )}
      </div>

      {!isStock && (
        <div className="stats">
          <div className="stat"><b>{sum.total}</b><span>Requests</span></div>
          <div className="stat"><b>{sum.pending}</b><span>Pending</span></div>
          <div className="stat"><b>{sum.done}</b><span>Approved or completed</span></div>
          <div className="stat"><b>{sum.rejected}</b><span>Rejected</span></div>
        </div>
      )}

      <section className="panel flush">
        {rows.length === 0 ? <Empty>No data for these filters.</Empty> : (
          <div className="scroll"><table className="table">
            <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} style={r[0] === 'Total' ? { fontWeight: 700 } : undefined}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}