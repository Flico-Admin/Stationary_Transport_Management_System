import { useState } from 'react';
import { useStore, vehicleState, driverState } from '../store.jsx';
import { Badge, Field, Modal, PageHeader, Tabs } from '../components/ui.jsx';
import { VEHICLE_TYPES } from '../data/mock.js';

export default function Vehicles() {
  const { db, can, act } = useStore();
  const [tab, setTab] = useState('Vehicles');
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  const isVeh = tab === 'Vehicles';

  const save = () => {
    if (isVeh) {
      if (!edit.number.trim()) return setErr('Vehicle number is required.');
      if (db.vehicles.some((v) => v.number === edit.number.trim() && v.id !== edit.id)) return setErr('This vehicle number already exists.');
      act.save('vehicles', { ...edit, capacity: Number(edit.capacity) });
    } else {
      if (!edit.name.trim()) return setErr('Driver name is required.');
      if (edit.phone && edit.phone.replace(/\D/g, '').length < 9) return setErr('Enter a valid phone number, for example 0771234567.');
      act.save('drivers', edit);
    }
    setEdit(null);
  };

  const list = isVeh ? db.vehicles : db.drivers;
  const coll = isVeh ? 'vehicles' : 'drivers';

  return (
    <>
      <PageHeader title="Vehicles and drivers" sub="Keep the fleet list up to date. Availability updates by itself after each trip. Vehicles under repair are marked not available automatically.">
        {can('vehicles', 'add') && <button className="btn primary" onClick={() => { setErr(''); setEdit(isVeh ? { number: '', type: 'Car', capacity: 4, status: 'available', active: true } : { name: '', phone: '', active: true }); }}>{isVeh ? 'Add vehicle' : 'Add driver'}</button>}
      </PageHeader>
      <Tabs tabs={['Vehicles', 'Drivers']} value={tab} onChange={setTab} />
      <section className="panel flush"><div className="scroll"><table className="table">
        <thead>{isVeh ? <tr><th>Number</th><th>Type</th><th>Capacity</th><th>Status now</th><th>Status</th><th /></tr> : <tr><th>Name</th><th>Phone</th><th>Status now</th><th>Status</th><th /></tr>}</thead>
        <tbody>
          {list.map((x) => (
            <tr key={x.id} className={x.active ? '' : 'faded'}>
              {isVeh ? <><td><b>{x.number}</b></td><td>{x.type}</td><td>{x.capacity}</td><td>{(() => { const st = vehicleState(db, x); return <><span className={`badge ${st.tone}`}>{st.label}</span>{st.note && <div className="sub">{st.note}</div>}</>; })()}</td></> : <><td><b>{x.name}</b></td><td>{x.phone}</td><td>{(() => { const st = driverState(db, x); return <><span className={`badge ${st.tone}`}>{st.label}</span>{st.note && <div className="sub">{st.note}</div>}</>; })()}</td></>}
              <td><Badge status={x.active ? 'Active' : 'Inactive'} /></td>
              <td className="row-actions">
                {can('vehicles', 'edit') && <button className="btn sm" onClick={() => { setErr(''); setEdit(x); }}>Edit</button>}
                {can('vehicles', 'delete') && <button className="btn sm ghost" onClick={() => act.setActive(coll, x.id, !x.active)}>{x.active ? 'Deactivate' : 'Activate'}</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div></section>

      {edit && (
        <Modal title={`${edit.id ? 'Edit' : 'Add'} ${isVeh ? 'vehicle' : 'driver'}`} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
          {isVeh ? (
            <>
              <div className="row">
                <Field label="Vehicle number"><input value={edit.number} onChange={(e) => setEdit({ ...edit, number: e.target.value })} /></Field>
                <Field label="Type"><select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{VEHICLE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
              </div>
              <div className="row">
                <Field label="Capacity (passengers)"><input type="number" min="1" value={edit.capacity} onChange={(e) => setEdit({ ...edit, capacity: e.target.value })} /></Field>
                <Field label="Manual status" hint="Change this only for repairs or when a vehicle is out of service. Trips update availability automatically."><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="available">available</option><option value="not available">not available</option></select></Field>
              </div>
            </>
          ) : (
            <div className="row">
              <Field label="Name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Phone" hint="Trip messages are sent to this number. Example: 0771234567"><input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            </div>
          )}
          {err && <p className="err">{err}</p>}
        </Modal>
      )}
    </>
  );
}