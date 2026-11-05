import React, {useState} from 'react';
import {collection, query, where, orderBy, limit, getDocs, QueryConstraint} from 'firebase/firestore/lite';
import {db, errorMessage} from '../firebase';
import {Card, Notice, Pill, useLoad, when} from '../ui';

const ACTIONS = ['all', 'admin.login', 'admin.role.set', 'user.suspend', 'user.reactivate', 'user.delete', 'user.note', 'content.create', 'content.update', 'content.submit_review', 'content.publish', 'content.archive', 'content.rollback', 'content.import', 'submission.accept', 'submission.reject', 'report.resolve', 'report.dismiss', 'feedback.triage', 'config.update'];
const TYPES = ['all', 'login_succeeded_after_failures', 'session_expired', 'reauth_failed', 'sync_permission_denied', 'sync_blocked_account_status', 'content_validation_rejected', 'account_deletion_started', 'admin_access_denied'];

export default function Logs() {
  const [action, setAction] = useState('all'), [type, setType] = useState('all');
  const audit = useLoad(async () => {
    const c: QueryConstraint[] = action === 'all' ? [orderBy('at', 'desc'), limit(200)] : [where('action', '==', action), orderBy('at', 'desc'), limit(200)];
    return (await getDocs(query(collection(db, 'auditLogs'), ...c))).docs.map(d => ({id: d.id, ...d.data()} as {id: string; actor: string; role: string; action: string; target: string; summary: string; at: {toMillis(): number}}));
  }, [action]);
  const sec = useLoad(async () => {
    const c: QueryConstraint[] = type === 'all' ? [orderBy('at', 'desc'), limit(200)] : [where('type', '==', type), orderBy('at', 'desc'), limit(200)];
    return (await getDocs(query(collection(db, 'securityEvents'), ...c))).docs.map(d => ({id: d.id, ...d.data()} as {id: string; uid: string; type: string; detail: string; platform: string; appVersion: string; at: {toMillis(): number}}));
  }, [type]);
  return <div className="stack">
    <header className="page-head"><h1>Audit & security</h1><p className="muted">Audit entries are written in the same atomic batch as the action they describe (enforced by security rules), cannot be edited or deleted, and expire after 365 days. Security events expire after 90 days and contain no e-mail, IP address or message text.</p></header>
    <Card title="Admin audit log" subtitle="Newest 200" actions={<select aria-label="Filter by action" value={action} onChange={e => setAction(e.target.value)}>{ACTIONS.map(a => <option key={a}>{a}</option>)}</select>}>
      {audit.error ? <Notice kind="error">{errorMessage(audit.error)}</Notice> : <table><thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Target</th><th>Summary</th></tr></thead><tbody>{audit.data?.map(a => <tr key={a.id}><td>{when(a.at)}</td><td><Pill tone="info">{a.action}</Pill></td><td><code>{a.actor.slice(0, 10)}</code> <span className="small muted">{a.role}</span></td><td><code>{a.target}</code></td><td className="clip">{a.summary}</td></tr>)}</tbody></table>}
      {audit.loading && <p className="muted">Loading…</p>}
    </Card>
    <Card title="Security events" subtitle="Newest 200" actions={<select aria-label="Filter by type" value={type} onChange={e => setType(e.target.value)}>{TYPES.map(a => <option key={a}>{a}</option>)}</select>}>
      {sec.error ? <Notice kind="error">{errorMessage(sec.error)}</Notice> : <table><thead><tr><th>When</th><th>Type</th><th>User</th><th>Detail</th><th>Client</th></tr></thead><tbody>{sec.data?.map(e => <tr key={e.id}><td>{when(e.at)}</td><td><Pill tone={/denied|failed/.test(e.type) ? 'warn' : 'neutral'}>{e.type}</Pill></td><td><code>{e.uid.slice(0, 10)}</code></td><td>{e.detail || '—'}</td><td>{e.platform} · {e.appVersion}</td></tr>)}</tbody></table>}
      {sec.loading && <p className="muted">Loading…</p>}
    </Card>
  </div>;
}
