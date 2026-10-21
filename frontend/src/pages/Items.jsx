import { useEffect, useState } from 'react';
import { useStore } from '../store.jsx';
import { api } from '../api.js';
import { Badge, Empty, Field, Modal, PageHeader, fmtDate, money } from '../components/ui.jsx';
import { todayText } from '../approval.js';

const BLANK = { code: '', name: '', category: '', unit: 'piece', description: '', stock: 0, min: 0, unitPrice: 0, active: true };

export default function Items() {
  const { db, can, act } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [edit, setEdit] = useState(null);
  const [stockFor, setStockFor] = useState(null);
  const [stockForm, setStockForm] = useState({ qty: 1, unitPrice: '', receivedDate: todayText(), note: '' });
  const [stockErr, setStockErr] = useState('');
  const [histFor, setHistFor] = useState(null);      // the item whose stock history is open
  const [hist, setHist] = useState(null);            // its batches (null = loading)
  const [histErr, setHistErr] = useState('');
  const [priceEdit, setPriceEdit] = useState({});    // batchId -> price being typed
  const [showCats, setShowCats] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [err, setErr] = useState('');

  const rows = db.items.filter((i) => (!q || `${i.name} ${i.code}`.toLowerCase().includes(q.toLowerCase())) && (!cat || i.category === cat));

  const openAddStock = (i) => {
    setStockErr('');
    setStockForm({ qty: 1, unitPrice: i.unitPrice > 0 ? String(i.unitPrice) : '', receivedDate: todayText(), note: '' });   // the current price is only a suggestion
    setStockFor(i);
  };
  const saveStock = async () => {
    const qty = Number(stockForm.qty); const price = Number(stockForm.unitPrice);
    if (!Number.isInteger(qty) || qty < 1) return setStockErr('Quantity must be a whole number, 1 or more.');
    if (stockForm.unitPrice === '' || !Number.isFinite(price) || price < 0) return setStockErr('Enter the price of one unit for this stock (0 or more).');
    if (!stockForm.receivedDate) return setStockErr('Choose the date received.');
    if (stockForm.receivedDate > todayText()) return setStockErr('The date received cannot be in the future.');
    await act.addStock(stockFor.id, { qty, unitPrice: price, receivedDate: stockForm.receivedDate, note: stockForm.note.trim() });
    setStockFor(null);
  };

  // stock history (the deliveries of one item and their prices)
  const loadHist = (item) => {
    setHistErr('');
    api('GET', `/items/${item.id}/batches`).then((r) => setHist(r.rows)).catch((e) => setHistErr(e.message));
  };
  useEffect(() => { if (histFor) { setHist(null); setPriceEdit({}); loadHist(histFor); } }, [histFor]);   // eslint-disable-line react-hooks/exhaustive-deps
  const fixPrice = async (b) => {
    const v = priceEdit[b.id];
    if (v === '' || v == null || !(Number(v) >= 0)) return setHistErr('Enter a price (0 or more).');
    await act.setBatchPrice(b.id, v);
    loadHist(histFor);
    setPriceEdit({ ...priceEdit, [b.id]: undefined });
  };
  const histLeft = (hist || []).filter((b) => b.qtyLeft > 0);
  const histQty = histLeft.reduce((n, b) => n + b.qtyLeft, 0);
  const histValue = histLeft.reduce((n, b) => n + b.qtyLeft * b.unitPrice, 0);

  const save = () => {
    if (!edit.name.trim() || !edit.code.trim() || !edit.category) return setErr('Name, code and category are required.');
    if (db.items.some((i) => i.code === edit.code.trim() && i.id !== edit.id)) return setErr('This item code is already used.');
    if (!(Number(edit.unitPrice || 0) >= 0)) return setErr('Unit price must be 0 or more.');
    act.save('items', { ...edit, stock: Number(edit.stock), min: Number(edit.min), unitPrice: Number(edit.unitPrice || 0) });
    setEdit(null);
  };

  return (
    <>
      <PageHeader title="Stationery items" sub="Items, categories and current stock. Every Add stock saves the price of that delivery.">
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
            <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Unit</th><th>Current price</th><th>In stock</th><th>Minimum</th><th>Status</th><th /></tr></thead>
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
                    {can('items', 'add') && <button className="btn sm" onClick={() => openAddStock(i)}>Add stock</button>}
                    <button className="btn sm ghost" onClick={() => setHistFor(i)}>Stock history</button>
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
            <Field label="Current stock" hint={edit.id ? 'Only to correct a wrong number. To receive new stock use Add stock, so its price is saved.' : 'Stock you already have. It is saved with the unit price below.'}><input type="number" min="0" value={edit.stock} onChange={(e) => setEdit({ ...edit, stock: e.target.value })} /></Field>
            <Field label="Minimum quantity" hint="Low-stock warning appears at or below this."><input type="number" min="0" value={edit.min} onChange={(e) => setEdit({ ...edit, min: e.target.value })} /></Field>
          </div>
          <Field label={edit.id ? 'Current price' : 'Unit price'} hint={edit.id ? 'The latest price of one unit. Stock already in the store keeps the price it was bought at; new stock gets the price you enter in Add stock.' : 'Price of one unit. Used for the stock you enter above.'}><input type="number" min="0" step="0.01" value={edit.unitPrice ?? 0} onChange={(e) => setEdit({ ...edit, unitPrice: e.target.value })} /></Field>
          <Field label="Description"><textarea rows="2" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          {err && <p className="err">{err}</p>}
        </Modal>
      )}

      {stockFor && (
        <Modal title={`Add stock: ${stockFor.name}`} onClose={() => setStockFor(null)} footer={<><button className="btn" onClick={() => setStockFor(null)}>Cancel</button><button className="btn primary" onClick={saveStock}>Add stock</button></>}>
          <div className="row">
            <Field label={`Quantity received (${stockFor.unit})`}><input type="number" min="1" step="1" value={stockForm.qty} onChange={(e) => { setStockForm({ ...stockForm, qty: e.target.value }); setStockErr(''); }} /></Field>
            <Field label="Price of one unit" hint="The price you paid for this delivery."><input type="number" min="0" step="0.01" value={stockForm.unitPrice} onChange={(e) => { setStockForm({ ...stockForm, unitPrice: e.target.value }); setStockErr(''); }} /></Field>
          </div>
          <div className="row">
            <Field label="Date received"><input type="date" max={todayText()} value={stockForm.receivedDate} onChange={(e) => setStockForm({ ...stockForm, receivedDate: e.target.value })} /></Field>
            <Field label="Note (optional)" hint="For example the supplier or invoice number."><input maxLength={255} value={stockForm.note} onChange={(e) => setStockForm({ ...stockForm, note: e.target.value })} /></Field>
          </div>
          {Number(stockForm.qty) > 0 && stockForm.unitPrice !== '' && <p className="sub">This delivery costs {money(Math.round(Number(stockForm.qty) * Number(stockForm.unitPrice) * 100) / 100)} in total. Items are issued oldest stock first, so each request costs what its stock was bought at.</p>}
          {stockErr && <p className="err" role="alert">{stockErr}</p>}
        </Modal>
      )}

      {histFor && (
        <Modal wide title={`Stock history: ${histFor.name}`} onClose={() => setHistFor(null)}>
          {histErr && <p className="err">{histErr}</p>}
          {!hist && !histErr && <p className="sub">Loading...</p>}
          {hist && (
            <>
              <p className="sub">In the store now: <b>{histQty}</b> {histFor.unit}(s), worth <b>{money(Math.round(histValue * 100) / 100)}</b>{histQty > 0 && <> (average {money(Math.round((histValue / histQty) * 100) / 100)} each)</>}. Oldest stock is issued first.</p>
              {hist.length === 0 ? <Empty>No deliveries are recorded for this item yet.</Empty> : (
                <div className="scroll"><table className="table">
                  <thead><tr><th>Received</th><th>Type</th><th>Quantity</th><th>Left</th><th>Price each</th><th>Note</th></tr></thead>
                  <tbody>
                    {hist.map((b) => {
                      const canFix = can('items', 'edit') && b.qtyLeft === b.qtyReceived;   // nothing issued from it yet
                      return (
                        <tr key={b.id} className={b.qtyLeft === 0 ? 'faded' : ''}>
                          <td>{fmtDate(b.receivedDate)}</td>
                          <td>{{ purchase: 'Added stock', opening: 'Opening balance', po: 'Purchase order', adjustment: 'Correction' }[b.source] || b.source}</td>
                          <td>{b.qtyReceived}</td>
                          <td>{b.qtyLeft}</td>
                          <td>
                            {canFix && priceEdit[b.id] !== undefined ? (
                              <span className="row-actions"><input style={{ width: 90 }} type="number" min="0" step="0.01" value={priceEdit[b.id]} onChange={(e) => setPriceEdit({ ...priceEdit, [b.id]: e.target.value })} /><button className="btn sm primary" onClick={() => fixPrice(b)}>Save</button></span>
                            ) : (
                              <>{money(b.unitPrice)} {canFix && <button className="btn sm ghost" onClick={() => setPriceEdit({ ...priceEdit, [b.id]: String(b.unitPrice) })}>Correct</button>}</>
                            )}
                          </td>
                          <td>{b.note}{b.createdBy ? <div className="sub">{b.createdBy}</div> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              )}
            </>
          )}
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