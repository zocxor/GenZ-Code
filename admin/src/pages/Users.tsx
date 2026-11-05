import React, {useState} from 'react';
import {collection, query, where, orderBy, limit, startAfter, getDocs, getDoc, doc, serverTimestamp, QueryDocumentSnapshot, DocumentData, QueryConstraint} from 'firebase/firestore/lite';
import {db, addAudit, newBatch, errorMessage} from '../firebase';
import {useSession} from '../App';
import {can} from '../rbac';
import {Card, Notice, Pill, Field, ConfirmButton, useLoad, fmt, when} from '../ui';

type UserRow = {uid: string; status: string; createdAt?: {toMillis(): number}; lastActiveAt?: {toMillis(): number}; appVersion?: string; platform?: string; stats?: Record<string, number>; statusReason?: string};
const PAGE = 25;
const statusTone = (s: string) => (s === 'active' ? 'good' : s === 'suspended' ? 'warn' : 'bad');

export default function Users() {
  const s = useSession();
  const [status, setStatus] = useState('live'), [sort, setSort] = useState<'createdAt' | 'lastActiveAt'>('lastActiveAt');
  const [search, setSearch] = useState(''), [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<UserRow[]>([]), [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null), [more, setMore] = useState(false);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false);

  const load = async (reset: boolean) => {
    setLoading(true); setError('');
    try {
      const filters: QueryConstraint[] = [status === 'live' ? where('status', 'in', ['active', 'suspended']) : where('status', '==', status), orderBy(sort, 'desc'), limit(PAGE)];
      if (!reset && cursor) filters.push(startAfter(cursor));
      const snap = await getDocs(query(collection(db, 'users'), ...filters));
      const page = snap.docs.map(d => ({uid: d.id, ...(d.data() as Omit<UserRow, 'uid'>)}));
      setRows(r => (reset ? page : [...r, ...page]));
      setCursor(snap.docs.at(-1) ?? null); setMore(snap.size === PAGE);
    } catch (e) {setError(errorMessage(e));} finally {setLoading(false);}
  };
  React.useEffect(() => {void load(true);}, [status, sort]);

  const find = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    const q = search.trim();
    if (!q) return;
    try {
      if (q.includes('@')) {
        if (!can(s.role, 'users.pii')) {setError('Your role cannot search by e-mail. Search by user ID instead.'); return;}
        const lower = q.toLowerCase();
        const snap = await getDocs(query(collection(db, 'directory'), where('email', '>=', lower), where('email', '<=', lower + '\uf8ff'), limit(10)));
        if (snap.empty) {setError('No account with that e-mail prefix.'); return;}
        if (snap.size === 1) setSelected(snap.docs[0]!.id);
        else {const found = await Promise.all(snap.docs.map(d => getDoc(doc(db, 'users', d.id)))); setRows(found.filter(f => f.exists()).map(f => ({uid: f.id, ...(f.data() as Omit<UserRow, 'uid'>)}))); setMore(false);}
      } else {
        if (!/^[A-Za-z0-9_-]{6,128}$/.test(q)) {setError('Enter a full user ID or an e-mail address.'); return;}
        const snap = await getDoc(doc(db, 'users', q));
        if (!snap.exists()) {setError('No account with that user ID.'); return;}
        setSelected(q);
      }
    } catch (err) {setError(errorMessage(err));}
  };

  if (selected) return <UserDetail uid={selected} onBack={() => {setSelected(null); void load(true);}} />;
  return <div className="stack">
    <header className="page-head"><h1>Users</h1><p className="muted">Accounts with a cloud profile. Passwords and tokens are never visible; e-mail is shown only to roles that need it.</p></header>
    <Card>
      <form className="row wrap" onSubmit={find}>
        <input className="grow" aria-label="Search users" placeholder={can(s.role, 'users.pii') ? 'Search by e-mail prefix or user ID' : 'Search by user ID'} value={search} onChange={e => setSearch(e.target.value)} maxLength={254} />
        <button className="btn">Search</button>
        <select aria-label="Status filter" value={status} onChange={e => setStatus(e.target.value)}><option value="live">Active + suspended</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="deleted">Deletion tombstones</option></select>
        <select aria-label="Sort" value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="lastActiveAt">Last active</option><option value="createdAt">Registration date</option></select>
      </form>
      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
      <table>
        <thead><tr><th>User ID</th><th>Status</th><th>Registered</th><th>Last active</th><th>Saved</th><th>Rounds</th><th>Streak</th><th>Version</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.uid} className="clickable" tabIndex={0} onClick={() => setSelected(r.uid)} onKeyDown={e => e.key === 'Enter' && setSelected(r.uid)}>
          <td><code>{r.uid.slice(0, 12)}…</code></td><td><Pill tone={statusTone(r.status)}>{r.status}</Pill></td><td>{when(r.createdAt)}</td><td>{when(r.lastActiveAt)}</td>
          <td>{fmt(r.stats?.saved)}</td><td>{fmt(r.stats?.quizzes)}</td><td>{fmt(r.stats?.streak)}</td><td>{r.appVersion ?? '—'} {r.platform ? `· ${r.platform}` : ''}</td>
        </tr>)}</tbody>
      </table>
      {!rows.length && !loading && <p className="muted">No accounts match.</p>}
      {more && <button className="btn ghost" disabled={loading} onClick={() => void load(false)}>{loading ? 'Loading…' : 'Load more'}</button>}
    </Card>
  </div>;
}

