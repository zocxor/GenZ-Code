/**
 * CMS operations: pure helpers (tested) + Firestore writes (each batch = content doc +
 * immutable version snapshot + audit entry; publish/archive also writes the public copy).
 */
import {doc, getDoc, getDocs, collection, query, orderBy, limit, serverTimestamp, Timestamp} from 'firebase/firestore/lite';
import {db, addAudit, newBatch, AuditAction} from '../firebase';
import {validateEntry, SlangEntry, ContentStatus} from '../../../shared/contentSchema';
import type {Role} from '../rbac';

export * from './contentPure';
import {CmsDoc, slugId} from './contentPure';

// ---------- Firestore writes ----------
type Actor = {uid: string; role: Role};
const actionFor: Record<string, AuditAction> = {create: 'content.create', update: 'content.update', submit_review: 'content.submit_review', publish: 'content.publish', archive: 'content.archive', rollback: 'content.rollback', import: 'content.import'};

export async function loadCms(): Promise<CmsDoc[]> {
  const snap = await getDocs(query(collection(db, 'content'), orderBy('updatedAt', 'desc'), limit(5000)));
  return snap.docs.map(d => d.data() as CmsDoc);
}
export async function loadVersions(id: string) {
  const snap = await getDocs(query(collection(db, 'content', id, 'versions'), orderBy('at', 'desc'), limit(50)));
  return snap.docs.map(d => ({version: d.id, ...(d.data() as {snapshot: SlangEntry & {status: string}; by: string; at: Timestamp; action: string})}));
}

/**
 * Save a content transition. Re-reads the current version first; the rules additionally
 * require version = previous + 1, so concurrent edits fail instead of overwriting.
 */
export async function saveContent(actor: Actor, entry: SlangEntry, status: ContentStatus, kind: keyof typeof actionFor, summary = ''): Promise<CmsDoc> {
  const v = validateEntry(entry, {requireId: true});
  if (!v.ok) throw new Error(v.errors.join(' '));
  const ref = doc(db, 'content', entry.id);
  const current = await getDoc(ref);
  const prev = current.exists() ? (current.data() as CmsDoc) : null;
  if (status === 'published' && prev?.status !== 'in_review' && prev?.status !== 'published') throw new Error('Submit the entry for review before publishing.');
  const version = (prev?.version ?? 0) + 1;
  const batch = newBatch();
  const lastAuditId = addAudit(batch, actor.uid, actor.role, actionFor[kind]!, `content/${entry.id}`, summary || `${kind} v${version}: ${v.entry.term}`);
  const body = {...v.entry, status, version, createdAt: prev?.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: actor.uid, lastAuditId};
  batch.set(ref, body);
  batch.set(doc(db, 'content', entry.id, 'versions', String(version)), {snapshot: {...v.entry, status}, by: actor.uid, at: serverTimestamp(), action: kind});
  if (status === 'published' || (status === 'archived' && prev)) {
    batch.set(doc(db, 'publishedContent', entry.id), {...v.entry, status, version, updatedAt: serverTimestamp()});
  }
  await batch.commit();
  return {...v.entry, status, version} as CmsDoc;
}

/** Import validated rows as drafts: 150 entries (450 writes) per atomic batch. */
export async function importDrafts(actor: Actor, entries: SlangEntry[], onProgress: (done: number) => void): Promise<number> {
  let done = 0;
  for (let i = 0; i < entries.length; i += 150) {
    const batch = newBatch();
    for (const e of entries.slice(i, i + 150)) {
      const id = slugId(e.term);
      const entry = {...e, id};
      const lastAuditId = addAudit(batch, actor.uid, actor.role, 'content.import', `content/${id}`, `import: ${e.term}`);
      batch.set(doc(db, 'content', id), {...entry, status: 'draft', version: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: actor.uid, lastAuditId});
      batch.set(doc(db, 'content', id, 'versions', '1'), {snapshot: {...entry, status: 'draft'}, by: actor.uid, at: serverTimestamp(), action: 'import'});
    }
    await batch.commit();
    done = Math.min(entries.length, i + 150);
    onProgress(done);
  }
  return done;
}
