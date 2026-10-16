import { useState } from 'react';
import { useStore } from '../store.jsx';
import { Badge, Empty, Field, Modal, PageHeader, Tabs, fmtDT } from '../components/ui.jsx';
import { ACTIONS, MODULES } from '../permissions.js';

function Matrix({ perms, onToggle }) {
  return (
    <div className="scroll"><table className="table matrix">
      <thead><tr><th>Part of the system</th>{ACTIONS.map((a) => <th key={a} className="cap">{a}</th>)}</tr></thead>
      <tbody>{MODULES.map((m) => (
        <tr key={m.key}><td>{m.label}</td>
          {ACTIONS.map((a) => <td key={a}><input type="checkbox" aria-label={`${m.label}: ${a}`} checked={(perms[m.key] || []).includes(a)} onChange={() => onToggle(m.key, a)} /></td>)}
        </tr>))}</tbody>
    </table></div>
  );
}

export default function Users() {
  const { db, can, act } = useStore();
  const [tab, setTab] = useState('Users');
  const [edit, setEdit] = useState(null);
  const [extraFor, setExtraFor] = useState(null);
  const [role, setRole] = useState('employee');
  const [newRole, setNewRole] = useState('');
  const [err, setErr] = useState('');
  const write = can('users', 'edit');

  const save = () => {
    const email = edit.email.trim().toLowerCase();
    if (!edit.name.trim() || !email) return setErr('Name and email are required.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Enter a valid email address.');
    if (db.users.some((u) => u.email === email && u.id !== edit.id)) return setErr('This email is already used by another user.');
    if (!edit.id && (edit.password || '').length < 6) return setErr('Set a password with at least 6 characters.');
    if (edit.id && edit.password && edit.password.length < 6) return setErr('The new password must have at least 6 characters.');
    const unit = db.units.find((x) => x.id === Number(edit.unitId));
    if (!unit) return setErr('Choose a department, showroom or warehouse.');
    act.saveUser({ ...edit, email, unitId: unit.id, dept: unit.name });
    setEdit(null);
  };
  const extraUser = db.users.find((u) => u.id === extraFor);

  return (
    <>
      <PageHeader title="Users and permissions" sub="Decide who can use each part of the system. Every change is recorded.">
        {tab === 'Users' && can('users', 'add') && <button className="btn primary" onClick={() => { setErr(''); setEdit({ name: '', email: '', password: '', role: 'employee', unitId: db.units.find((x) => x.active)?.id }); }}>Add user</button>}
      </PageHeader>
      <Tabs tabs={['Users', 'Roles and permissions', 'Change log']} value={tab} onChange={setTab} />

      {tab === 'Users' && (
        <section className="panel flush"><div className="scroll"><table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Location</th><th>Status</th><th /></tr></thead>
          <tbody>{db.users.map((u) => (
            <tr key={u.id} className={u.active ? '' : 'faded'}>
              <td><b>{u.name}</b></td><td>{u.email}</td><td>{db.roles[u.role]?.label}{Object.values(u.extra || {}).some((a) => a.length) && <span className="badge wait low">Extra permissions</span>}</td><td>{u.dept}</td><td><Badge status={u.active ? 'Active' : 'Inactive'} /></td>
              <td className="row-actions">
                {write && <button className="btn sm" onClick={() => { setErr(''); setEdit({ ...u, password: '' }); }}>Edit</button>}
                {write && <button className="btn sm" onClick={() => setExtraFor(u.id)}>Extra permissions</button>}
                {can('users', 'delete') && <button className="btn sm ghost" onClick={() => act.setUserActive(u.id, !u.active)}>{u.active ? 'Deactivate' : 'Activate'}</button>}
              </td>
            </tr>))}</tbody>
        </table></div></section>
      )}

      {tab === 'Roles and permissions' && (
        <section className="panel">
          <div className="row">
            <Field label="Role"><select value={role} onChange={(e) => setRole(e.target.value)}>{Object.entries(db.roles).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}</select></Field>
            {write && <><Field label="New role"><input value={newRole} onChange={(e) => setNewRole(e.target.value)} /></Field><button className="btn" onClick={() => { if (newRole.trim()) { act.addRole(newRole.trim()); setNewRole(''); } }}>Create role</button></>}
          </div>
          <Matrix perms={db.roles[role].perms} onToggle={(m, a) => write && act.toggleRolePerm(role, m, a)} />
        </section>
      )}

      {tab === 'Change log' && (
        <section className="panel flush">
          {db.audit.length === 0 ? <Empty>No changes recorded yet.</Empty> : (
            <div className="scroll"><table className="table"><thead><tr><th>When</th><th>Who</th><th>What changed</th></tr></thead>
              <tbody>{db.audit.map((a, i) => <tr key={i}><td>{fmtDT(a.at)}</td><td>{a.by}</td><td>{a.text}</td></tr>)}</tbody></table></div>
          )}
        </section>
      )}

      {edit && (
        <Modal title={edit.id ? 'Edit user' : 'Add user'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save}>Save user</button></>}>
          <div className="row">
            <Field label="Full name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Email (used to log in)"><input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
          </div>
          <Field label={edit.id ? 'New password' : 'Password'} hint={edit.id ? 'Leave empty to keep the current password.' : 'At least 6 characters. Share it with the user safely.'}>
            <input type="text" autoComplete="off" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
          </Field>
          <div className="row">
            <Field label="Role"><select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>{Object.entries(db.roles).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}</select></Field>
            <Field label="Department, showroom or warehouse">
              <select value={edit.unitId} onChange={(e) => setEdit({ ...edit, unitId: Number(e.target.value) })}>
                {['department', 'showroom', 'warehouse'].map((t) => (
                  <optgroup key={t} label={t[0].toUpperCase() + t.slice(1) + 's'}>
                    {db.units.filter((x) => x.type === t && (x.active || x.id === edit.unitId)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
          </div>
          {err && <p className="err">{err}</p>}
        </Modal>
      )}

      {extraUser && (
        <Modal title={`Extra permissions: ${extraUser.name}`} wide onClose={() => setExtraFor(null)}>
          <p className="sub">These are added on top of the {db.roles[extraUser.role]?.label} role, for this user only.</p>
          <Matrix perms={extraUser.extra || {}} onToggle={(m, a) => act.toggleUserPerm(extraUser.id, m, a)} />
        </Modal>
      )}
    </>
  );
}