function UserDetail({uid, onBack}: {uid: string; onBack: () => void}) {
  const s = useSession();
  const [msg, setMsg] = useState<{kind: 'ok' | 'error'; text: string} | null>(null), [reason, setReason] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  const data = useLoad(async () => {
    const user = await getDoc(doc(db, 'users', uid));
    const pii = can(s.role, 'users.pii');
    const [dir, scores, saved, notes] = pii ? await Promise.all([getDoc(doc(db, 'directory', uid)), getDoc(doc(db, 'users', uid, 'sync', 'scores')), getDoc(doc(db, 'users', uid, 'sync', 'saved')), getDocs(query(collection(db, 'users', uid, 'supportNotes'), orderBy('at', 'desc'), limit(50)))]) : [null, null, null, null];
    const attempts = scores?.exists() ? Object.values((scores.data().attempts ?? {}) as Record<string, {stage: string; score: number; total: number; at: number}>).sort((a, b) => b.at - a.at) : [];
    const savedItems = saved?.exists() ? Object.values((saved.data().items ?? {}) as Record<string, {d?: number}>) : [];
    return {user: user.exists() ? user.data() as Omit<UserRow, 'uid'> : null, email: dir?.exists() ? String(dir.data().email) : null, attempts, savedActive: savedItems.filter(i => !i.d).length, savedRemoved: savedItems.filter(i => i.d).length, notes: notes?.docs.map(d => d.data() as {text: string; author: string; at: {toMillis(): number}}) ?? []};
  }, [uid]);
  const run = async (fn: () => Promise<void>, ok: string) => {setBusy(true); setMsg(null); try {await fn(); setMsg({kind: 'ok', text: ok}); data.reload();} catch (e) {setMsg({kind: 'error', text: errorMessage(e)});} finally {setBusy(false);}};

  const setStatus = (next: 'active' | 'suspended') => !reason.trim() ? setMsg({kind: 'error', text: 'Enter a reason first.'}) : run(async () => {
    const b = newBatch();
    const lastAuditId = addAudit(b, s.uid, s.role, next === 'suspended' ? 'user.suspend' : 'user.reactivate', `users/${uid}`, reason.trim());
    b.update(doc(db, 'users', uid), {status: next, statusReason: reason.trim().slice(0, 200), statusUpdatedAt: serverTimestamp(), statusUpdatedBy: s.uid, updatedAt: serverTimestamp(), lastAuditId});
    await b.commit(); setReason('');
  }, next === 'suspended' ? 'Account suspended. The user keeps local learning but cannot sync or submit content.' : 'Account reactivated.');
  const addNote = () => run(async () => {
    const b = newBatch();
    const lastAuditId = addAudit(b, s.uid, s.role, 'user.note', `users/${uid}`, 'support note added');
    b.set(doc(collection(db, 'users', uid, 'supportNotes')), {text: note.trim().slice(0, 1000), author: s.uid, at: serverTimestamp(), lastAuditId});
    await b.commit(); setNote('');
  }, 'Note added.');
  const processDeletion = () => run(async () => {
    const b = newBatch();
    const lastAuditId = addAudit(b, s.uid, s.role, 'user.delete', `users/${uid}`, 'deletion request processed');
    b.set(doc(db, 'users', uid), {status: 'deleted', deletedAt: serverTimestamp(), updatedAt: serverTimestamp(), deletedBy: s.uid, lastAuditId});
    for (const d of ['profile', 'saved', 'progress', 'scores']) b.delete(doc(db, 'users', uid, 'sync', d));
    for (const l of ['ugc', 'sec']) b.delete(doc(db, 'users', uid, 'limits', l));
    b.delete(doc(db, 'directory', uid));
    await b.commit();
  }, 'Cloud data deleted and the account tombstoned. Now delete the sign-in account in Firebase Console → Authentication (search this user ID) to finish.');

  const u = data.data?.user;
  return <div className="stack">
    <header className="page-head row"><button className="btn ghost" onClick={onBack}>← Users</button><h1>User <code>{uid}</code></h1></header>
    {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
    {data.loading ? <p className="muted">Loading…</p> : data.error ? <Notice kind="error">{errorMessage(data.error)}</Notice> : !u ? <Notice kind="error">Account record not found.</Notice> : <>
      <Card title="Account">
        <dl className="grid-dl">
          <dt>Status</dt><dd><Pill tone={statusTone(u.status)}>{u.status}</Pill>{u.statusReason ? <span className="muted"> · {u.statusReason}</span> : null}</dd>
          {can(s.role, 'users.pii') && <><dt>E-mail</dt><dd>{data.data?.email ?? '—'}</dd></>}
          <dt>Registered</dt><dd>{when(u.createdAt)}</dd><dt>Last active</dt><dd>{when(u.lastActiveAt)}</dd>
          <dt>App</dt><dd>{u.appVersion ?? '—'} · {u.platform ?? '—'}</dd>
          <dt>Learning</dt><dd>{fmt(u.stats?.saved)} saved · {fmt(u.stats?.quizzes)} rounds · {fmt(u.stats?.levels)} levels · {fmt(u.stats?.reviewed)} in review · streak {fmt(u.stats?.streak)} · {fmt(u.stats?.xp)} XP</dd>
        </dl>
      </Card>
      {can(s.role, 'users.suspend') && u.status !== 'deleted' && <Card title={u.status === 'suspended' ? 'Reactivate account' : 'Suspend account'} subtitle="Suspension blocks cloud sync and submissions (enforced by security rules). To also block sign-in, disable the user in Firebase Console → Authentication.">
        <Field label="Reason (recorded in the audit log)"><input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} /></Field>
        {u.status === 'suspended' ? <button className="btn" disabled={busy || !reason.trim()} onClick={() => void setStatus('active')}>Reactivate</button> : <ConfirmButton label="Suspend" word="SUSPEND" disabled={busy || !reason.trim()} onConfirm={() => void setStatus('suspended')} />}
      </Card>}
      {can(s.role, 'users.pii') && <Card title="Quiz history" subtitle={`${fmt(data.data?.savedActive)} saved words (${fmt(data.data?.savedRemoved)} removed) · last ${data.data?.attempts.length ?? 0} rounds`}>
        {data.data?.attempts.length ? <table><thead><tr><th>Round</th><th>Score</th><th>When</th></tr></thead><tbody>{data.data.attempts.slice(0, 20).map((a, i) => <tr key={i}><td>{a.stage}</td><td>{a.score}/{a.total}</td><td>{when(a.at)}</td></tr>)}</tbody></table> : <p className="muted">No synced rounds.</p>}
      </Card>}
      {can(s.role, 'users.notes') && <Card title="Support notes" subtitle="Visible to Support and Super Admins only. Append-only.">
        {data.data?.notes.map((n, i) => <p key={i} className="note"><span className="muted small">{when(n.at)} · {n.author.slice(0, 8)}</span><br />{n.text}</p>)}
        <Field label="Add a note"><textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} rows={3} /></Field>
        <button className="btn" disabled={busy || !note.trim()} onClick={() => void addNote()}>Add note</button>
      </Card>}
      {can(s.role, 'users.delete') && u.status !== 'deleted' && <Card title="Account deletion" subtitle="For verified deletion requests (e.g. from the web deletion form). Deletes synced learning data, the e-mail directory entry and rate-limit stamps, and leaves a tombstone so the account cannot recreate itself. The Firebase Authentication account must then be deleted in the console.">
        <ConfirmButton label="Delete user’s cloud data" word="DELETE" disabled={busy} onConfirm={() => void processDeletion()} />
      </Card>}
    </>}
  </div>;
}
