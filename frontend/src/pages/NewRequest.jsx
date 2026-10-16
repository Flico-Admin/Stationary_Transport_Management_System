import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, approverUnitId, availableVehicles } from '../store.jsx';
import { PageHeader } from '../components/ui.jsx';
import './newrequest.css';

const IconBox = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5L12 12l9-4.5M12 12v9" />
  </svg>
);
const IconCar = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 16v-4l1.8-4.5A1.5 1.5 0 0 1 7.2 6.5h9.6a1.5 1.5 0 0 1 1.4 1L20 12v4" />
    <path d="M3.5 16h17M5 12h14" /><circle cx="7.5" cy="17.5" r="1.8" /><circle cx="16.5" cy="17.5" r="1.8" />
  </svg>
);

// Small helper: label + input block used in this page only
const F = ({ label, hint, children, grow }) => (
  <label className={`nr-field ${grow ? 'grow' : ''}`}>
    <span>{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>
);

const Stepper = ({ value, onChange, min = 1 }) => (
  <div className="nr-step">
    <button type="button" onClick={() => onChange(Math.max(min, Number(value || min) - 1))} aria-label="Decrease">−</button>
    <input type="number" min={min} value={value} onChange={(e) => onChange(e.target.value)} />
    <button type="button" onClick={() => onChange(Number(value || 0) + 1)} aria-label="Increase">+</button>
  </div>
);

export default function NewRequest() {
  const { db, user, act } = useStore();
  const nav = useNavigate();
  const [type, setType] = useState('Stationery');
  const [lines, setLines] = useState([{ itemId: '', qty: 1 }]);
  const [note, setNote] = useState('');
  const [requiredDate, setRequiredDate] = useState('');
  const [trip, setTrip] = useState({ purpose: '', from: '', to: '', start: '', end: '', passengers: 1, vehicleType: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const items = db.items.filter((i) => i.active);
  const setLine = (i, k, v) => setLines(lines.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const setT = (k, v) => setTrip({ ...trip, [k]: v });
  const isStationery = type === 'Stationery';

  // Vehicle types come from the vehicles the Admin department added (active vehicles only).
  // Only a type that has a free vehicle right now can be requested.
  const vehicleTypes = [...new Set(db.vehicles.filter((v) => v.active).map((v) => v.type))].sort();
  const freeByType = {};
  availableVehicles(db).forEach((v) => { freeByType[v.type] = (freeByType[v.type] || 0) + 1; });
  const freeTypes = vehicleTypes.filter((v) => freeByType[v]);
  const vType = freeTypes.includes(trip.vehicleType) ? trip.vehicleType : freeTypes[0] || '';

  // Who approves first (shown in the summary)
  const hodUnit = db.units.find((u) => u.id === approverUnitId(db, user.unitId));
  const filled = lines.filter((l) => l.itemId && Number(l.qty) > 0);

  const submit = async () => {
    setError('');
    let data;
    if (isStationery) {
      const clean = filled.map((l) => ({ itemId: Number(l.itemId), qty: Number(l.qty) }));
      if (!clean.length) return setError('Add at least one item with a quantity.');
      if (new Set(clean.map((l) => l.itemId)).size !== clean.length) return setError('An item appears twice. Combine them into one line.');
      if (!requiredDate) return setError('Choose the date you need the items.');
      data = { type: 'stationery', lines: clean, note, requiredDate };
    } else {
      const t = trip;
      if (!t.purpose || !t.from || !t.to || !t.start || !t.end) return setError('Fill in the purpose, pickup, destination and both date and times.');
      if (t.end <= t.start) return setError('The end time must be after the start time.');
      if (!vehicleTypes.length) return setError('No vehicles have been added yet. Please ask the Admin department to add vehicles.');
      if (!vType) return setError('No vehicle is available right now. Please try again later or contact the Admin department.');
      data = { type: 'vehicle', trip: { ...t, vehicleType: vType, passengers: Number(t.passengers) }, note };
    }
    setBusy(true);
    const id = await act.createRequest(data);
    setBusy(false);
    if (id) nav('/my-requests');   // if the server refused it, a message shows and we stay on this page
  };

  return (
    <>
      <PageHeader title="New request" sub="Choose what you need, fill in the details and submit. You can follow the approval in My requests." />

      <div className="nr-types" role="tablist">
        <button type="button" role="tab" aria-selected={isStationery} className={`nr-type ${isStationery ? 'on' : ''}`} onClick={() => { setType('Stationery'); setError(''); }}>
          <span className="nr-type-ico"><IconBox /></span>
          <span><b>Stationery</b><small>Pens, paper, files and other office items</small></span>
        </button>
        <button type="button" role="tab" aria-selected={!isStationery} className={`nr-type ${!isStationery ? 'on' : ''}`} onClick={() => { setType('Vehicle'); setError(''); }}>
          <span className="nr-type-ico"><IconCar /></span>
          <span><b>Vehicle</b><small>Book a car, van or lorry for a trip</small></span>
        </button>
      </div>

      <div className="nr-layout">
        <div className="nr-main">
          {isStationery ? (
            <section className="nr-card">
              <h2>Items you need</h2>
              <div className="nr-lines">
                {lines.map((l, i) => {
                  const item = items.find((x) => x.id === Number(l.itemId));
                  return (
                    <div className="nr-line" key={i}>
                      <F label={i === 0 ? 'Item' : ''} grow>
                        <select value={l.itemId} onChange={(e) => setLine(i, 'itemId', e.target.value)}>
                          <option value="">Select an item</option>
                          {items.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
                        </select>
                        {item && <small>{item.stock} {item.unit} in stock</small>}
                      </F>
                      <F label={i === 0 ? `Quantity${item ? ` (${item.unit})` : ''}` : ''}>
                        <Stepper value={l.qty} onChange={(v) => setLine(i, 'qty', v)} />
                      </F>
                      {lines.length > 1 && (
                        <button type="button" className="nr-x" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} aria-label="Remove this item">✕</button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button type="button" className="nr-add" onClick={() => setLines([...lines, { itemId: '', qty: 1 }])}>+ Add another item</button>
            </section>
          ) : (
            <>
              <section className="nr-card">
                <h2>Trip details</h2>
                <F label="Purpose of the trip"><input value={trip.purpose} placeholder="e.g. Client site visit" onChange={(e) => setT('purpose', e.target.value)} /></F>
                <div className="nr-route">
                  <F label="Pickup location" grow><input value={trip.from} placeholder="e.g. Head office" onChange={(e) => setT('from', e.target.value)} /></F>
                  <span className="nr-arrow" aria-hidden="true">→</span>
                  <F label="Destination" grow><input value={trip.to} placeholder="e.g. Showroom 2" onChange={(e) => setT('to', e.target.value)} /></F>
                </div>
              </section>
              <section className="nr-card">
                <h2>Schedule</h2>
                <div className="nr-two">
                  <F label="From"><input type="datetime-local" value={trip.start} onChange={(e) => setT('start', e.target.value)} /></F>
                  <F label="To"><input type="datetime-local" value={trip.end} onChange={(e) => setT('end', e.target.value)} /></F>
                </div>
              </section>
              <section className="nr-card">
                <h2>Passengers and vehicle</h2>
                <div className="nr-two">
                  <F label="Passengers"><Stepper value={trip.passengers} onChange={(v) => setT('passengers', v)} /></F>
                </div>
                <div className="nr-label">Vehicle type</div>
                {vehicleTypes.length ? (
                  <>
                    <div className="nr-seg" role="radiogroup" aria-label="Vehicle type">
                      {vehicleTypes.map((v) => {
                        const free = freeByType[v] || 0;
                        return (
                          <button type="button" key={v} role="radio" aria-checked={vType === v} className={vType === v ? 'on' : ''} disabled={!free}
                            style={free ? undefined : { opacity: 0.5, cursor: 'not-allowed' }} onClick={() => setT('vehicleType', v)}>
                            {v} ({free ? `${free} available` : 'none available'})
                          </button>
                        );
                      })}
                    </div>
                    {!freeTypes.length && <p className="nr-empty">No vehicle is available right now. Please try again later or contact the Admin department.</p>}
                  </>
                ) : (
                  <p className="nr-empty">No vehicles have been added yet. Please ask the Admin department to add vehicles.</p>
                )}
              </section>
            </>
          )}

          {isStationery && (
            <section className="nr-card">
              <h2>When do you need it?</h2>
              <div className="nr-two">
                <F label="Needed by"><input type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} /></F>
              </div>
            </section>
          )}

          <section className="nr-card">
            <h2>Reason or note <span className="nr-opt">optional</span></h2>
            <textarea rows="3" value={note} placeholder="Anything the approvers should know" onChange={(e) => setNote(e.target.value)} />
          </section>
        </div>

        <aside className="nr-side">
          <div className="nr-card nr-summary">
            <h2>Summary</h2>
            <dl>
              <div><dt>Request type</dt><dd>{isStationery ? 'Stationery' : 'Vehicle'}</dd></div>
              {isStationery ? (
                <>
                  <div><dt>Items</dt><dd>{filled.length ? `${filled.length} item${filled.length > 1 ? 's' : ''}` : 'None yet'}</dd></div>
                  <div><dt>Needed by</dt><dd>{requiredDate || 'Not set'}</dd></div>
                </>
              ) : (
                <>
                  <div><dt>Route</dt><dd>{trip.from && trip.to ? `${trip.from} → ${trip.to}` : 'Not set'}</dd></div>
                  <div><dt>Vehicle</dt><dd>{vType || 'Not set'}, {Number(trip.passengers) || 1} passenger{Number(trip.passengers) > 1 ? 's' : ''}</dd></div>
                </>
              )}
            </dl>

            <div className="nr-flow">
              <div className="nr-flow-title">Approval steps</div>
              <ol>
                <li className="done"><i />You submit</li>
                <li><i />{hodUnit ? `${hodUnit.name} HOD approves` : 'Your HOD approves'}</li>
                <li><i />Admin department approves</li>
                <li><i />{isStationery ? 'Items are issued' : 'Vehicle is assigned'}</li>
              </ol>
            </div>

            {error && <div className="nr-err" role="alert">{error}</div>}
            <button type="button" className="nr-submit" onClick={submit} disabled={busy || (!isStationery && !vType)}>{busy ? 'Submitting...' : 'Submit request'}</button>
          </div>
        </aside>
      </div>
    </>
  );
}