/**
 * Conflict resolution for cloud sync (state-based, convergent, idempotent).
 *
 * - Per-record last-writer-wins by update stamp; ties are resolved deterministically
 *   (removal wins for saves, larger review counts win for progress).
 * - Bulk resets travel as watermarks; records stamped at or before a watermark are dropped.
 * - Best scores are monotonic (highest wins); attempts are a bounded union by unique id.
 * merge(a, b) == merge(b, a) and merge(a, merge(a, b)) == merge(a, b).
 */
import {LearningState, Domain, SavedRec, ProgressRec, BestRec, Attempt, LIMITS, parseSaved, parseProgress, parseBest, parseAttempts, parseDays, LANGUAGES, QUIZ_CATEGORIES, AVATAR_COUNT, cleanName, localDayOf} from '../profile';

export type ProfileDoc = {profile: {name: string; avatar: number; u: number}; prefs: {language: string; quizCategory: string; u: number}};
export type SavedDoc = {items: Record<string, SavedRec>};
export type ProgressDoc = {items: Record<string, ProgressRec>; resetAt: number};
export type ScoresDoc = {best: Record<string, BestRec>; attempts: Record<string, Attempt>; days: Record<string, number>; resetAt: number};
export type DomainDoc = {profile: ProfileDoc; saved: SavedDoc; progress: ProgressDoc; scores: ScoresDoc};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const stamp = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 8.64e15 ? Math.floor(v) : 0);

// ---------- decode remote (untrusted) documents ----------
export function parseRemote<D extends Domain>(domain: D, raw: unknown): DomainDoc[D] {
  const r = isObj(raw) ? raw : {};
  switch (domain) {
    case 'profile': {
      const p = isObj(r.profile) ? r.profile : {}, q = isObj(r.prefs) ? r.prefs : {};
      return {
        profile: {name: typeof p.name === 'string' ? cleanName(p.name) : 'Code Explorer', avatar: Number.isInteger(p.avatar) && (p.avatar as number) >= 0 && (p.avatar as number) < AVATAR_COUNT ? (p.avatar as number) : 0, u: stamp(p.u)},
        prefs: {language: LANGUAGES.includes(String(q.language)) ? String(q.language) : 'All', quizCategory: QUIZ_CATEGORIES.includes(String(q.quizCategory)) ? String(q.quizCategory) : 'Chat', u: stamp(q.u)},
      } as DomainDoc[D];
    }
    case 'saved': return {items: parseSaved(r.items)} as DomainDoc[D];
    case 'progress': return {items: parseProgress(r.items), resetAt: stamp(r.resetAt)} as DomainDoc[D];
    default: return {best: parseBest(r.best), attempts: parseAttempts(r.attempts), days: parseDays(r.days), resetAt: stamp(r.resetAt)} as DomainDoc[D];
  }
}
export function fromState<D extends Domain>(domain: D, s: LearningState): DomainDoc[D] {
  switch (domain) {
    case 'profile': return {profile: s.profile, prefs: s.prefs} as DomainDoc[D];
    case 'saved': return {items: s.saved} as DomainDoc[D];
    case 'progress': return {items: s.progress, resetAt: s.progressResetAt} as DomainDoc[D];
    default: return {best: s.best, attempts: s.attempts, days: s.days, resetAt: s.scoresResetAt} as DomainDoc[D];
  }
}
export function intoState<D extends Domain>(domain: D, s: LearningState, doc: DomainDoc[D]): LearningState {
  switch (domain) {
    case 'profile': {const d = doc as ProfileDoc; return {...s, profile: d.profile, prefs: d.prefs};}
    case 'saved': return {...s, saved: (doc as SavedDoc).items};
    case 'progress': {const d = doc as ProgressDoc; return {...s, progress: d.items, progressResetAt: d.resetAt};}
    default: {const d = doc as ScoresDoc; return {...s, best: d.best, attempts: d.attempts, days: d.days, scoresResetAt: d.resetAt};}
  }
}

