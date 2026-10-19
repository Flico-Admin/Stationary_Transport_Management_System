import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { api } from '../api.js';
import { Empty, PageHeader, Tabs, downloadCsv, fmtDate, money } from '../components/ui.jsx';
import { downloadPdf } from '../pdf.js';
import { buildStationeryReport, buildStockReport, pickRows, stockRows, stockTotals, totals } from '../stationeryCostData.js';

const VIEWS = ['Issued cost', 'Stock value'];
const KINDS = ['By location', 'By item', 'By category', 'By month', 'Issued details'];
const STOCK_KINDS = ['By category', 'By item'];

export default function StationeryCosts() {
  const { db, can } = useStore();
  const allowed = can('costReports');
  const [view, setView] = useState(VIEWS[0]);
  const [data, setData] = useState(null);        // null = loading
  const [error, setError] = useState('');
  const [kind, setKind] = useState(KINDS[0]);
  const [stockKind, setStockKind] = useState(STOCK_KINDS[0]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [unitId, setUnitId] = useState('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // The issued item lines come straight from the database (they are not part of the normal data load)
  useEffect(() => {
    if (!allowed) return;
    api('GET', '/reports/stationery-costs').then((r) => setData(r.rows)).catch((e) => setError(e.message));
  }, [allowed]);

  // Issued cost (what was given out)
  const rows = useMemo(() => pickRows(data || [], { unitId, category, from, to }), [data, unitId, category, from, to]);
  const sum = totals(rows);
  const issuedReport = useMemo(() => buildStationeryReport(rows, kind), [rows, kind]);

  // Stock value (what is in the store now) - comes from the items list, no extra request needed
  const sRows = useMemo(() => stockRows(db.items, { category, includeInactive }), [db.items, category, includeInactive]);
  const sSum = stockTotals(sRows);
  const stockReport = useMemo(() => buildStockReport(sRows, stockKind), [sRows, stockKind]);

  if (!allowed) return <Empty>You do not have access to this report.</Empty>;

  const isStock = view === 'Stock value';
  const report = isStock ? stockReport : issuedReport;
  const { head, rows: table, money: moneyCols = [], dates = [] } = report;
  const where = unitId ? db.units.find((u) => u.id === Number(unitId))?.name : 'All locations';
  const period = from || to ? `${from ? fmtDate(from) : 'the start'} to ${to ? fmtDate(to) : 'today'}` : 'all dates';
  const cell = (c, j) => (moneyCols.includes(j) && c !== '' ? money(c) : dates.includes(j) ? fmtDate(c) : c);
  const base = (isStock ? `stationery-stock-value-${stockKind}-${category || 'all-categories'}` : `stationery-costs-${kind}-${where}`).toLowerCase().replace(/\s+/g, '-');
  const exportCsv = () => downloadCsv(`${base}.csv`, [head, ...table]);
  const exportPdf = () => downloadPdf({
    filename: `${base}.pdf`,
    title: `${isStock ? 'Stationery stock value' : 'Stationery costs'} - ${isStock ? stockKind : kind}`,
    subtitle: sub,
    summary: isStock
      ? [['Total stock value', money(sSum.value)], ['Units in stock', money(sSum.units)], ['Items', sSum.items], ['Low stock', sSum.low]]
      : [['Total cost', money(sum.cost)], ['Items issued', money(sum.qty)], ['Requests', sum.requests]],
    head, rows: table, cell,
  });

  const sub = isStock
    ? `Value of the stock in the store right now (quantity in stock x unit price). Showing: ${category || 'all categories'}${includeInactive ? ', including inactive items' : ''}.`
    : `Cost of stationery issued (quantity issued x unit price). Showing: ${where}, ${category || 'all categories'}, ${period}.`;

  const categorySelect = (
    <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
      <option value="">All categories</option>
      {db.categories.map((c) => <option key={c}>{c}</option>)}
    </select>
  );

  return (
    <>
      <PageHeader title="Stationery costs" sub={sub}>
        <button className="btn" onClick={exportCsv}>Export to Excel (CSV)</button>
        <button className="btn" onClick={exportPdf}>Save as PDF</button>
      </PageHeader>

      <Tabs tabs={VIEWS} value={view} onChange={setView} />

      {isStock ? (
        <>
          <div className="filters">
            {categorySelect}
            <label className="inline"><input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} /> Include inactive items</label>
          </div>

          {sSum.unpriced > 0 && <p className="note">{sSum.unpriced} item(s) in stock have no unit price, so their value is counted as 0. Set the price in Stationery items.</p>}

          <div className="stats">
            <div className="stat"><b>{money(sSum.value)}</b><span>Total stock value</span></div>
            <div className="stat"><b>{money(sSum.units)}</b><span>Units in stock</span></div>
            <div className="stat"><b>{sSum.items}</b><span>Items</span></div>
            <div className="stat"><b>{sSum.low}</b><span>Low stock items</span></div>
          </div>

          <Tabs tabs={STOCK_KINDS} value={stockKind} onChange={setStockKind} />
        </>
      ) : (
        <>
          <div className="filters">
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} aria-label="Location">
              <option value="">All locations</option>
              {['department', 'showroom', 'warehouse'].map((t) => {
                const list = db.units.filter((u) => u.type === t);
                return list.length ? <optgroup key={t} label={t[0].toUpperCase() + t.slice(1) + 's'}>{list.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup> : null;
              })}
            </select>
            {categorySelect}
            <label className="inline">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="inline">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>

          {error ? <Empty>{error}</Empty> : !data ? <Empty>Loading...</Empty> : (
            <>
              {sum.unpriced > 0 && <p className="note">{sum.unpriced} issued item line(s) have no unit price, so they are counted as 0. Set the price in Stationery items.</p>}

              <div className="stats">
                <div className="stat"><b>{money(sum.cost)}</b><span>Total stationery cost</span></div>
                <div className="stat"><b>{money(sum.qty)}</b><span>Items issued</span></div>
                <div className="stat"><b>{sum.requests}</b><span>Requests issued</span></div>
              </div>

              <Tabs tabs={KINDS} value={kind} onChange={setKind} />
            </>
          )}
        </>
      )}

      {(isStock || (data && !error)) && (
        <section className="panel flush">
          {table.length === 0 ? <Empty>{isStock ? 'No stationery items for these filters.' : 'No issued stationery for these filters.'}</Empty> : (
            <div className="scroll"><table className="table">
              <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{table.map((r, i) => <tr key={i} style={r[0] === 'Total' ? { fontWeight: 700 } : undefined}>{r.map((c, j) => <td key={j}>{cell(c, j)}</td>)}</tr>)}</tbody>
            </table></div>
          )}
        </section>
      )}
    </>
  );
}