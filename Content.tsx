import React, {useMemo, useState} from 'react';
import {useSession} from '../App';
import {can} from '../rbac';
import {Card, Notice, Pill, Field, ConfirmButton, useLoad, fmt, when, download} from '../ui';
import {errorMessage} from '../firebase';
import {BundledEntry, CmsDoc, Row, mergeRows, buildTermIndex, findDuplicates, planImport, ImportRow, loadCms, loadVersions, saveContent, importDrafts, bundledToEntry, slugId} from '../lib/contentOps';
import {CONTENT_CATEGORIES, CONTENT_LANGUAGES, SENSITIVITY, SlangEntry, ContentStatus, validateEntry, parseCsv, csvCell, LIMITS} from '../../../shared/contentSchema';

const PAGE = 50;
const tone = (s: Row['status']) => (s === 'published' ? 'good' : s === 'in_review' ? 'info' : s === 'draft' ? 'warn' : s === 'archived' ? 'bad' : 'neutral');
const label = (s: Row['status']) => (s === 'bundled' ? 'bundled' : s === 'in_review' ? 'in review' : s);

export default function Content() {
  const s = useSession();
  const lib = useLoad(async () => {
    const [bundled, cms] = await Promise.all([fetch('/admin/library-index.json').then(r => {if (!r.ok) throw new Error('library'); return r.json() as Promise<BundledEntry[]>;}), loadCms()]);
    return {bundled, cms};
  }, []);
  const [q, setQ] = useState(''), [cat, setCat] = useState('All'), [status, setStatus] = useState('all'), [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{row: Row | null} | null>(null), [importing, setImporting] = useState(false);
  const rows = useMemo(() => lib.data ? mergeRows(lib.data.bundled, lib.data.cms) : [], [lib.data]);
  const index = useMemo(() => buildTermIndex(rows), [rows]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => (cat === 'All' || r.category === cat) && (status === 'all' || r.status === status) && (!needle || r.term.toLowerCase().includes(needle) || r.meaning.toLowerCase().includes(needle) || r.id === needle))
      .sort((a, b) => b.updatedAt - a.updatedAt || a.term.localeCompare(b.term));
  }, [rows, q, cat, status]);
  React.useEffect(() => setPage(0), [q, cat, status]);

  const exportAs = (kind: 'csv' | 'json') => {
    const cols = ['id', 'term', 'full', 'meaning', 'example', 'category', 'subcategory', 'variations', 'region', 'tone', 'language', 'sensitivity', 'status', 'version'] as const;
    const data = filtered.map(r => {const e = r.cms ?? (r.bundled ? bundledToEntry(r.bundled) : null); return {...e, status: r.status, version: r.version};});
    if (kind === 'json') download(`genz-content-${Date.now()}.json`, 'application/json', JSON.stringify(data, null, 2));
    else download(`genz-content-${Date.now()}.csv`, 'text/csv', [cols.join(','), ...data.map(d => cols.map(c => csvCell((d as Record<string, unknown>)[c])).join(','))].join('\r\n'));
  };

  if (editing) return <Editor row={editing.row} index={index} onClose={changed => {setEditing(null); if (changed) lib.reload();}} />;
  if (importing) return <Importer index={index} onClose={changed => {setImporting(false); if (changed) lib.reload();}} />;
  return <div className="stack">
    <header className="page-head"><h1>Content</h1><p className="muted">The {fmt(lib.data?.bundled.length)} bundled entries ship inside the app and are never modified. Editing one creates a CMS working copy; publishing delivers it to the app without an APK update.</p></header>
    <Card actions={<>
      {can(s.role, 'content.write') && <button className="btn primary" onClick={() => setEditing({row: null})}>New entry</button>}
      {can(s.role, 'content.import') && <button className="btn" onClick={() => setImporting(true)}>Import CSV/JSON</button>}
      {can(s.role, 'content.export') && <><button className="btn ghost" onClick={() => exportAs('csv')}>Export CSV</button><button className="btn ghost" onClick={() => exportAs('json')}>Export JSON</button></>}
    </>}>
      <div className="row wrap">
        <input className="grow" aria-label="Search content" placeholder="Search term, meaning or ID" value={q} onChange={e => setQ(e.target.value)} maxLength={120} />
        <select aria-label="Category" value={cat} onChange={e => setCat(e.target.value)}><option>All</option>{CONTENT_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
        <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="bundled">Bundled</option><option value="draft">Draft</option><option value="in_review">In review</option><option value="published">Published</option><option value="archived">Archived</option></select>
      </div>
      {lib.loading ? <p className="muted">Loading library…</p> : lib.error ? <Notice kind="error">{errorMessage(lib.error)}</Notice> : <>
        <p className="small muted">{fmt(filtered.length)} entries · CMS: {fmt(lib.data?.cms.length)}</p>
        <table><thead><tr><th>Term</th><th>Meaning</th><th>Category</th><th>Status</th><th>Updated</th></tr></thead><tbody>
          {filtered.slice(page * PAGE, page * PAGE + PAGE).map(r => <tr key={r.id} className="clickable" tabIndex={0} onClick={() => setEditing({row: r})} onKeyDown={e => e.key === 'Enter' && setEditing({row: r})}>
            <td><strong>{r.term}</strong><br /><code className="small">{r.id}</code></td><td className="clip">{r.meaning}</td><td>{r.category}</td><td><Pill tone={tone(r.status)}>{label(r.status)}</Pill>{r.version ? <span className="small muted"> v{r.version}</span> : null}</td><td>{r.updatedAt ? when(r.updatedAt) : '—'}</td>
          </tr>)}
        </tbody></table>
        <div className="row"><button className="btn ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button><span className="muted small">Page {page + 1} of {Math.max(1, Math.ceil(filtered.length / PAGE))}</span><button className="btn ghost" disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage(p => p + 1)}>Next</button></div>
      </>}
    </Card>
  </div>;
}

