import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from '../store.jsx';

export default function Layout({ children }) {
  const { user, can, db, logout, toast } = useStore();
  const [open, setOpen] = useState(false);

  const groups = [
    { title: 'Requests', links: [
      { to: '/', label: 'Dashboard', show: true, end: true },
      { to: '/new', label: 'New request', show: can('requests', 'add') },
      { to: '/my-requests', label: 'My requests', show: can('requests') },
      { to: '/queue', label: 'Waiting for me', show: can('hodApproval', 'edit') || can('adminApproval', 'edit') },
      { to: '/all-requests', label: 'All requests', show: can('allRequests') },
    ] },
    { title: 'Stock and fleet', links: [
      { to: '/items', label: 'Stationery items', show: can('items') },
      { to: '/purchasing', label: 'Purchase orders', show: can('purchasing') },
      { to: '/vehicles', label: 'Vehicles and drivers', show: can('vehicles') },
      { to: '/maintenance', label: 'Maintenance and fuel', show: can('maintenance') },
    ] },
    { title: 'Management', links: [
      { to: '/reports', label: 'Reports', show: can('reports') },
      { to: '/vehicle-costs', label: 'Vehicle costs', show: can('costReports') },
      { to: '/stationery-costs', label: 'Stationery costs', show: can('costReports') },
      { to: '/locations', label: 'Departments and locations', show: can('locations') },
      { to: '/users', label: 'Users and permissions', show: can('users') },
    ] },
  ];

  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand">Request Desk</div>
        <nav onClick={() => setOpen(false)}>
          {groups.map((g) => {
            const links = g.links.filter((l) => l.show);
            if (!links.length) return null;
            return (
              <div key={g.title} className="nav-group">
                <div className="nav-title">{g.title}</div>
                {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>)}
              </div>
            );
          })}
        </nav>
        <div className="me">
          <strong>{user.name}</strong>
          <span>{db.roles[user.role]?.label} · {user.dept}</span>
          <button className="btn ghost" onClick={logout}>Log out</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>
          <span className="brand-sm">Request Desk</span>
        </header>
        <main>{children}</main>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}