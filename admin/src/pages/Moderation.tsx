import React, {useState} from 'react';
import {collection, query, where, orderBy, limit, getDocs, doc, serverTimestamp} from 'firebase/firestore/lite';
import {db, addAudit, newBatch, errorMessage} from '../firebase';
import {useSession} from '../App';
import {can} from '../rbac';
import {Card, Notice, Pill, useLoad, when, fmt} from '../ui';
import {validateEntry} from '../../../shared/contentSchema';
import {slugId} from '../lib/contentOps';

type Sub = {id: string; term: string; meaning: string; example: string; category: string; uid: string; createdAt: {toMillis(): number}};
type Rep = {id: string; termId: string; reason: string; note: string; uid: string; createdAt: {toMillis(): number}};
type Fb = {id: string; rating: number; message: string; appVersion: string; platform: string; createdAt: {toMillis(): number}};
const list = async <T,>(name: string, status: string) => (await getDocs(query(collection(db, name), where('status', '==', status), orderBy('createdAt', 'desc'), limit(100)))).docs.map(d => ({id: d.id, ...d.data()}) as T);

export default function Moderation({feedbackOnly = false}: {feedbackOnly?: boolean}) {
  const s = useSession();
  const [msg, setMsg] = useState<{kind: 'ok' | 'error'; text: string} | null>(null), [busy, setBusy] = useState(false);
  const subs = useLoad(() => (!feedbackOnly && can(s.role, 'submissions.review') ? list<Sub>('submissions', 'pending') : Promise.resolve([])), []);
  const reps = useLoad(() => (!feedbackOnly && can(s.role, 'reports.moderate') ? list<Rep>('reports', 'open') : Promise.resolve([])), []);
  const fbs = useLoad(() => (can(s.role, 'feedback.read') && (feedbackOnly || s.role === 'super_admin') ? list<Fb>('feedback', 'new') : Promise.resolve([])), []);
  const run = async (fn: () => Promise<void>, ok: string, reload: () => void) => {setBusy(true); setMsg(null); try {await fn(); setMsg({kind: 'ok', text: ok}); reload();} catch (e) {setMsg({kind: 'error', text: errorMessage(e)});} finally {setBusy(false);}};

  /** Accept = one atomic batch: new CMS draft (+version, audited) and the submission update (audited). */
  const accept = (x: Sub) => run(async () => {
    const v = validateEntry({term: x.term, meaning: x.meaning, example: x.example, category: x.category});
    if (!v.ok) throw new Error(v.errors.join(' '));
    const id = slugId(x.term), b = newBatch();
    const contentAudit = addAudit(b, s.uid, s.role, 'content.create', `content/${id}`, `from suggestion ${x.id}`);
    const entry = {...v.entry, id};
    b.set(doc(db, 'content', id), {...entry, status: 'draft', version: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: s.uid, lastAuditId: contentAudit});
    b.set(doc(db, 'content', id, 'versions', '1'), {snapshot: {...entry, status: 'draft'}, by: s.uid, at: serverTimestamp(), action: 'create'});
    const subAudit = addAudit(b, s.uid, s.role, 'submission.accept', `submissions/${x.id}`, x.term);
    b.update(doc(db, 'submissions', x.id), {status: 'accepted', reviewedBy: s.uid, reviewedAt: serverTimestamp(), contentId: id, lastAuditId: subAudit});
    await b.commit();
  }, 'Accepted. A draft was created in Content for editing and review — nothing is published yet.', subs.reload);
  const reject = (x: Sub) => run(async () => {
    const b = newBatch();
    const lastAuditId = addAudit(b, s.uid, s.role, 'submission.reject', `submissions/${x.id}`, x.term);
    b.update(doc(db, 'submissions', x.id), {status: 'rejected', reviewedBy: s.uid, reviewedAt: serverTimestamp(), lastAuditId});
    await b.commit();
  }, 'Suggestion rejected.', subs.reload);
  const resolve = (x: Rep, status: 'resolved' | 'dismissed', resolution: string) => run(async () => {
    const b = newBatch();
    const lastAuditId = addAudit(b, s.uid, s.role, status === 'resolved' ? 'report.resolve' : 'report.dismiss', `reports/${x.id}`, `${x.termId}: ${resolution}`);
    b.update(doc(db, 'reports', x.id), {status, resolvedBy: s.uid, resolvedAt: serverTimestamp(), resolution: resolution.slice(0, 300), lastAuditId});
    await b.commit();
  }, `Report ${status}.`, reps.reload);
  const triage = (x: Fb) => run(async () => {
    const b = newBatch();
    const lastAuditId = addAudit(b, s.uid, s.role, 'feedback.triage', `feedback/${x.id}`, `rating ${x.rating}`);
    b.update(doc(db, 'feedback', x.id), {status: 'triaged', triagedBy: s.uid, triagedAt: serverTimestamp(), lastAuditId});
    await b.commit();
  }, 'Marked as triaged.', fbs.reload);

  return <div className="stack">
    <header className="page-head"><h1>{feedbackOnly ? 'Feedback' : 'Moderation'}</h1><p className="muted">User submissions are untrusted. They are displayed as plain text and never published without editorial review.</p></header>
    {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
    {!feedbackOnly && can(s.role, 'submissions.review') && <Card title="Word suggestions" subtitle={`${fmt(subs.data?.length)} pending (newest 100)`}>
      {subs.error ? <Notice kind="error">{errorMessage(subs.error)}</Notice> : subs.data?.length ? <table><thead><tr><th>Term</th><th>Meaning / example</th><th>Category</th><th>Received</th><th /></tr></thead><tbody>{subs.data.map(x => <tr key={x.id}><td><strong>{x.term}</strong></td><td className="clip">{x.meaning}{x.example ? <><br /><em className="muted">“{x.example}”</em></> : null}</td><td>{x.category}</td><td>{when(x.createdAt)}</td><td className="row"><button className="btn" disabled={busy} onClick={() => void accept(x)}>Accept as draft</button><button className="btn ghost" disabled={busy} onClick={() => void reject(x)}>Reject</button></td></tr>)}</tbody></table> : <p className="muted">{subs.loading ? 'Loading…' : 'No pending suggestions.'}</p>}
    </Card>}
    {!feedbackOnly && can(s.role, 'reports.moderate') && <Card title="Content reports" subtitle={`${fmt(reps.data?.length)} open (newest 100)`}>
      {reps.error ? <Notice kind="error">{errorMessage(reps.error)}</Notice> : reps.data?.length ? <table><thead><tr><th>Entry</th><th>Reason</th><th>Note</th><th>Received</th><th /></tr></thead><tbody>{reps.data.map(x => <ReportRow key={x.id} x={x} busy={busy} onResolve={resolve} />)}</tbody></table> : <p className="muted">{reps.loading ? 'Loading…' : 'No open reports.'}</p>}
    </Card>}
    {can(s.role, 'feedback.read') && (feedbackOnly || s.role === 'super_admin') && <Card title="App feedback" subtitle={`${fmt(fbs.data?.length)} new (newest 100). Average rating and totals are on the dashboard.`}>
      {fbs.error ? <Notice kind="error">{errorMessage(fbs.error)}</Notice> : fbs.data?.length ? <table><thead><tr><th>Rating</th><th>Message</th><th>App</th><th>Received</th><th /></tr></thead><tbody>{fbs.data.map(x => <tr key={x.id}><td><Pill tone={x.rating >= 4 ? 'good' : x.rating <= 2 ? 'bad' : 'warn'}>{x.rating} / 5</Pill></td><td className="clip">{x.message || <span className="muted">—</span>}</td><td>{x.appVersion} · {x.platform}</td><td>{when(x.createdAt)}</td><td>{can(s.role, 'feedback.triage') && <button className="btn ghost" disabled={busy} onClick={() => void triage(x)}>Mark triaged</button>}</td></tr>)}</tbody></table> : <p className="muted">{fbs.loading ? 'Loading…' : 'No new feedback.'}</p>}
    </Card>}
  </div>;
}

function ReportRow({x, busy, onResolve}: {x: Rep; busy: boolean; onResolve: (x: Rep, s: 'resolved' | 'dismissed', note: string) => void}) {
  const [note, setNote] = useState('');
  return <tr><td><code>{x.termId}</code></td><td>{x.reason}</td><td className="clip">{x.note || <span className="muted">—</span>}</td><td>{when(x.createdAt)}</td>
    <td><input aria-label="Resolution note" placeholder="Resolution note" value={note} onChange={e => setNote(e.target.value)} maxLength={300} /><div className="row"><button className="btn" disabled={busy} onClick={() => onResolve(x, 'resolved', note)}>Resolve</button><button className="btn ghost" disabled={busy} onClick={() => onResolve(x, 'dismissed', note)}>Dismiss</button></div></td></tr>;
}