// ---------- merges ----------
const lww = <T extends {u: number}>(a: T, b: T) => (b.u > a.u ? b : a);
export function mergeSaved(a: SavedDoc, b: SavedDoc): SavedDoc {
  const items: Record<string, SavedRec> = {...a.items};
  for (const [id, rb] of Object.entries(b.items)) {
    const ra = items[id];
    items[id] = !ra ? rb : rb.u !== ra.u ? lww(ra, rb) : ra.d || rb.d ? {u: ra.u, d: 1} : ra;
  }
  return {items: limitBy(items, LIMITS.saved, r => r.u)};
}
export function mergeProgress(a: ProgressDoc, b: ProgressDoc): ProgressDoc {
  const resetAt = Math.max(a.resetAt, b.resetAt);
  const items: Record<string, ProgressRec> = {};
  for (const src of [a.items, b.items]) for (const [id, r] of Object.entries(src)) {
    if (r.u <= resetAt) continue;
    const cur = items[id];
    items[id] = !cur ? r : r.u !== cur.u ? lww(cur, r) : r.attempts !== cur.attempts ? (r.attempts > cur.attempts ? r : cur) : JSON.stringify(r) > JSON.stringify(cur) ? r : cur;
  }
  return {items: limitBy(items, LIMITS.progress, r => r.u), resetAt};
}
export function mergeScores(a: ScoresDoc, b: ScoresDoc): ScoresDoc {
  const resetAt = Math.max(a.resetAt, b.resetAt);
  const best: Record<string, BestRec> = {};
  for (const src of [a.best, b.best]) for (const [id, r] of Object.entries(src)) {
    if (r.u <= resetAt) continue;
    const cur = best[id];
    best[id] = !cur || r.v > cur.v || (r.v === cur.v && r.u < cur.u) ? r : cur;
  }
  const attempts: Record<string, Attempt> = {};
  for (const src of [a.attempts, b.attempts]) for (const [id, r] of Object.entries(src)) if (r.at > resetAt && !attempts[id]) attempts[id] = r;
  const resetDay = resetAt ? localDayOf(resetAt) : '';
  const days: Record<string, number> = {};
  for (const src of [a.days, b.days]) for (const [d, n] of Object.entries(src)) if (d >= resetDay) days[d] = Math.max(days[d] ?? 0, n);
  const dayKeys = Object.keys(days).sort().slice(-LIMITS.days);
  return {best: limitBy(best, LIMITS.best, r => r.u), attempts: limitBy(attempts, LIMITS.attempts, r => r.at), days: Object.fromEntries(dayKeys.map(k => [k, days[k]!])), resetAt};
}
export function mergeProfile(a: ProfileDoc, b: ProfileDoc): ProfileDoc {
  const pick = <T extends {u: number}>(x: T, y: T) => (y.u > x.u || (y.u === x.u && JSON.stringify(y) > JSON.stringify(x)) ? y : x);
  return {profile: pick(a.profile, b.profile), prefs: pick(a.prefs, b.prefs)};
}
export function mergeDomain<D extends Domain>(domain: D, a: DomainDoc[D], b: DomainDoc[D]): DomainDoc[D] {
  switch (domain) {
    case 'profile': return mergeProfile(a as ProfileDoc, b as ProfileDoc) as DomainDoc[D];
    case 'saved': return mergeSaved(a as SavedDoc, b as SavedDoc) as DomainDoc[D];
    case 'progress': return mergeProgress(a as ProgressDoc, b as ProgressDoc) as DomainDoc[D];
    default: return mergeScores(a as ScoresDoc, b as ScoresDoc) as DomainDoc[D];
  }
}
function limitBy<T>(rec: Record<string, T>, max: number, at: (v: T) => number): Record<string, T> {
  const e = Object.entries(rec);
  return e.length <= max ? rec : Object.fromEntries(e.sort((x, y) => at(y[1]) - at(x[1]) || x[0].localeCompare(y[0])).slice(0, max));
}
/** Largest stamp seen in a document; advances the local hybrid clock after a pull. */
export function maxStamp(domain: Domain, doc: DomainDoc[Domain]): number {
  let m = 0;
  const see = (n: number) => {if (n > m) m = n;};
  if (domain === 'profile') {const d = doc as ProfileDoc; see(d.profile.u); see(d.prefs.u);}
  else if (domain === 'saved') for (const r of Object.values((doc as SavedDoc).items)) see(r.u);
  else if (domain === 'progress') {const d = doc as ProgressDoc; see(d.resetAt); for (const r of Object.values(d.items)) see(r.u);}
  else {const d = doc as ScoresDoc; see(d.resetAt); for (const r of Object.values(d.best)) see(r.u); for (const r of Object.values(d.attempts)) see(r.at);}
  return m;
}
