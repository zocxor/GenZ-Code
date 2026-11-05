import React, {useState} from 'react';
import {collection, getDocs, doc, serverTimestamp} from 'firebase/firestore/lite';
import {db, addAudit, newBatch, errorMessage} from '../firebase';
import {useSession} from '../App';
import {ROLES, ROLE_LABELS, PERMISSIONS, Role} from '../rbac';
import {Card, Notice, Pill, Field, ConfirmButton, useLoad, when} from '../ui';

export default function Admins() {
  const s = useSession();
  const admins = useLoad(async () => (await getDocs(collection(db, 'admins'))).docs.map(d => ({uid: d.id, ...d.data()} as {uid: string; role: Role; active: boolean; email: string; updatedAt?: {toMillis(): number}})), []);
  const [uid, setUid] = useState(''), [email, setEmail] = useState(''), [role, setRole] = useState<Role>('analyst');
  const [msg, setMsg] = useState<{kind: 'ok' | 'error'; text: string} | null>(null), [busy, setBusy] = useState(false);
  const write = async (target: string, data: {role: Role; active: boolean; email: string}, summary: string) => {
    setBusy(true); setMsg(null);
    try {
      if (target === s.uid) throw Object.assign(new Error(), {code: 'self'});
      const b = newBatch();
      const lastAuditId = addAudit(b, s.uid, s.role, 'admin.role.set', `admins/${target}`, summary);
      b.set(doc(db, 'admins', target), {...data, updatedAt: serverTimestamp(), updatedBy: s.uid, lastAuditId});
      await b.commit();
      setMsg({kind: 'ok', text: 'Saved. The change applies on the person’s next request.'}); admins.reload();
    } catch (e) {setMsg({kind: 'error', text: (e as {code?: string}).code === 'self' ? 'You cannot change your own role. Ask another Super Admin.' : errorMessage(e)});} finally {setBusy(false);}
  };
  return <div className="stack">
    <header className="page-head"><h1>Admins & roles</h1><p className="muted">Roles are stored in Firestore and enforced by security rules on every request; every admin must also use an authenticator app. Changes are audited. You cannot edit your own record.</p></header>
    {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
    <Card title="Grant or change a role" subtitle="The person must already have a GenZ Code account. Find their user ID in Users (or Firebase Console → Authentication).">
      <div className="form-grid">
        <Field label="User ID"><input value={uid} onChange={e => setUid(e.target.value.trim())} maxLength={128} /></Field>
        <Field label="E-mail (for display)"><input type="email" value={email} onChange={e => setEmail(e.target.value.trim())} maxLength={254} /></Field>
        <Field label="Role"><select value={role} onChange={e => setRole(e.target.value as Role)}>{ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>
      </div>
      <button className="btn primary" disabled={busy || !/^[A-Za-z0-9_-]{6,128}$/.test(uid) || !email.includes('@')} onClick={() => void write(uid, {role, active: true, email}, `grant ${role}`)}>Save role</button>
    </Card>
    <Card title="Administrators">
      {admins.error ? <Notice kind="error">{errorMessage(admins.error)}</Notice> : <table><thead><tr><th>Admin</th><th>Role</th><th>Status</th><th>Updated</th><th /></tr></thead><tbody>{admins.data?.map(a => <tr key={a.uid}>
        <td>{a.email}<br /><code className="small">{a.uid}</code></td><td>{ROLE_LABELS[a.role] ?? a.role}</td><td><Pill tone={a.active ? 'good' : 'bad'}>{a.active ? 'active' : 'revoked'}</Pill></td><td>{when(a.updatedAt)}</td>
        <td>{a.uid !== s.uid && (a.active ? <ConfirmButton label="Revoke" word="REVOKE" disabled={busy} onConfirm={() => void write(a.uid, {role: a.role, active: false, email: a.email}, 'revoke access')} /> : <button className="btn ghost" disabled={busy} onClick={() => void write(a.uid, {role: a.role, active: true, email: a.email}, 'restore access')}>Restore</button>)}</td>
      </tr>)}</tbody></table>}
    </Card>
    <Card title="Role permissions">
      <table><thead><tr><th>Role</th><th>Permissions</th></tr></thead><tbody>{ROLES.map(r => <tr key={r}><td>{ROLE_LABELS[r]}</td><td className="small">{PERMISSIONS[r].join(' · ')}</td></tr>)}</tbody></table>
    </Card>
  </div>;
}
