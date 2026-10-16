import { useStore } from '../store.jsx';
import { Badge, Empty, PageHeader, fmtDT } from '../components/ui.jsx';

const SYNCS = [
  { kind: 'Purchase orders and issued stationery cost to finance', note: 'Approved purchase orders and the cost of stationery issued (FR-54).' },
  { kind: 'Vehicle fuel and maintenance cost to finance', note: 'Fuel and maintenance cost for each vehicle (FR-55).' },
  { kind: 'Employee list from payroll / HR', note: 'So employee details do not need to be typed again (FR-56).' },
];

export default function Integration() {
  const { db, can, act } = useStore();
  return (
    <>
      <PageHeader title="Finance and payroll" sub="Share cost data with finance and pull the employee list from payroll / HR." />
      <p className="note warn-box">The finance and payroll systems are not chosen yet, so these buttons only create a log entry for now. They will be connected when the backend is built.</p>
      <div className="cards">
        {SYNCS.map((s) => (
          <section className="panel" key={s.kind}>
            <h2>{s.kind}</h2>
            <p className="sub">{s.note}</p>
            {can('integration', 'edit') && <button className="btn" onClick={() => act.runSync(s.kind)}>Run now</button>}
          </section>
        ))}
      </div>
      <section className="panel flush">
        <h2 className="pad">Activity log</h2>
        {db.integrationLog.length === 0 ? <Empty>No integration activity yet.</Empty> : (
          <div className="scroll"><table className="table"><thead><tr><th>When</th><th>What</th><th>Result</th><th>Message</th></tr></thead>
            <tbody>{db.integrationLog.map((l) => <tr key={l.id}><td>{fmtDT(l.at)}</td><td>{l.kind}</td><td><Badge status={l.status} /></td><td>{l.message}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </>
  );
}
