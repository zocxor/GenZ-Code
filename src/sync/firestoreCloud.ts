/**
 * Firestore Lite implementation of the CloudAdapter.
 *
 * Paths (all protected by firebase/firestore.rules):
 *   users/{uid}                   account metadata (no e-mail), status, aggregate stats
 *   directory/{uid}               e-mail for support look-ups (owner + support roles only)
 *   users/{uid}/sync/{domain}     learning data: profile | saved | progress | scores
 *   users/{uid}/limits/{kind}     server-checked rate-limit stamps
 * The client never decides its own account status; rules forbid changing it.
 */
import {doc, getDoc, runTransaction, serverTimestamp, writeBatch, updateDoc, collection, query, where, getDocs, FirestoreError} from 'firebase/firestore/lite';
import {cloudDb, accountAuth} from '../firebase/app';
import {CloudAdapter, CloudError, AccountStatus} from './engine';
import {parseRemote, DomainDoc} from './merge';
import {Domain, DOMAINS} from '../profile';
import {stableStringify} from '../secure/integrity';
import {localDayOf} from '../profile';

const MAX_DOC_CHARS = 900_000; // Firestore documents are limited to 1 MiB.

export function toCloudError(e: unknown): CloudError {
  if (e instanceof CloudError) return e;
  const code = e instanceof FirestoreError ? e.code : typeof e === 'object' && e && 'code' in e ? String((e as {code: unknown}).code) : '';
  if (code === 'unavailable' || code === 'deadline-exceeded' || (e instanceof TypeError && /network/i.test(e.message))) return new CloudError('offline');
  if (code === 'permission-denied') return new CloudError('permission-denied');
  if (code === 'unauthenticated') return new CloudError('unauthenticated');
  if (code === 'resource-exhausted') return new CloudError('rate-limited');
  if (code === 'invalid-argument' && e instanceof Error && /size|too large|exceeds/i.test(e.message)) return new CloudError('too-large');
  return new CloudError('unknown');
}
const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {try {return await fn();} catch (e) {throw toCloudError(e);}};

function encode(domain: Domain, d: DomainDoc[Domain]): Record<string, unknown> {
  return JSON.parse(JSON.stringify(d)); // plain JSON maps only (no undefined, no class instances)
}
const STATUSES: AccountStatus[] = ['active', 'suspended', 'deleted'];

export const firestoreCloud: CloudAdapter = {
  ensureAccount: (uid, info) => wrap(async () => {
    const db = cloudDb();
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const status = snap.data().status;
      return STATUSES.includes(status) ? status : 'suspended';
    }
    const email = accountAuth.currentUser?.email?.toLowerCase();
    const batch = writeBatch(db);
    batch.set(ref, {status: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastActiveAt: serverTimestamp(), lastActiveDay: localDayOf(Date.now()), appVersion: info.appVersion, platform: info.platform, stats: {saved: 0, quizzes: 0, levels: 0, reviewed: 0, streak: 0, xp: 0}, schema: 1});
    if (email) batch.set(doc(db, 'directory', uid), {email, createdAt: serverTimestamp()});
    await batch.commit();
    return 'active';
  }),

  transact: (uid, domain, merge) => wrap(() => runTransaction(cloudDb(), async tx => {
    const ref = doc(cloudDb(), 'users', uid, 'sync', domain);
    const snap = await tx.get(ref);
    const remote = parseRemote(domain, snap.exists() ? snap.data() : {});
    const merged = merge(remote);
    const body = encode(domain, merged);
    if (stableStringify(body) !== stableStringify(encode(domain, remote))) {
      if (JSON.stringify(body).length > MAX_DOC_CHARS) throw new CloudError('too-large');
      tx.set(ref, {...body, v: 3, updatedAt: serverTimestamp()});
    }
    return merged;
  })),

  reportActivity: (uid, a) => wrap(async () => {
    await updateDoc(doc(cloudDb(), 'users', uid), {lastActiveAt: serverTimestamp(), updatedAt: serverTimestamp(), lastActiveDay: a.day, stats: a.stats, appVersion: a.appVersion, platform: a.platform});
  }),

  /**
   * Account deletion, cloud side. Removes learning data, the e-mail directory entry,
   * rate-limit stamps and the user's own pending submissions/reports/feedback, then turns
   * the account record into a minimal tombstone (uid + timestamps only) so a suspended
   * account cannot recreate itself. Support purges the tombstone after confirming the
   * Firebase Authentication account is gone (see docs/DATA_RETENTION.md).
   */
  deleteCloudData: uid => wrap(async () => {
    const db = cloudDb();
    // 1) Tombstone + learning data in one atomic batch (rules verify the tombstone via getAfter).
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid), {status: 'deleted', deletedAt: serverTimestamp(), updatedAt: serverTimestamp()});
    for (const d of DOMAINS) batch.delete(doc(db, 'users', uid, 'sync', d));
    for (const l of ['ugc', 'sec']) batch.delete(doc(db, 'users', uid, 'limits', l));
    batch.delete(doc(db, 'directory', uid));
    await batch.commit();
    // 2) The user's own submissions, reports and feedback.
    const owned = await Promise.all(['submissions', 'reports', 'feedback'].map(c => getDocs(query(collection(db, c), where('uid', '==', uid)))));
    const refs = owned.flatMap(s => s.docs.map(d => d.ref));
    for (let i = 0; i < refs.length; i += 400) {
      const b = writeBatch(db);
      refs.slice(i, i + 400).forEach(r => b.delete(r));
      await b.commit();
    }
  }),
};

/** Reads whether the current account record exists and its status (for the account screen). */
export const readAccountStatus = (uid: string) => wrap(async () => {
  const snap = await getDoc(doc(cloudDb(), 'users', uid));
  return snap.exists() ? (snap.data().status as AccountStatus) : null;
});
