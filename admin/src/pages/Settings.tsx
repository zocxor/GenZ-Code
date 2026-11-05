import React, {useState} from 'react';
import {doc, getDoc, serverTimestamp} from 'firebase/firestore/lite';
import {multiFactor} from 'firebase/auth';
import {db, addAudit, newBatch, errorMessage} from '../firebase';
import {useSession} from '../App';
import {can, ROLE_LABELS} from '../rbac';
import {Card, Notice, Field, useLoad} from '../ui';

export default function Settings() {
  const s = useSession();
  const cfg = useLoad(async () => {const d = await getDoc(doc(db, 'config', 'app')); return d.exists() ? d.data() as {ugcEnabled: boolean; contentUpdatesEnabled: boolean; minSupportedVersion: string} : {ugcEnabled: true, contentUpdatesEnabled: true, minSupportedVersion: '0.8.0'};}, []);
  const [draft, setDraft] = useState<{ugcEnabled: boolean; contentUpdatesEnabled: boolean; minSupportedVersion: string} | null>(null);
  const [msg, setMsg] = useState<{kind: 'ok' | 'error'; text: string} | null>(null), [busy, setBusy] = useState(false);
  const value = draft ?? cfg.data;
  const save = async () => {
    if (!value) return;
    setBusy(true); setMsg(null);
    try {
      const b = newBatch();
      const lastAuditId = addAudit(b, s.uid, s.role, 'config.update', 'config/app', `ugc=${value.ugcEnabled} content=${value.contentUpdatesEnabled} min=${value.minSupportedVersion}`);
      b.set(doc(db, 'config', 'app'), {...value, updatedAt: serverTimestamp(), updatedBy: s.uid, lastAuditId});
      await b.commit(); setMsg({kind: 'ok', text: 'Settings saved and audited.'}); setDraft(null); cfg.reload();
    } catch (e) {setMsg({kind: 'error', text: errorMessage(e)});} finally {setBusy(false);}
  };
  const factors = multiFactor(s.user).enrolledFactors;
  return <div className="stack">
    <header className="page-head"><h1>Settings</h1></header>
    {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
    <Card title="Your session">
      <dl className="grid-dl"><dt>Signed in as</dt><dd>{s.email}</dd><dt>Role</dt><dd>{ROLE_LABELS[s.role]}</dd><dt>Second factors</dt><dd>{factors.map(f => f.displayName ?? f.factorId).join(', ') || '—'}</dd><dt>Session</dt><dd>This tab only · ends after 30 minutes of inactivity</dd></dl>
    </Card>
    {can(s.role, 'config.manage') && <Card title="App controls" subtitle="Public flags read by the app and enforced by security rules. Changes are audited.">
      {cfg.error ? <Notice kind="error">{errorMessage(cfg.error)}</Notice> : value && <>
        <label className="row"><input type="checkbox" checked={value.ugcEnabled} onChange={e => setDraft({...value, ugcEnabled: e.target.checked})} /> Accept word suggestions and reports from users (kill switch for abuse)</label>
        <label className="row"><input type="checkbox" checked={value.contentUpdatesEnabled} onChange={e => setDraft({...value, contentUpdatesEnabled: e.target.checked})} /> Deliver published content updates to apps</label>
        <Field label="Minimum supported app version (informational)"><input value={value.minSupportedVersion} onChange={e => setDraft({...value, minSupportedVersion: e.target.value.slice(0, 20)})} /></Field>
        <button className="btn primary" disabled={busy || !draft} onClick={() => void save()}>Save settings</button>
      </>}
    </Card>}
  </div>;
}
