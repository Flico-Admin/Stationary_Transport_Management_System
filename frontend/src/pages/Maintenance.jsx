import { useState } from 'react';
import { useStore } from '../store.jsx';
import { Badge, Field, Modal, PageHeader, Tabs, fmtDate, money } from '../components/ui.jsx';

const today = () => new Date().toISOString().slice(0, 10);

export default function Maintenance() {
  const { db, can, act } = useStore();
  const [tab, setTab] = useState('Service and repairs');
  const [form, setForm] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [err, setErr] = useState('');
  const veh = (id) => db.vehicles.find((v) => v.id === id)?.number || '-';
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);

  const upcoming = db.maintenance.filter((m) => m.nextService).sort((a, b) => a.nextService.localeCompare(b.nextService));

  const save = () => {
    if (!form.vehicleId || !form.date) return setErr('Choose a vehicle and a date.');
    if (tab === 'Fuel') {
      if (!(Number(form.litres) > 0) || !(Number(form.cost) >= 0)) return setErr('Enter litres and cost.');
      act.addFuel({ vehicleId: Number(form.vehicleId), date: form.date, litres: Number(form.litres), cost: Number(form.cost), meter: Number(form.meter) });
    } else {
      if (!form.details.trim()) return setErr('Describe the work done.');
      act.addMaintenance({ vehicleId: Number(form.vehicleId), date: form.date, type: form.type, details: form.details, cost: Number(form.cost) || 0, nextService: form.nextService, underRepair: form.underRepair });
    }
    setForm(null);
  };

  const summary = db.vehicles.map((v) => {
    const m = db.maintenance.filter((x) => x.vehicleId === v.id && inRange(x.date)).reduce((s, x) => s + x.cost, 0);
    const f = db.fuel.filter((x) => x.vehicleId === v.id && inRange(x.date)).reduce((s, x) => s + x.cost, 0);
    return { v, m, f };
  });

  return (
    <>
      <PageHeader title="Maintenance and fuel" sub="Service history, fuel usage and running costs for each vehicle.">
        {tab !== 'Cost summary' && can('maintenance', 'add') && <button className="btn primary" onClick={() => { setErr(''); setForm(tab === 'Fuel' ? { vehicleId: '', date: today(), litres: '', cost: '', meter: '' } : { vehicleId: '', date: today(), type: 'Service', details: '', cost: '', nextService: '', underRepair: false }); }}>{tab === 'Fuel' ? 'Add fuel record' : 'Add service or repair'}</button>}
      </PageHeader>
      <Tabs tabs={['Service and repairs', 'Fuel', 'Cost summary']} value={tab} onChange={setTab} />

      {tab === 'Service and repairs' && (
        <>
          {upcoming.length > 0 && (
            <section className="panel"><h2>Upcoming services</h2>
              <ul className="plain">{upcoming.map((m) => <li key={m.id}><b>{veh(m.vehicleId)}</b> due {fmtDate(m.nextService)}</li>)}</ul>
            </section>
          )}
          <section className="panel flush"><div className="scroll"><table className="table">
            <thead><tr><th>Vehicle</th><th>Date</th><th>Type</th><th>Details</th><th>Cost</th><th>Status</th><th /></tr></thead>
            <tbody>{db.maintenance.map((m) => (
              <tr key={m.id}><td><b>{veh(m.vehicleId)}</b></td><td>{fmtDate(m.date)}</td><td>{m.type}</td><td>{m.details}</td><td>{money(m.cost)}</td>
                <td>{m.underRepair ? <Badge status="not available" /> : <span className="sub">Done</span>}</td>
                <td className="row-actions">{m.underRepair && can('maintenance', 'edit') && <button className="btn sm" onClick={() => act.markRepaired(m.id)}>Mark repaired</button>}</td></tr>))}</tbody>
          </table></div></section>
        </>
      )}

      {tab === 'Fuel' && (
        <section className="panel flush"><div className="scroll"><table className="table">
          <thead><tr><th>Vehicle</th><th>Date</th><th>Litres</th><th>Cost</th><th>Meter reading</th></tr></thead>
          <tbody>{db.fuel.map((x) => <tr key={x.id}><td><b>{veh(x.vehicleId)}</b></td><td>{fmtDate(x.date)}</td><td>{x.litres}</td><td>{money(x.cost)}</td><td>{money(x.meter)}</td></tr>)}</tbody>
        </table></div></section>
      )}

      {tab === 'Cost summary' && (
        <>
          <div className="filters"><label className="inline">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="inline">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>
          <section className="panel flush"><div className="scroll"><table className="table">
            <thead><tr><th>Vehicle</th><th>Maintenance cost</th><th>Fuel cost</th><th>Total</th></tr></thead>
            <tbody>{summary.map(({ v, m, f }) => <tr key={v.id}><td><b>{v.number}</b></td><td>{money(m)}</td><td>{money(f)}</td><td><b>{money(m + f)}</b></td></tr>)}</tbody>
          </table></div></section>
        </>
      )}

      {form && (
        <Modal title={tab === 'Fuel' ? 'Add fuel record' : 'Add service or repair'} onClose={() => setForm(null)} footer={<><button className="btn" onClick={() => setForm(null)}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
          <div className="row">
            <Field label="Vehicle"><select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}><option value="">Select a vehicle</option>{db.vehicles.map((v) => <option key={v.id} value={v.id}>{v.number}</option>)}</select></Field>
            <Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          </div>
          {tab === 'Fuel' ? (
            <div className="row">
              <Field label="Litres"><input type="number" min="0" value={form.litres} onChange={(e) => setForm({ ...form, litres: e.target.value })} /></Field>
              <Field label="Cost"><input type="number" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
              <Field label="Meter reading"><input type="number" min="0" value={form.meter} onChange={(e) => setForm({ ...form, meter: e.target.value })} /></Field>
            </div>
          ) : (
            <>
              <div className="row">
                <Field label="Type"><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>Service</option><option>Repair</option></select></Field>
                <Field label="Cost"><input type="number" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
                <Field label="Next service date"><input type="date" value={form.nextService} onChange={(e) => setForm({ ...form, nextService: e.target.value })} /></Field>
              </div>
              <Field label="Details"><textarea rows="2" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} /></Field>
              <label className="check"><input type="checkbox" checked={form.underRepair} onChange={(e) => setForm({ ...form, underRepair: e.target.checked })} /> Vehicle is under repair now (it will be marked not available)</label>
            </>
          )}
          {err && <p className="err">{err}</p>}
        </Modal>
      )}
    </>
  );
}
