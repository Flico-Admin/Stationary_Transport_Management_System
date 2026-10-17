import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { api } from '../api.js';
import { Empty, PageHeader, Tabs, downloadCsv, fmtDate, money } from '../components/ui.jsx';
import { buildStationeryReport, pickRows, totals } from '../stationeryCostData.js';

const KINDS = ['By location', 'By item', 'By category', 'By month', 'Issued details'];

export default function StationeryCosts() {
  const { db, can } = useStore();
  const allowed = can('costReports');
  const [data, setData] = useState(null);        // null = loading
  const [error, setError] = useState('');
  const [kind, setKind] = useState(KINDS[0]);
  const [unitId, setUnitId] = useState('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // The issued item lines come straight from the database (they are not part of the normal data load)
  useEffect(() => {
    if (!allowed) return;
    api('GET', '/reports/stationery-costs').then((r) => setData(r.rows)).catch((e) => setError(e.message));
  }, [allowed]);

  const rows = useMemo(() => pickRows(data || [], { unitId, category, from, to }), [data, unitId, category, from, to]);
  const sum = totals(rows);
  const report = useMemo(() => buildStationeryReport(rows, kind), [rows, kind]);

  if (!allowed) return <Empty>You do not have access to this report.</Empty>;
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <Empty>Loading...</Empty>;

  const { head, rows: table, money: moneyCols = [], dates = [] } = report;
  const where = unitId ? db.units.find((u) => u.id === Number(unitId))?.name : 'All locations';
  const period = from || to ? `${from ? fmtDate(from) : 'the start'} to ${to ? fmtDate(to) : 'today'}` : 'all dates';
  const cell = (c, j) => (moneyCols.includes(j) && c !== '' ? money(c) : dates.includes(j) ? fmtDate(c) : c);
  const exportCsv = () => downloadCsv(`stationery-costs-${kind}-${where}.csv`.toLowerCase().replace(/\s+/g, '-'), [head, ...table]);

  return (
    <>
      <PageHeader title="Stationery costs" sub={`Cost of stationery issued (quantity issued x unit price). Showing: ${where}, ${category || 'all categories'}, ${period}.`}>
        <button className="btn" onClick={exportCsv}>Export to Excel (CSV)</button>
        <button className="btn" onClick={() => window.print()}>Save as PDF</button>
      </PageHeader>

      <div className="filters">
        <select value={unitId} onChange={(e) => setUnitId(e.target.value)} aria-label="Location">
          <option value="">All locations</option>
          {['department', 'showroom', 'warehouse'].map((t) => {
            const list = db.units.filter((u) => u.type === t);
            return list.length ? <optgroup key={t} label={t[0].toUpperCase() + t.slice(1) + 's'}>{list.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup> : null;
          })}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {db.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="inline">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>

      {sum.unpriced > 0 && <p className="note">{sum.unpriced} issued item line(s) have no unit price, so they are counted as 0. Set the price in Stationery items.</p>}

      <div className="stats">
        <div className="stat"><b>{money(sum.cost)}</b><span>Total stationery cost</span></div>
        <div className="stat"><b>{money(sum.qty)}</b><span>Items issued</span></div>
        <div className="stat"><b>{sum.requests}</b><span>Requests issued</span></div>
      </div>

      <Tabs tabs={KINDS} value={kind} onChange={setKind} />

      <section className="panel flush">
        {table.length === 0 ? <Empty>No issued stationery for these filters.</Empty> : (
          <div className="scroll"><table className="table">
            <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{table.map((r, i) => <tr key={i} style={r[0] === 'Total' ? { fontWeight: 700 } : undefined}>{r.map((c, j) => <td key={j}>{cell(c, j)}</td>)}</tr>)}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}