import React, {createContext, useContext, useEffect, useState} from 'react';
import {onAuthStateChanged, signInWithEmailAndPassword, signOut, getMultiFactorResolver, TotpMultiFactorGenerator, TotpSecret, multiFactor, sendEmailVerification, reload, User, MultiFactorResolver, MultiFactorError} from 'firebase/auth';
import {doc, getDoc, collection, serverTimestamp, Timestamp} from 'firebase/firestore/lite';
import QRCode from 'qrcode';
import {auth, db, addAudit, newBatch, armIdleTimeout, errorMessage} from './firebase';
import {Role, ROLE_LABELS, can, isRole, Permission} from './rbac';
import {Notice, Field} from './ui';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Content from './pages/Content';
import Moderation from './pages/Moderation';
import Logs from './pages/Logs';
import Admins from './pages/Admins';
import Settings from './pages/Settings';

export type AdminSession = {user: User; uid: string; email: string; role: Role};
const SessionCtx = createContext<AdminSession | null>(null);
export const useSession = () => {const s = useContext(SessionCtx); if (!s) throw new Error('No admin session'); return s;};

type Gate = {phase: 'loading'} | {phase: 'signed-out'} | {phase: 'denied'; reason: string} | {phase: 'enroll'; user: User; role: Role} | {phase: 'ready'; session: AdminSession};

const PAGES: {id: string; label: string; perm: Permission; el: () => React.ReactElement}[] = [
  {id: 'dashboard', label: 'Dashboard', perm: 'dashboard.read', el: () => <Dashboard />},
  {id: 'users', label: 'Users', perm: 'users.read', el: () => <Users />},
  {id: 'content', label: 'Content', perm: 'content.read', el: () => <Content />},
  {id: 'moderation', label: 'Moderation', perm: 'reports.moderate', el: () => <Moderation />},
  {id: 'feedback', label: 'Feedback', perm: 'feedback.read', el: () => <Moderation feedbackOnly />},
  {id: 'logs', label: 'Audit & security', perm: 'audit.read', el: () => <Logs />},
  {id: 'admins', label: 'Admins & roles', perm: 'admins.manage', el: () => <Admins />},
  {id: 'settings', label: 'Settings', perm: 'dashboard.read', el: () => <Settings />},
];

async function logDenied(user: User) {
  try {
    const b = newBatch();
    b.set(doc(db, 'users', user.uid, 'limits', 'sec'), {last: serverTimestamp()});
    b.set(doc(collection(db, 'securityEvents')), {uid: user.uid, type: 'admin_access_denied', detail: 'portal', platform: 'web', appVersion: 'admin-0.8.0', at: serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + 90 * 86400_000)});
    await b.commit();
  } catch {/* best effort */}
}

export default function App() {
  const [gate, setGate] = useState<Gate>({phase: 'loading'});
  useEffect(() => onAuthStateChanged(auth, async user => {
    if (!user) {setGate({phase: 'signed-out'}); return;}
    try {
      const snap = await getDoc(doc(db, 'admins', user.uid));
      const data = snap.exists() ? snap.data() : null;
      if (!data || data.active !== true || !isRole(data.role)) {
        await logDenied(user);
        await signOut(auth);
        setGate({phase: 'denied', reason: 'This account is not an active GenZ Code administrator. The attempt was recorded.'});
        return;
      }
      const token = await user.getIdTokenResult();
      if (!token.signInSecondFactor) {setGate({phase: 'enroll', user, role: data.role}); return;}
      const b = newBatch();
      addAudit(b, user.uid, data.role, 'admin.login', `admins/${user.uid}`, 'portal sign-in (MFA)');
      await b.commit().catch(() => {});
      setGate({phase: 'ready', session: {user, uid: user.uid, email: user.email ?? '', role: data.role}});
    } catch (e) {
      await signOut(auth);
      setGate({phase: 'denied', reason: errorMessage(e)});
    }
  }), []);
  useEffect(() => (gate.phase === 'ready' ? armIdleTimeout(() => setGate({phase: 'denied', reason: 'Signed out after 30 minutes of inactivity.'})) : undefined), [gate.phase]);

  if (gate.phase === 'loading') return <div className="center-screen"><p className="muted">Checking session…</p></div>;
  if (gate.phase === 'signed-out' || gate.phase === 'denied') return <SignIn notice={gate.phase === 'denied' ? gate.reason : ''} />;
  if (gate.phase === 'enroll') return <EnrollMfa user={gate.user} role={gate.role} />;
  return <SessionCtx.Provider value={gate.session}><Shell /></SessionCtx.Provider>;
}

