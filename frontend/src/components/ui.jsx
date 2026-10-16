import { useEffect } from 'react';

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
export const fmtDT = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
export const money = (n) => Number(n || 0).toLocaleString('en-US');

const TONE = {
  'Pending HOD Approval': 'wait', 'Pending Admin Approval': 'wait', Approved: 'ok', 'No Vehicle Available': 'bad', 'Issued / Completed': 'done',
  Rejected: 'bad', Cancelled: 'mute', Draft: 'mute', Sent: 'wait', Received: 'done', available: 'ok', 'not available': 'bad',
  Active: 'ok', Inactive: 'mute', Error: 'bad', Success: 'ok',
};
export const Badge = ({ status }) => <span className={`badge ${TONE[status] || 'mute'}`}>{status}</span>;

export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Field = ({ label, hint, children }) => (
  <label className="field">
    <span>{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>
);

export const PageHeader = ({ title, sub, children }) => (
  <div className="page-head">
    <div>
      <h1>{title}</h1>
      {sub && <p className="sub">{sub}</p>}
    </div>
    <div className="page-actions">{children}</div>
  </div>
);

export const Empty = ({ children }) => <div className="empty">{children}</div>;

export const Tabs = ({ tabs, value, onChange }) => (
  <div className="tabs" role="tablist">
    {tabs.map((t) => (
      <button key={t} role="tab" aria-selected={value === t} className={value === t ? 'on' : ''} onClick={() => onChange(t)}>{t}</button>
    ))}
  </div>
);

export function downloadCsv(filename, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
}