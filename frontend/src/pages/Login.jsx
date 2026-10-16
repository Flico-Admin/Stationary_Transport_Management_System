import { useState } from 'react';
import { useStore } from '../store.jsx';

// Small line icons, drawn inline so no extra package is needed
const PATHS = {
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  lock: <><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.5 7.6A16.6 16.6 0 0 0 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  box: <><path d="M21 8 12 3 3 8v8l9 5 9-5V8z" /><path d="m3 8 9 5 9-5M12 13v8" /></>,
  truck: <><path d="M3 6h11v10H3z" /><path d="M14 9h4l3 3v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></>,
};
const Icon = ({ name, size = 20, className }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {PATHS[name]}
  </svg>
);

const POINTS = [
  { icon: 'box', title: 'Request stationery', text: 'Pick items and quantities in a few clicks.' },
  { icon: 'truck', title: 'Book a vehicle', text: 'Enter the trip and see when it is free.' },
  { icon: 'check', title: 'Track every approval', text: 'HOD, Admin and issue steps, with full history.' },
];

export default function Login() {
  const { login, loading } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true); setError('');
    const res = await login(email.trim().toLowerCase(), password);
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  if (loading) return <div className="auth-loading"><span className="spinner dark" /> Loading...</div>;

  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="auth-logo">
          <span className="mark"><Icon name="box" size={22} /></span>
          <span>Request Desk</span>
        </div>

        <div className="auth-hero">
          <h2>Stationery and vehicle requests, all in one place.</h2>
          <p>No more searching through emails. Ask, approve and track from one screen.</p>
          <ul className="auth-points">
            {POINTS.map((p) => (
              <li key={p.title}>
                <span className="ico"><Icon name={p.icon} size={20} /></span>
                <div><b>{p.title}</b><span>{p.text}</span></div>
              </li>
            ))}
          </ul>
        </div>

        <div className="auth-foot">Stationery and Transport Management System</div>
      </aside>

      <main className="auth-panel">
        <form className="auth-card" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <h1>Welcome back</h1>
          <p className="lead">Log in with the email and password the IT department gave you.</p>

          <label className="field">
            <span>Email</span>
            <div className="input-wrap">
              <Icon name="mail" size={18} className="lead-ico" />
              <input type="email" value={email} autoComplete="username" placeholder="you@company.com" autoFocus
                onChange={(e) => { setEmail(e.target.value); setError(''); }} />
            </div>
          </label>

          <label className="field">
            <span>Password</span>
            <div className="input-wrap">
              <Icon name="lock" size={18} className="lead-ico" />
              <input type={show ? 'text' : 'password'} value={password} autoComplete="current-password" placeholder="Enter your password"
                onChange={(e) => { setPassword(e.target.value); setError(''); }} />
              <button type="button" className="icon-btn peek" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
                <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
          </label>

          {error && <div className="auth-error" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div>}

          <button type="submit" className="btn primary lg block" disabled={busy}>
            {busy && <span className="spinner" />}{busy ? 'Logging in...' : 'Log in'}
          </button>

          <p className="auth-note">Forgot your password? Ask the IT department to reset it.</p>
        </form>
      </main>
    </div>
  );
}