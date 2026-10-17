import { useState } from 'react';
import { useStore } from '../store.jsx';
import { Badge, Empty, Field, Modal, PageHeader, money } from '../components/ui.jsx';

const BLANK = { code: '', name: '', category: '', unit: 'piece', description: '', stock: 0, min: 0, unitPrice: 0, active: true };

export default function Items() {
  const { db, can, act } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [edit, setEdit] = useState(null);
  const [stockFor, setStockFor] = useState(null);
  const [stockQty, setStockQty] = useState(1);
  const [showCats, setShowCats] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [err, setErr] = useState('');

  const rows = db.items.filter((i) => (!q || `${i.name} ${i.code}`.toLowerCase().includes(q.toLowerCase())) && (!cat || i.category === cat));

  const save = () => {
    if (!edit.name.trim() || !edit.code.trim() || !edit.category) return setErr('Name, code and category are required.');
    if (db.items.some((i) => i.code === edit.code.trim() && i.id !== edit.id)) return setErr('This item code is already used.');
    if (!(Number(edit.unitPrice || 0) >= 0)) return setErr('Unit price must be 0 or more.');
    act.save('items', { ...edit, stock: Number(edit.stock), min: Number(edit.min), unitPrice: Number(edit.unitPrice || 0) });
    setEdit(null);
  };

  return (
    <>
      <PageHeader title="Stationery items" sub="Items, categories and current stock.">
        {can('items', 'edit') && <button className="btn" onClick={() => setShowCats(true)}>Categories</button>}
        {can('items', 'add') && <button className="btn primary" onClick={() => { setErr(''); setEdit({ ...BLANK }); }}>Add item</button>}
      </PageHeader>
      <div className="filters">
        <input placeholder="Search by name or code" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{db.categories.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      <section className="panel flush">
        {rows.length === 0 ? <Empty>No items found.</Empty> : (
          <div className="scroll"><table className="table">
            <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Unit</th><th>Unit price</th><th>In stock</th><th>Minimum</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className={i.active ? '' : 'faded'}>
                  <td>{i.code}</td>
                  <td><b>{i.name}</b><div className="sub">{i.description}</div></td>
                  <td>{i.category}</td><td>{i.unit}</td>
                  <td>{i.unitPrice > 0 ? money(i.unitPrice) : <span className="sub">Not set</span>}</td>
                  <td className={i.stock <= i.min ? 'warn' : ''}>{i.stock}{i.stock <= i.min && <span className="badge wait low">Low stock</span>}</td>
                  <td>{i.min}</td>
                  <td><Badge status={i.active ? 'Active' : 'Inactive'} /></td>
                  <td className="row-actions">
                    {can('items', 'add') && <button className="btn sm" onClick={() => { setStockFor(i); setStockQty(1); }}>Add stock</button>}
                    {can('items', 'edit') && <button className="btn sm" onClick={() => { setErr(''); setEdit(i); }}>Edit</button>}
                    {can('items', 'delete') && <button className="btn sm ghost" onClick={() => act.setActive('items', i.id, !i.active)}>{i.active ? 'Deactivate' : 'Activate'}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      {edit && (
        <Modal title={edit.id ? 'Edit item' : 'Add item'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save}>Save item</button></>}>
          <div className="row">
            <Field label="Item code"><input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
            <Field label="Name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          </div>
          <div className="row">
            <Field label="Category"><select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}><option value="">Select</option>{db.categories.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Unit"><select value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })}>{['piece', 'box', 'pack', 'ream', 'set'].map((u) => <option key={u}>{u}</option>)}</select></Field>
          </div>
          <div className="row">
            <Field label="Current stock"><input type="number" min="0" value={edit.stock} onChange={(e) => setEdit({ ...edit, stock: e.target.value })} /></Field>
            <Field label="Minimum quantity" hint="Low-stock warning appears at or below this."><input type="number" min="0" value={edit.min} onChange={(e) => setEdit({ ...edit, min: e.target.value })} /></Field>
          </div>
          <Field label="Unit price" hint="Price of one unit. Used by the Stationery costs report."><input type="number" min="0" step="0.01" value={edit.unitPrice ?? 0} onChange={(e) => setEdit({ ...edit, unitPrice: e.target.value })} /></Field>
          <Field label="Description"><textarea rows="2" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          {err && <p className="err">{err}</p>}
        </Modal>
      )}

      {stockFor && (
        <Modal title={`Add stock: ${stockFor.name}`} onClose={() => setStockFor(null)} footer={<><button className="btn" onClick={() => setStockFor(null)}>Cancel</button><button className="btn primary" onClick={() => { if (Number(stockQty) > 0) { act.addStock(stockFor.id, stockQty); setStockFor(null); } }}>Add stock</button></>}>
          <Field label={`Quantity received (${stockFor.unit})`}><input type="number" min="1" value={stockQty} onChange={(e) => setStockQty(e.target.value)} /></Field>
        </Modal>
      )}

      {showCats && (
        <Modal title="Item categories" onClose={() => setShowCats(false)}>
          <ul className="plain">{db.categories.map((c) => <li key={c}>{c}</li>)}</ul>
          <div className="row"><Field label="New category"><input value={newCat} onChange={(e) => setNewCat(e.target.value)} /></Field><button className="btn primary" onClick={() => { if (newCat.trim()) { act.addCategory(newCat.trim()); setNewCat(''); } }}>Add category</button></div>
        </Modal>
      )}
    </>
  );
}