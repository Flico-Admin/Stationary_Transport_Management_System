import { useState } from 'react';
import { useStore } from '../store.jsx';
import { Badge, Empty, Field, Modal, PageHeader } from '../components/ui.jsx';

const TYPES = ['department', 'showroom', 'warehouse'];

export default function Locations() {
  const { db, can, act } = useStore();
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const departments = db.units.filter((u) => u.type === 'department' && u.active);
  const operationsId = db.units.find((u) => u.name === 'Operations')?.id ?? departments[0]?.id ?? '';
  const nameOf = (id) => db.units.find((u) => u.id === id)?.name;
  const usersIn = (id) => db.users.filter((u) => u.unitId === id && u.active).length;
  const rows = db.units.filter((u) => (!type || u.type === type) && (!q || u.name.toLowerCase().includes(q.toLowerCase())));

  const blank = (t) => ({ name: '', type: t, approverUnitId: t === 'department' ? '' : operationsId });
  const changeType = (t) => setEdit({ ...edit, type: t, approverUnitId: t === 'department' ? '' : edit.approverUnitId || operationsId });

  const save = () => {
    const name = edit.name.trim();
    if (!name) return setErr('Enter a name.');
    if (db.units.some((u) => u.name.toLowerCase() === name.toLowerCase() && u.id !== edit.id)) return setErr('A department, showroom or warehouse with this name already exists.');
    if (edit.type !== 'department' && !edit.approverUnitId) return setErr('Choose whose HOD approves requests from here.');
    act.saveUnit({ ...edit, name, approverUnitId: edit.approverUnitId ? Number(edit.approverUnitId) : null });
    setEdit(null);
  };

  const toggle = (u) => {
    if (u.active && usersIn(u.id) > 0) return setMsg(`${u.name} still has ${usersIn(u.id)} active user${usersIn(u.id) > 1 ? 's' : ''}. Move or deactivate them first.`);
    setMsg(''); act.setUnitActive(u.id, !u.active);
  };

  return (
    <>
      <PageHeader title="Departments, showrooms and warehouses" sub="Add new showrooms and warehouses here when they open. Choose whose HOD approves their requests.">
        {can('locations', 'add') && <button className="btn primary" onClick={() => { setErr(''); setEdit(blank('showroom')); }}>Add new</button>}
      </PageHeader>
      <div className="filters">
        <input placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{TYPES.map((t) => <option key={t} value={t} className="cap">{t}</option>)}</select>
      </div>
      {msg && <p className="note warn-box">{msg}</p>}
      <section className="panel flush">
        {rows.length === 0 ? <Empty>Nothing found.</Empty> : (
          <div className="scroll"><table className="table">
            <thead><tr><th>Name</th><th>Type</th><th>Requests approved by</th><th>Active users</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'faded'}>
                <td><b>{u.name}</b></td><td className="cap">{u.type}</td>
                <td>{u.approverUnitId ? `${nameOf(u.approverUnitId)} HOD` : 'Its own HOD'}</td>
                <td>{usersIn(u.id)}</td><td><Badge status={u.active ? 'Active' : 'Inactive'} /></td>
                <td className="row-actions">
                  {can('locations', 'edit') && <button className="btn sm" onClick={() => { setErr(''); setEdit({ ...u, approverUnitId: u.approverUnitId || '' }); }}>Edit</button>}
                  {can('locations', 'delete') && <button className="btn sm ghost" onClick={() => toggle(u)}>{u.active ? 'Deactivate' : 'Activate'}</button>}
                </td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>

      {edit && (
        <Modal title={edit.id ? 'Edit' : 'Add new'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
          <div className="row">
            <Field label="Name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
            <Field label="Type"><select value={edit.type} onChange={(e) => changeType(e.target.value)}>{TYPES.map((t) => <option key={t} value={t} className="cap">{t}</option>)}</select></Field>
          </div>
          <Field label="Requests are approved by" hint={edit.type === 'department' ? 'Usually the department keeps its own HOD.' : 'Showrooms and warehouses are usually approved by the Operations HOD.'}>
            <select value={edit.approverUnitId} onChange={(e) => setEdit({ ...edit, approverUnitId: e.target.value })}>
              {edit.type === 'department' && <option value="">Its own HOD</option>}
              {departments.filter((d) => d.id !== edit.id).map((d) => <option key={d.id} value={d.id}>{d.name} HOD</option>)}
            </select>
          </Field>
          {err && <p className="err">{err}</p>}
        </Modal>
      )}
    </>
  );
}
