/**
 * Dashboard metrics. Every number is computed from Firestore at request time:
 * count()/sum()/average() aggregation queries, or bounded samples that are labelled as such.
 * Definitions are shown next to each metric in the UI.
 */
import {collection, query, where, getCount, getAggregate, sum, average, getDocs, orderBy, limit, Timestamp} from 'firebase/firestore/lite';
import {db} from '../firebase';

const DAY = 86400_000;
const LIVE = ['active', 'suspended'];

export * from './metricsPure';
import {retention, versionShare} from './metricsPure';

const ts = (ms: number) => Timestamp.fromMillis(ms);
const users = collection(db, 'users');
export async function userMetrics(now = Date.now()) {
  const live = where('status', 'in', LIVE);
  const [total, suspended, dau, wau, mau, new7, new30, totals] = await Promise.all([
    getCount(query(users, live)),
    getCount(query(users, where('status', '==', 'suspended'))),
    getCount(query(users, live, where('lastActiveAt', '>=', ts(now - DAY)))),
    getCount(query(users, live, where('lastActiveAt', '>=', ts(now - 7 * DAY)))),
    getCount(query(users, live, where('lastActiveAt', '>=', ts(now - 30 * DAY)))),
    getCount(query(users, live, where('createdAt', '>=', ts(now - 7 * DAY)))),
    getCount(query(users, live, where('createdAt', '>=', ts(now - 30 * DAY)))),
    getAggregate(query(users, live), {quizzes: sum('stats.quizzes'), saved: sum('stats.saved'), reviewed: sum('stats.reviewed'), levels: average('stats.levels'), streak: average('stats.streak')}),
  ]);
  return {
    total: total.data().count, suspended: suspended.data().count, dau: dau.data().count, wau: wau.data().count, mau: mau.data().count,
    new7: new7.data().count, new30: new30.data().count,
    quizzes: totals.data().quizzes ?? 0, saved: totals.data().saved ?? 0, reviewed: totals.data().reviewed ?? 0,
    avgLevels: totals.data().levels ?? null, avgStreak: totals.data().streak ?? null,
  };
}
/** Retention over users who signed up in the last 90 days (bounded sample of 2,000). */
export async function retentionMetrics(now = Date.now()) {
  const snap = await getDocs(query(users, where('status', 'in', LIVE), where('createdAt', '>=', ts(now - 90 * DAY)), orderBy('createdAt', 'desc'), limit(2000)));
  const cohort = snap.docs.map(d => ({createdAt: d.data().createdAt?.toMillis?.() ?? 0, lastActiveAt: d.data().lastActiveAt?.toMillis?.() ?? 0}));
  return {sample: cohort.length, rows: retention(cohort, now, [1, 7, 30])};
}
export async function versionMetrics() {
  const snap = await getDocs(query(users, where('status', '==', 'active'), orderBy('lastActiveAt', 'desc'), limit(500)));
  return {sample: snap.size, rows: versionShare(snap.docs.map(d => String(d.data().appVersion ?? '')))};
}
export async function contentMetrics() {
  const c = collection(db, 'content');
  const [draft, review, published, archived, live] = await Promise.all(['draft', 'in_review', 'published', 'archived'].map(s => getCount(query(c, where('status', '==', s)))).concat([getCount(query(collection(db, 'publishedContent'), where('status', '==', 'published')))]));
  return {draft: draft!.data().count, review: review!.data().count, published: published!.data().count, archived: archived!.data().count, live: live!.data().count};
}
export async function moderationMetrics() {
  const [pending, open, fbNew, fbAll, rating] = await Promise.all([
    getCount(query(collection(db, 'submissions'), where('status', '==', 'pending'))),
    getCount(query(collection(db, 'reports'), where('status', '==', 'open'))),
    getCount(query(collection(db, 'feedback'), where('status', '==', 'new'))),
    getCount(collection(db, 'feedback')),
    getAggregate(collection(db, 'feedback'), {avg: average('rating')}),
  ]);
  return {pending: pending.data().count, openReports: open.data().count, feedbackNew: fbNew.data().count, feedbackTotal: fbAll.data().count, avgRating: rating.data().avg ?? null};
}
export async function securityMetrics(now = Date.now()) {
  const snap = await getDocs(query(collection(db, 'securityEvents'), where('at', '>=', ts(now - 7 * DAY)), orderBy('at', 'desc'), limit(1000)));
  const byType = new Map<string, number>();
  for (const d of snap.docs) byType.set(d.data().type, (byType.get(d.data().type) ?? 0) + 1);
  return {total: snap.size, capped: snap.size === 1000, byType: [...byType.entries()].sort((a, b) => b[1] - a[1])};
}