function Shell() {
  const s = useSession();
  const allowed = PAGES.filter(p => can(s.role, p.perm));
  const [page, setPage] = useState(() => allowed.find(p => p.id === location.hash.slice(1))?.id ?? allowed[0]!.id);
  useEffect(() => {const f = () => {const id = location.hash.slice(1); if (allowed.some(p => p.id === id)) setPage(id);}; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f);}, []);
  const current = allowed.find(p => p.id === page) ?? allowed[0]!;
  return <div className="layout">
    <aside className="side">
      <div className="brand"><img src="/admin/icon-64.png" alt="" width="36" height="36" /><div><strong>GenZ Code</strong><span>Admin portal</span></div></div>
      <nav aria-label="Sections">{allowed.map(p => <a key={p.id} href={`#${p.id}`} className={p.id === current.id ? 'active' : ''} aria-current={p.id === current.id ? 'page' : undefined} onClick={() => setPage(p.id)}>{p.label}</a>)}</nav>
      <div className="whoami"><span className="muted">{s.email}</span><span className="pill pill-info">{ROLE_LABELS[s.role]}</span><button className="btn ghost" onClick={() => void signOut(auth)}>Sign out</button></div>
    </aside>
    <main className="main" id="main">{current.el()}</main>
  </div>;
}

function SignIn({notice}: {notice: string}) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [code, setCode] = useState('');
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (resolver) {
        const hint = resolver.hints.find(h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
        if (!hint) throw new Error('No authenticator app is enrolled for this account.');
        await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.trim()));
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      const c = (err as {code?: string}).code;
      if (c === 'auth/multi-factor-auth-required') {setResolver(getMultiFactorResolver(auth, err as MultiFactorError)); setPassword('');}
      else if (c === 'auth/invalid-verification-code') setError('That code is not valid. Check your authenticator app and try again.');
      else if (c === 'auth/too-many-requests') setError('Too many attempts. Wait a few minutes before trying again.');
      else if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found') setError('The email or password is incorrect.');
      else setError(err instanceof Error && !c ? err.message : 'Sign-in failed. Please try again.');
    } finally {setBusy(false); setCode('');}
  };
  return <div className="center-screen">
    <form className="card auth" onSubmit={submit}>
      <div className="brand"><img src="/admin/icon-128.png" alt="" width="56" height="56" /><div><strong>GenZ Code</strong><span>Admin portal</span></div></div>
      <h1>{resolver ? 'Two-step verification' : 'Staff sign-in'}</h1>
      {notice && <Notice kind="info">{notice}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {resolver ? <Field label="6-digit code from your authenticator app"><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required /></Field> : <>
        <Field label="Email"><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} /></Field>
        <Field label="Password"><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={4096} /></Field>
      </>}
      <button className="btn primary" disabled={busy}>{busy ? 'Please wait…' : resolver ? 'Verify' : 'Sign in'}</button>
      {resolver && <button type="button" className="link" onClick={() => {setResolver(null); setCode('');}}>Use a different account</button>}
      <p className="muted small">Access requires an administrator role and an authenticator app (TOTP). Sessions end when you close this tab or after 30 minutes of inactivity. All administrative actions are logged.</p>
    </form>
  </div>;
}

function EnrollMfa({user, role}: {user: User; role: Role}) {
  const [secret, setSecret] = useState<TotpSecret | null>(null), [qr, setQr] = useState(''), [code, setCode] = useState('');
  const [error, setError] = useState(''), [info, setInfo] = useState(''), [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true); setError('');
    try {
      await reload(user);
      if (!user.emailVerified) {await sendEmailVerification(user); setInfo('Verify your email first: we sent a link. Then reload this page and sign in again.'); return;}
      const s = await TotpMultiFactorGenerator.generateSecret(await multiFactor(user).getSession());
      setSecret(s);
      setQr(await QRCode.toDataURL(s.generateQrCodeUrl(user.email ?? 'admin', 'GenZ Code Admin'), {margin: 1, width: 220}));
    } catch (e) {
      const c = (e as {code?: string}).code;
      setError(c === 'auth/operation-not-allowed' ? 'TOTP multi-factor authentication is not enabled for this Firebase project (Identity Platform). See docs/ADMIN_PORTAL.md.' : c === 'auth/requires-recent-login' ? 'Sign in again, then enrol.' : 'Could not start enrolment.');
    } finally {setBusy(false);}
  };
  const finish = async () => {
    if (!secret) return;
    setBusy(true); setError('');
    try {
      await multiFactor(user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code.trim()), 'Authenticator app');
      await signOut(auth);
    } catch {setError('That code did not verify. Check the time on your device and try again.');} finally {setBusy(false);}
  };
  return <div className="center-screen"><div className="card auth">
    <h1>Set up two-step verification</h1>
    <p className="muted">Your {ROLE_LABELS[role]} role requires an authenticator app before any admin data can be accessed. The server enforces this: without a second factor every admin request is refused.</p>
    {info && <Notice kind="info">{info}</Notice>}
    {error && <Notice kind="error">{error}</Notice>}
    {!secret ? <button className="btn primary" disabled={busy} onClick={() => void start()}>Start setup</button> : <>
      {qr && <img src={qr} alt="QR code for your authenticator app" width={220} height={220} className="qr" />}
      <p className="small muted">Can’t scan? Enter this key manually: <code className="secret">{secret.secretKey}</code></p>
      <Field label="Enter the 6-digit code"><input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
      <button className="btn primary" disabled={busy || code.length !== 6} onClick={() => void finish()}>Verify and finish</button>
      <p className="small muted">After enrolment you’ll be signed out. Sign in again with your password and a code.</p>
    </>}
    <button className="btn ghost" onClick={() => void signOut(auth)}>Cancel and sign out</button>
  </div></div>;
}
