import { useState } from 'react';
import { useStore } from '../store.jsx';
import { Badge, Empty, Field, Modal, PageHeader, Tabs, fmtDate, fmtDT } from '../components/ui.jsx';

const NEXT = { Draft: 'Approved', Approved: 'Sent', Sent: 'Received' };

export default function Purchasing() {
  const { db, can, act } = useStore();
  const [tab, setTab] = useState('Purchase orders');
  const [creating, setCreating] = useState(false);
  const [po, setPo] = useState({ supplierId: '', lines: [{ itemId: '', qty: 1 }] });
  const [openId, setOpenId] = useState(null);
  const [supplier, setSupplier] = useState(null);
  const [fSupplier, setFSupplier] = useState('');
  const [fItem, setFItem] = useState('');
  const [err, setErr] = useState('');

  const supName = (id) => db.suppliers.find((s) => s.id === id)?.name || '-';
  const itemName = (id) => db.items.find((i) => i.id === id)?.name || '-';
  const low = db.items.filter((i) => i.active && i.stock <= i.min);

  const rows = db.purchaseOrders.filter((p) => (!fSupplier || p.supplierId === Number(fSupplier)) && (!fItem || p.lines.some((l) => l.itemId === Number(fItem))));
  const open = db.purchaseOrders.find((p) => p.id === openId);

  const addLowStock = () => setPo({ ...po, lines: low.map((i) => ({ itemId: String(i.id), qty: Math.max(i.min * 2 - i.stock, 1) })) });
  const setLine = (i, k, v) => setPo({ ...po, lines: po.lines.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)) });

  const create = () => {
    const lines = po.lines.filter((l) => l.itemId && Number(l.qty) > 0).map((l) => ({ itemId: Number(l.itemId), qty: Number(l.qty) }));
    if (!po.supplierId) return setErr('Choose a supplier.');
    if (!lines.length) return setErr('Add at least one item with a quantity.');
    act.createPO(po.supplierId, lines);
    setCreating(false); setPo({ supplierId: '', lines: [{ itemId: '', qty: 1 }] });
  };

  const saveSupplier = () => {
    if (!supplier.name.trim()) return setErr('Supplier name is required.');
    act.save('suppliers', supplier); setSupplier(null);
  };

  return (
    <>
      <PageHeader title="Purchase orders" sub="Buy stationery from suppliers. Stock goes up when goods are received.">
        {tab === 'Purchase orders' && can('purchasing', 'add') && <button className="btn primary" onClick={() => { setErr(''); setCreating(true); }}>New purchase order</button>}
        {tab === 'Suppliers' && can('purchasing', 'add') && <button className="btn primary" onClick={() => { setErr(''); setSupplier({ name: '', contact: '', active: true }); }}>Add supplier</button>}
      </PageHeader>
      <Tabs tabs={['Purchase orders', 'Suppliers']} value={tab} onChange={setTab} />

      {tab === 'Purchase orders' ? (
        <>
          <div className="filters">
            <select value={fSupplier} onChange={(e) => setFSupplier(e.target.value)}><option value="">All suppliers</option>{db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <select value={fItem} onChange={(e) => setFItem(e.target.value)}><option value="">All items</option>{db.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          </div>
          <section className="panel flush">
            {rows.length === 0 ? <Empty>No purchase orders yet.</Empty> : (
              <div className="scroll"><table className="table clickable">
                <thead><tr><th>PO</th><th>Supplier</th><th>Items</th><th>Created</th><th>Status</th></tr></thead>
                <tbody>{rows.map((p) => (
                  <tr key={p.id} tabIndex="0" onClick={() => setOpenId(p.id)} onKeyDown={(e) => e.key === 'Enter' && setOpenId(p.id)}>
                    <td><b>{p.id}</b></td><td>{supName(p.supplierId)}</td><td>{p.lines.map((l) => `${itemName(l.itemId)} × ${l.qty}`).join(', ')}</td><td>{fmtDate(p.createdAt)}</td><td><Badge status={p.status} /></td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </section>
        </>
      ) : (
        <section className="panel flush"><div className="scroll"><table className="table">
          <thead><tr><th>Supplier</th><th>Contact details</th><th>Status</th><th /></tr></thead>
          <tbody>{db.suppliers.map((s) => (
            <tr key={s.id} className={s.active ? '' : 'faded'}>
              <td><b>{s.name}</b></td><td>{s.contact}</td><td><Badge status={s.active ? 'Active' : 'Inactive'} /></td>
              <td className="row-actions">
                {can('purchasing', 'edit') && <button className="btn sm" onClick={() => { setErr(''); setSupplier(s); }}>Edit</button>}
                {can('purchasing', 'delete') && <button className="btn sm ghost" onClick={() => act.setActive('suppliers', s.id, !s.active)}>{s.active ? 'Deactivate' : 'Activate'}</button>}
              </td>
            </tr>))}</tbody>
        </table></div></section>
      )}

      {creating && (
        <Modal title="New purchase order" wide onClose={() => setCreating(false)} footer={<><button className="btn" onClick={() => setCreating(false)}>Cancel</button><button className="btn primary" onClick={create}>Save as draft</button></>}>
          <Field label="Supplier"><select value={po.supplierId} onChange={(e) => setPo({ ...po, supplierId: e.target.value })}><option value="">Select a supplier</option>{db.suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          {low.length > 0 && <button className="btn" onClick={addLowStock}>Fill with {low.length} low-stock item{low.length > 1 ? 's' : ''}</button>}
          {po.lines.map((l, i) => (
            <div className="row" key={i}>
              <Field label="Item"><select value={l.itemId} onChange={(e) => setLine(i, 'itemId', e.target.value)}><option value="">Select an item</option>{db.items.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
              <Field label="Quantity"><input type="number" min="1" value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} /></Field>
              {po.lines.length > 1 && <button className="btn ghost" onClick={() => setPo({ ...po, lines: po.lines.filter((_, idx) => idx !== i) })}>Remove</button>}
            </div>
          ))}
          <button className="btn" onClick={() => setPo({ ...po, lines: [...po.lines, { itemId: '', qty: 1 }] })}>Add another item</button>
          {err && <p className="err">{err}</p>}
        </Modal>
      )}

      {open && (
        <Modal title={`${open.id} · ${supName(open.supplierId)}`} onClose={() => setOpenId(null)}>
          <Badge status={open.status} />
          <table className="table"><thead><tr><th>Item</th><th>Quantity</th></tr></thead><tbody>{open.lines.map((l, i) => <tr key={i}><td>{itemName(l.itemId)}</td><td>{l.qty}</td></tr>)}</tbody></table>
          {NEXT[open.status] && can('purchasing', 'edit') && <div className="actions"><button className="btn primary" onClick={() => act.setPOStatus(open.id, NEXT[open.status])}>Mark as {NEXT[open.status]}</button></div>}
          <h3>History</h3>
          <ul className="history">{open.history.map((h, i) => <li key={i}><b>{h.action}</b> <span>{h.by} · {fmtDT(h.at)}</span></li>)}</ul>
        </Modal>
      )}

      {supplier && (
        <Modal title={supplier.id ? 'Edit supplier' : 'Add supplier'} onClose={() => setSupplier(null)} footer={<><button className="btn" onClick={() => setSupplier(null)}>Cancel</button><button className="btn primary" onClick={saveSupplier}>Save supplier</button></>}>
          <Field label="Name"><input value={supplier.name} onChange={(e) => setSupplier({ ...supplier, name: e.target.value })} /></Field>
          <Field label="Contact details"><textarea rows="2" value={supplier.contact} onChange={(e) => setSupplier({ ...supplier, contact: e.target.value })} /></Field>
          {err && <p className="err">{err}</p>}
        </Modal>
      )}
    </>
  );
}
