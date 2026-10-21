import { Link } from 'react-router-dom';
import { useStore, vehicleState, fleetCounts, hodCovers } from '../store.jsx';
import { adminCanAct, hodCanAct } from '../approval.js';
import { PageHeader } from '../components/ui.jsx';

const PENDING = ['Pending HOD Approval', 'Pending Admin Approval'];
const APPROVED = ['Approved', 'No Vehicle Available', 'Issued / Completed'];

// One row of number cards with a small heading
function Cards({ title, cards }) {
  if (!cards.length) return null;
  return (
    <>
      <h2 style={{ fontSize: '1rem', margin: '4px 0 10px' }}>{title}</h2>
      <div className="stats">
        {cards.map((c) => (c.to
          ? <Link key={c.label} to={c.to} className="stat"><b>{c.value}</b><span>{c.label}</span></Link>
          : <div key={c.label} className="stat"><b>{c.value}</b><span>{c.label}</span></div>))}
      </div>
    </>
  );
}

export default function Dashboard() {
  const { db, user, can } = useStore();
  const all = db.requests;
  const mine = all.filter((r) => r.userId === user.id);
  const count = (list, statuses) => list.filter((r) => statuses.includes(r.status)).length;
  const fleet = fleetCounts(db);
  const low = db.items.filter((i) => i.active && i.stock <= i.min);

  // Only people who approve or manage requests see every request (the server sends everyone else only their own)
  const seesOverall = can('allRequests') || can('hodApproval') || can('adminApproval') || can('issue');

  // 1. The person's own requests: just the numbers
  const myCards = can('requests') ? [
    { label: 'Requests made', value: mine.length, to: '/my-requests' },
    { label: 'Waiting for approval', value: count(mine, PENDING), to: '/my-requests' },
    { label: 'Approved', value: count(mine, APPROVED), to: '/my-requests' },
    { label: 'Rejected', value: count(mine, ['Rejected']), to: '/my-requests' },
    ...(count(mine, ['No Vehicle Available']) ? [{ label: 'Waiting for a vehicle', value: count(mine, ['No Vehicle Available']), to: '/my-requests' }] : []),
  ] : [];

  // 2. Work waiting for this person
  const actionCards = [];
  if (can('hodApproval', 'edit')) actionCards.push({ label: 'Waiting for your HOD approval', value: all.filter((r) => hodCanAct(r, user.id) && hodCovers(db, user, r)).length, to: '/queue' });
  if (can('adminApproval', 'edit')) actionCards.push({ label: 'Waiting for Admin approval', value: all.filter((r) => adminCanAct(r, user.id)).length, to: '/queue' });
  if (can('issue', 'edit')) actionCards.push({ label: 'Approved, ready to issue or assign', value: count(all, ['Approved', 'No Vehicle Available']), to: '/queue' });
  if (can('issue', 'edit') || can('vehicles')) {
    const late = db.vehicles.filter((v) => v.active && vehicleState(db, v).label === 'Overdue').length;
    if (late > 0) actionCards.push({ label: 'Vehicles overdue for return', value: late, to: '/vehicles' });
  }
  if (can('items')) actionCards.push({ label: 'Low-stock items', value: low.length, to: '/items' });

  // 3. All requests in the system (for approvers, Admin and IT)
  const overallCards = seesOverall ? [
    { label: 'All requests', value: all.length, to: can('allRequests') ? '/all-requests' : null },
    { label: 'Stationery requests', value: all.filter((r) => r.type === 'stationery').length, to: null },
    { label: 'Vehicle requests', value: all.filter((r) => r.type === 'vehicle').length, to: null },
    { label: 'Pending', value: count(all, PENDING), to: null },
    { label: 'Approved or completed', value: count(all, APPROVED), to: null },
    { label: 'Rejected', value: count(all, ['Rejected']), to: null },
  ] : [];

  // 4. Vehicles: everyone sees how many there are and how many are free right now
  const fleetLink = can('vehicles') ? '/vehicles' : null;
  const fleetCards = [
    { label: 'Vehicles in total', value: fleet.total, to: fleetLink },
    { label: 'Available now', value: fleet.available, to: fleetLink },
    { label: 'On trips or assigned', value: fleet.onTrip, to: fleetLink },
    { label: 'Under repair', value: fleet.repair, to: fleetLink },
  ];

  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(' ')[0]}`} sub="Here is what needs attention today.">
        {can('requests', 'add') && <Link className="btn primary" to="/new">New request</Link>}
      </PageHeader>

      <Cards title="My requests" cards={myCards} />
      <Cards title="Waiting for you" cards={actionCards} />
      <Cards title="All requests" cards={overallCards} />
      <Cards title="Vehicles" cards={fleetCards} />

      {can('items') && low.length > 0 && (
        <section className="panel">
          <h2>Low stock</h2>
          <table className="table">
            <thead><tr><th>Item</th><th>In stock</th><th>Minimum</th></tr></thead>
            <tbody>{low.map((i) => <tr key={i.id}><td>{i.name}</td><td className="warn">{i.stock} {i.unit}</td><td>{i.min}</td></tr>)}</tbody>
          </table>
        </section>
      )}
    </>
  );
}