function Editor({row, index, onClose}: {row: Row | null; index: Map<string, string[]>; onClose: (changed: boolean) => void}) {
  const s = useSession();
  const initial: SlangEntry = row?.cms ?? (row?.bundled ? bundledToEntry(row.bundled) : {id: '', term: '', full: '', meaning: '', example: '', category: 'Chat', subcategory: '', variations: [], region: 'Context-dependent', tone: 'Context-dependent', language: 'English', sensitivity: 'None', caution: ''});
  const [e, setE] = useState<SlangEntry>(initial), [variations, setVariations] = useState(initial.variations.join('; '));
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{kind: 'ok' | 'error'; text: string} | null>(null), [changed, setChanged] = useState(false);
  const [current, setCurrent] = useState<ContentStatus | 'bundled'>(row?.status ?? 'draft');
  const versions = useLoad(() => (row?.cms ? loadVersions(row.id) : Promise.resolve([])), [row?.id, changed]);
  const editable = can(s.role, 'content.write');
  const entry = {...e, variations: variations.split(/[;|]/).map(v => v.trim()).filter(Boolean)};
  const check = validateEntry(entry);
  const dupes = entry.term ? findDuplicates(index, entry, row?.id) : [];
  const set = (k: keyof SlangEntry) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setE(x => ({...x, [k]: ev.target.value}));
  const commit = async (status: ContentStatus, kind: Parameters<typeof saveContent>[3], ok: string, from?: SlangEntry) => {
    setBusy(true); setMsg(null);
    try {
      const target = from ?? entry;
      const id = target.id || slugId(target.term);
      const saved = await saveContent({uid: s.uid, role: s.role}, {...target, id}, status, kind);
      setE(saved); setVariations(saved.variations.join('; ')); setCurrent(status); setChanged(true);
      setMsg({kind: 'ok', text: ok});
    } catch (err) {setMsg({kind: 'error', text: err instanceof Error && !(err as {code?: string}).code ? err.message : errorMessage(err)});} finally {setBusy(false);}
  };
  const isNew = !row?.cms;
  return <div className="stack">
    <header className="page-head row"><button className="btn ghost" onClick={() => onClose(changed)}>← Content</button><h1>{row ? row.term : 'New entry'}</h1><Pill tone={tone(current)}>{label(current)}</Pill></header>
    {row?.source === 'bundled' && !row.cms && <Notice kind="info">Bundled entry. Saving creates a CMS working copy with the same ID; the app keeps showing the bundled version until you publish.</Notice>}
    {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
    <Card title="Entry">
      <div className="form-grid">
        <Field label={`Term (max ${LIMITS.term})`}><input value={e.term} onChange={set('term')} maxLength={LIMITS.term} disabled={!editable} /></Field>
        <Field label={`Short meaning (max ${LIMITS.full})`}><input value={e.full} onChange={set('full')} maxLength={LIMITS.full} disabled={!editable} /></Field>
        <Field label={`Meaning (max ${LIMITS.meaning})`}><textarea rows={3} value={e.meaning} onChange={set('meaning')} maxLength={LIMITS.meaning} disabled={!editable} /></Field>
        <Field label={`Example (max ${LIMITS.example})`}><textarea rows={2} value={e.example} onChange={set('example')} maxLength={LIMITS.example} disabled={!editable} /></Field>
        <Field label="Category"><select value={e.category} onChange={set('category')} disabled={!editable}>{CONTENT_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Subcategory"><input value={e.subcategory} onChange={set('subcategory')} maxLength={LIMITS.subcategory} disabled={!editable} /></Field>
        <Field label="Variations (separate with ;)"><input value={variations} onChange={ev => setVariations(ev.target.value)} disabled={!editable} /></Field>
        <Field label="Region"><input value={e.region} onChange={set('region')} maxLength={LIMITS.region} disabled={!editable} /></Field>
        <Field label="Tone"><input value={e.tone} onChange={set('tone')} maxLength={LIMITS.tone} disabled={!editable} /></Field>
        <Field label="Language"><select value={e.language} onChange={set('language')} disabled={!editable}>{CONTENT_LANGUAGES.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Sensitivity"><select value={e.sensitivity} onChange={set('sensitivity')} disabled={!editable}>{SENSITIVITY.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Context caution"><textarea rows={2} value={e.caution} onChange={set('caution')} maxLength={LIMITS.caution} disabled={!editable} /></Field>
      </div>
      {!check.ok && <Notice kind="error">{check.errors.join(' ')}</Notice>}
      {dupes.length > 0 && <Notice kind="info">Possible duplicate of: {dupes.slice(0, 5).join(', ')}{dupes.length > 5 ? '…' : ''}. Check before publishing.</Notice>}
      {editable && <div className="row wrap">
        <button className="btn" disabled={busy || !check.ok} onClick={() => void commit('draft', isNew ? 'create' : 'update', 'Draft saved.')}>Save draft</button>
        <button className="btn" disabled={busy || !check.ok} onClick={() => void commit('in_review', 'submit_review', 'Submitted for review.')}>Submit for review</button>
        {can(s.role, 'content.publish') && <button className="btn primary" disabled={busy || !check.ok || !(current === 'in_review' || current === 'published')} title={current === 'in_review' || current === 'published' ? '' : 'Submit for review first'} onClick={() => void commit('published', 'publish', 'Published. Apps receive it on their next content refresh (within 6 hours, or on next launch).')}>Publish</button>}
        {row?.cms && current !== 'archived' && <ConfirmButton label="Archive (remove from app)" word="ARCHIVE" disabled={busy} onConfirm={() => void commit('archived', 'archive', 'Archived. The entry is removed from the app on its next content refresh. History is kept.')} />}
      </div>}
    </Card>
    {row?.cms && <Card title="Version history" subtitle="Every change is kept. Rolling back creates a new draft version from the selected snapshot.">
      {versions.loading ? <p className="muted">Loading…</p> : versions.error ? <Notice kind="error">{errorMessage(versions.error)}</Notice> : <table><thead><tr><th>Version</th><th>Action</th><th>Status</th><th>Term</th><th>By</th><th>When</th><th /></tr></thead><tbody>
        {versions.data?.map(v => <tr key={v.version}><td>v{v.version}</td><td>{v.action}</td><td>{v.snapshot.status}</td><td>{v.snapshot.term}</td><td><code>{v.by.slice(0, 8)}</code></td><td>{when(v.at)}</td><td>{editable && <button className="btn ghost" disabled={busy} onClick={() => {const {status: _s, ...snap} = v.snapshot; void commit('draft', 'rollback', `Rolled back to v${v.version} as a new draft. Review and publish to apply.`, {...snap, id: row.id});}}>Roll back</button>}</td></tr>)}
      </tbody></table>}
    </Card>}
  </div>;
}

function Importer({index, onClose}: {index: Map<string, string[]>; onClose: (changed: boolean) => void}) {
  const s = useSession();
  const [plan, setPlan] = useState<ImportRow[] | null>(null), [error, setError] = useState(''), [skipDupes, setSkipDupes] = useState(true);
  const [progress, setProgress] = useState<number | null>(null), [done, setDone] = useState(false);
  const read = async (file: File) => {
    setError(''); setPlan(null);
    try {
      if (file.size > 5_000_000) throw new RangeError('Files are limited to 5 MB.');
      const text = await file.text();
      const records: unknown[] = /\.json$/i.test(file.name) ? (() => {const v = JSON.parse(text); if (!Array.isArray(v)) throw new SyntaxError('JSON must be an array of entries.'); return v;})() : parseCsv(text);
      setPlan(planImport(records, index));
    } catch (e) {setError(e instanceof Error ? e.message : 'Could not read that file.');}
  };
  const valid = plan?.filter(r => r.ok && !r.errors.length && (!skipDupes || !r.duplicateOf.length)) ?? [];
  const run = async () => {
    setError(''); setProgress(0);
    try {await importDrafts({uid: s.uid, role: s.role}, valid.map(r => r.entry!), setProgress); setDone(true);}
    catch (e) {setError(`${errorMessage(e)} Imported before the error: ${progress ?? 0}.`);}
  };
  return <div className="stack">
    <header className="page-head row"><button className="btn ghost" onClick={() => onClose(done || (progress ?? 0) > 0)}>← Content</button><h1>Bulk import</h1></header>
    <Card title="1. Choose a file" subtitle="CSV with a header row (term, full, meaning, example, category, subcategory, variations, region, tone, language, sensitivity, caution) or a JSON array of objects. Max 5 MB / 5,000 rows. Every row is validated and sanitised; HTML, scripts and spreadsheet formulas are rejected. Imported rows become drafts — nothing is published automatically.">
      <input type="file" accept=".csv,.json,text/csv,application/json" onChange={e => {const f = e.target.files?.[0]; if (f) void read(f);}} />
      {error && <Notice kind="error">{error}</Notice>}
    </Card>
    {plan && <Card title="2. Review" subtitle={`${plan.length} rows · ${plan.filter(r => !r.ok).length} invalid · ${plan.filter(r => r.ok && r.duplicateOf.length).length} duplicate existing entries · ${plan.filter(r => r.ok && r.errors.length).length} duplicated within file`}>
      <label className="row"><input type="checkbox" checked={skipDupes} onChange={e => setSkipDupes(e.target.checked)} /> Skip rows that duplicate existing entries</label>
      <table><thead><tr><th>Line</th><th>Term</th><th>Category</th><th>Result</th></tr></thead><tbody>{plan.slice(0, 300).map(r => <tr key={r.line}><td>{r.line}</td><td>{r.entry?.term ?? '—'}</td><td>{r.entry?.category ?? '—'}</td><td>{!r.ok ? <Pill tone="bad">{r.errors[0]}</Pill> : r.errors.length ? <Pill tone="warn">{r.errors[0]}</Pill> : r.duplicateOf.length ? <Pill tone="warn">duplicate of {r.duplicateOf[0]}</Pill> : <Pill tone="good">ready</Pill>}</td></tr>)}</tbody></table>
      {plan.length > 300 && <p className="small muted">Showing the first 300 rows.</p>}
      {done ? <Notice kind="ok">Imported {fmt(valid.length)} drafts. Review and publish them from the Content list.</Notice> : <button className="btn primary" disabled={!valid.length || progress !== null} onClick={() => void run()}>{progress !== null ? `Importing… ${progress}/${valid.length}` : `Import ${valid.length} rows as drafts`}</button>}
    </Card>}
  </div>;
}
