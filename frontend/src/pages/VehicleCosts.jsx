import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { Empty, PageHeader, Tabs, downloadCsv, fmtDate, money } from '../components/ui.jsx';
import { downloadPdf } from '../pdf.js';
import { buildCostReport, pickRecords, totals } from '../costData.js';

const KINDS = ['By vehicle', 'By month', 'Repair details', 'Fuel details'];

export default function VehicleCosts() {
  const { db, can } = useStore();
  const [kind, setKind] = useState(KINDS[0]);
  const [vehicleId, setVehicleId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const rec = useMemo(() => pickRecords(db, { vehicleId, from, to }), [db, vehicleId, from, to]);
  const sum = totals(rec);
  const { head, rows, money: moneyCols = [], dates = [] } = useMemo(() => buildCostReport(db, kind, rec), [db, kind, rec]);

  if (!can('costReports')) return <Empty>You do not have access to this report.</Empty>;

  const vName = vehicleId ? db.vehicles.find((v) => v.id === Number(vehicleId))?.number : 'All vehicles';
  const period = from || to ? `${from ? fmtDate(from) : 'the start'} to ${to ? fmtDate(to) : 'today'}` : 'all dates';
  const cell = (c, j) => (moneyCols.includes(j) && c !== '' ? money(c) : dates.includes(j) ? fmtDate(c) : c);
  const exportCsv = () => downloadCsv(`vehicle-costs-${kind}-${vName}.csv`.toLowerCase().replace(/\s+/g, '-'), [head, ...rows]);
  const exportPdf = () => downloadPdf({
    filename: `vehicle-costs-${kind}-${vName}.pdf`.toLowerCase().replace(/\s+/g, '-'),
    title: `Vehicle costs - ${kind}`,
    subtitle: `Repair and fuel costs. Showing: ${vName}, ${period}.`,
    summary: [['Repair cost', money(sum.repair)], ['Fuel cost', money(sum.fuel)], ['Total running cost', money(sum.all)]],
    head, rows, cell,
  });

  return (
    <>
      <PageHeader title="Vehicle costs" sub={`Repair and fuel costs. Showing: ${vName}, ${period}.`}>
        <button className="btn" onClick={exportCsv}>Export to Excel (CSV)</button>
        <button className="btn" onClick={exportPdf}>Save as PDF</button>
      </PageHeader>

      <div className="filters">
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} aria-label="Vehicle">
          <option value="">All vehicles</option>
          {db.vehicles.map((v) => <option key={v.id} value={v.id}>{v.number} ({v.type})</option>)}
        </select>
        <label className="inline">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>

      <div className="stats">
        <div className="stat"><b>{money(sum.repair)}</b><span>Repair cost ({sum.jobs} jobs)</span></div>
        <div className="stat"><b>{money(sum.fuel)}</b><span>Fuel cost ({money(Math.round(sum.litres * 100) / 100)} litres)</span></div>
        <div className="stat"><b>{money(sum.all)}</b><span>Total running cost</span></div>
      </div>

      <Tabs tabs={KINDS} value={kind} onChange={setKind} />

      <section className="panel flush">
        {rows.length === 0 ? <Empty>No records for these filters.</Empty> : (
          <div className="scroll"><table className="table">
            <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} style={r[0] === 'Total' ? { fontWeight: 700 } : undefined}>{r.map((c, j) => <td key={j}>{cell(c, j)}</td>)}</tr>)}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}