/**
 * GenZ Code learning data model (schema v3).
 *
 * Root-cause fixes over v2:
 *  - Records for term IDs that are not in the *current* content build are preserved
 *    (hidden from the UI) instead of being silently dropped and then overwritten.
 *  - Every synced record carries an update stamp so devices can merge without loss.
 *  - Bulk deletions are represented as reset watermarks / tombstones so they sync.
 *  - All collections are bounded so storage and cloud documents cannot grow unbounded.
 */
import type {Review} from './engine';
import {termsById} from './content';

export const SCHEMA_VERSION = 3;
export const LIMITS = {saved: 10000, progress: 10000, best: 400, attempts: 200, days: 400, recent: 30, searches: 20, name: 24, query: 120};
export const LANGUAGES = ['All', 'English', 'Roman Urdu', 'Urdu', 'Universal'];
export const QUIZ_CATEGORIES = ['Chat', 'Numbers', 'Gaming', 'Emoji'];
export const AVATAR_COUNT = 6;

export type Domain = 'profile' | 'saved' | 'progress' | 'scores';
export const DOMAINS: Domain[] = ['profile', 'saved', 'progress', 'scores'];

export type SavedRec = {u: number; d?: 1};
export type ProgressRec = Review & {u: number};
export type BestRec = {v: number; u: number};
export type Attempt = {stage: string; score: number; total: number; at: number};
export type SyncMeta = {
  linkedUid: string | null;
  /** Local revision per domain; incremented on every local change. */
  rev: Record<Domain, number>;
  /** Revision confirmed by the server per domain. Domain is dirty when rev > pushed. */
  pushed: Record<Domain, number>;
  /** Hybrid logical clock (ms). Monotonic even if the device clock moves backwards. */
  clock: number;
  lastSyncAt: number;
  lastAttemptAt: number;
  lastError: string | null;
};
export type LearningState = {
  v: 3;
  profile: {name: string; avatar: number; u: number};
  prefs: {language: string; quizCategory: string; u: number};
  /** Device-only settings; never synced. usePhoto = show the on-device profile photo. */
  device: {onboarded: boolean; searchHistory: boolean; usePhoto: boolean};
  saved: Record<string, SavedRec>;
  progress: Record<string, ProgressRec>;
  progressResetAt: number;
  best: Record<string, BestRec>;
  attempts: Record<string, Attempt>;
  days: Record<string, number>;
  scoresResetAt: number;
  recent: {id: string; at: number}[];
  searches: {q: string; at: number}[];
  sync: SyncMeta;
};

/** UI-facing view, compatible with the pre-0.8 Profile shape. */
export type Profile = {onboarded: boolean; name: string; avatar: number; usePhoto?: boolean; saved: string[]; progress: Record<string, Review>; language: string; best: Record<string, number>};

const zeroRev = (): Record<Domain, number> => ({profile: 0, saved: 0, progress: 0, scores: 0});
export function emptyState(): LearningState {
  return {
    v: 3,
    profile: {name: 'Code Explorer', avatar: 0, u: 0},
    prefs: {language: 'All', quizCategory: 'Chat', u: 0},
    device: {onboarded: false, searchHistory: false, usePhoto: false},
    saved: {}, progress: {}, progressResetAt: 0, best: {}, attempts: {}, days: {}, scoresResetAt: 0,
    recent: [], searches: [],
    sync: {linkedUid: null, rev: zeroRev(), pushed: zeroRev(), clock: 0, lastSyncAt: 0, lastAttemptAt: 0, lastError: null},
  };
}
export const emptyProfile: Profile = {onboarded: false, name: 'Code Explorer', avatar: 0, saved: [], progress: {}, language: 'All', best: {}};

// ---------- validation primitives (all stored data is treated as untrusted) ----------
export const TERM_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/;
export const STAGE_ID = /^(?:chat|emoji|campus|context|shuffle-[a-z]{1,20}|daily-\d{4}-\d{2}-\d{2})$/;
export const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ATTEMPT_ID = /^[a-z0-9-]{4,48}$/;
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_TIME = 8.64e15;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, min = 0, max = MAX_TIME): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const time = (v: unknown) => (num(v) ? Math.floor(v) : 0);

export const cleanName = (value: string) => value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, LIMITS.name) || 'Code Explorer';
export const cleanQuery = (value: string) => value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.query);

/** Keep the newest `max` entries of a record by a time selector. */
function newest<T>(rec: Record<string, T>, max: number, at: (v: T) => number): Record<string, T> {
  const entries = Object.entries(rec);
  if (entries.length <= max) return rec;
  return Object.fromEntries(entries.sort((a, b) => at(b[1]) - at(a[1]) || a[0].localeCompare(b[0])).slice(0, max));
}

export function parseReview(r: unknown): Review | null {
  if (!isObj(r)) return null;
  const {successes, attempts, lastReviewed, nextReview, mastery} = r;
  if (!num(successes, 0, 1e6) || !num(attempts, 0, 1e6) || !num(lastReviewed) || !num(nextReview) || !num(mastery, 0, 100) || successes > attempts) return null;
  return {successes, attempts, lastReviewed, nextReview, mastery};
}
export function parseSaved(v: unknown): Record<string, SavedRec> {
  const out: Record<string, SavedRec> = {};
  if (!isObj(v)) return out;
  for (const [id, r] of Object.entries(v)) {
    if (!TERM_ID.test(id) || !isObj(r) || !num(r.u)) continue;
    out[id] = r.d === 1 ? {u: Math.floor(r.u), d: 1} : {u: Math.floor(r.u)};
  }
  return newest(out, LIMITS.saved, r => r.u);
}
export function parseProgress(v: unknown): Record<string, ProgressRec> {
  const out: Record<string, ProgressRec> = {};
  if (!isObj(v)) return out;
  for (const [id, r] of Object.entries(v)) {
    if (!TERM_ID.test(id) || !isObj(r)) continue;
    const review = parseReview(r);
    if (review) out[id] = {...review, u: num(r.u) ? Math.floor(r.u) : review.lastReviewed};
  }
  return newest(out, LIMITS.progress, r => r.u);
}
export function parseBest(v: unknown): Record<string, BestRec> {
  const out: Record<string, BestRec> = {};
  if (!isObj(v)) return out;
  for (const [id, r] of Object.entries(v)) {
    if (!STAGE_ID.test(id) || !isObj(r) || !num(r.v, 0, 100) || !num(r.u)) continue;
    out[id] = {v: Math.round(r.v), u: Math.floor(r.u)};
  }
  return newest(out, LIMITS.best, r => r.u);
}
export function parseAttempts(v: unknown): Record<string, Attempt> {
  const out: Record<string, Attempt> = {};
  if (!isObj(v)) return out;
  for (const [id, r] of Object.entries(v)) {
    if (!ATTEMPT_ID.test(id) || !isObj(r) || typeof r.stage !== 'string' || !(STAGE_ID.test(r.stage) || r.stage === 'review')) continue;
    if (!num(r.total, 1, 100) || !num(r.score, 0, 100) || r.score > r.total || !num(r.at)) continue;
    out[id] = {stage: r.stage, score: Math.floor(r.score), total: Math.floor(r.total), at: Math.floor(r.at)};
  }
  return newest(out, LIMITS.attempts, r => r.at);
}
export function parseDays(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [day, n] of Object.entries(v)) if (DAY.test(day) && num(n, 1, 1e6)) out[day] = Math.floor(n);
  const keys = Object.keys(out).sort().slice(-LIMITS.days);
  return Object.fromEntries(keys.map(k => [k, out[k]!]));
}
function parseRev(v: unknown): Record<Domain, number> {
  const r = zeroRev();
  if (isObj(v)) for (const d of DOMAINS) r[d] = time(v[d]);
  return r;
}

/** Strictly parse a v3 state object. Never throws; invalid parts fall back to defaults. */
export function parseState(input: unknown): LearningState {
  const s = emptyState();
  if (!isObj(input)) return s;
  const p = isObj(input.profile) ? input.profile : {};
  s.profile = {name: typeof p.name === 'string' ? cleanName(p.name) : s.profile.name, avatar: Number.isInteger(p.avatar) && num(p.avatar, 0, AVATAR_COUNT - 1) ? (p.avatar as number) : 0, u: time(p.u)};
  const pr = isObj(input.prefs) ? input.prefs : {};
  s.prefs = {language: LANGUAGES.includes(String(pr.language)) ? String(pr.language) : 'All', quizCategory: QUIZ_CATEGORIES.includes(String(pr.quizCategory)) ? String(pr.quizCategory) : 'Chat', u: time(pr.u)};
  const d = isObj(input.device) ? input.device : {};
  s.device = {onboarded: d.onboarded === true, searchHistory: d.searchHistory === true, usePhoto: d.usePhoto === true};
  s.saved = parseSaved(input.saved);
  s.progressResetAt = time(input.progressResetAt);
  s.progress = Object.fromEntries(Object.entries(parseProgress(input.progress)).filter(([, r]) => r.u > s.progressResetAt));
  s.scoresResetAt = time(input.scoresResetAt);
  s.best = Object.fromEntries(Object.entries(parseBest(input.best)).filter(([, r]) => r.u > s.scoresResetAt));
  s.attempts = Object.fromEntries(Object.entries(parseAttempts(input.attempts)).filter(([, r]) => r.at > s.scoresResetAt));
  const resetDay = s.scoresResetAt ? localDayOf(s.scoresResetAt) : '';
  s.days = Object.fromEntries(Object.entries(parseDays(input.days)).filter(([day]) => day >= resetDay));
  if (Array.isArray(input.recent)) {
    const seen = new Set<string>();
    for (const r of input.recent) if (isObj(r) && typeof r.id === 'string' && TERM_ID.test(r.id) && num(r.at) && !seen.has(r.id) && seen.size < LIMITS.recent) {seen.add(r.id); s.recent.push({id: r.id, at: Math.floor(r.at)});}
  }
  if (Array.isArray(input.searches) && s.device.searchHistory) {
    const seen = new Set<string>();
    for (const r of input.searches) if (isObj(r) && typeof r.q === 'string' && num(r.at)) {const q = cleanQuery(r.q); if (q.length >= 1 && !seen.has(q.toLowerCase()) && seen.size < LIMITS.searches) {seen.add(q.toLowerCase()); s.searches.push({q, at: Math.floor(r.at)});}}
  }
  const sy = isObj(input.sync) ? input.sync : {};
  s.sync = {
    linkedUid: typeof sy.linkedUid === 'string' && UID.test(sy.linkedUid) ? sy.linkedUid : null,
    rev: parseRev(sy.rev), pushed: parseRev(sy.pushed), clock: time(sy.clock), lastSyncAt: time(sy.lastSyncAt), lastAttemptAt: time(sy.lastAttemptAt),
    lastError: typeof sy.lastError === 'string' ? sy.lastError.slice(0, 200) : null,
  };
  for (const dm of DOMAINS) if (s.sync.pushed[dm] > s.sync.rev[dm]) s.sync.pushed[dm] = s.sync.rev[dm];
  return s;
}

/**
 * Migrate a v1/v2 profile (single JSON blob). Unlike the old parser, saved IDs that are
 * not in the current content build are kept. Order of saves is preserved via stamps.
 */
export function migrateLegacy(input: unknown, now: number): LearningState {
  const s = emptyState();
  if (!isObj(input)) return s;
  s.device.onboarded = input.onboarded === true;
  s.profile = {name: typeof input.name === 'string' ? cleanName(input.name) : s.profile.name, avatar: Number.isInteger(input.avatar) && num(input.avatar, 0, AVATAR_COUNT - 1) ? (input.avatar as number) : 0, u: now};
  s.prefs = {language: LANGUAGES.includes(String(input.language)) ? String(input.language) : 'All', quizCategory: 'Chat', u: now};
  const ids = Array.isArray(input.saved) ? [...new Set(input.saved.filter((x): x is string => typeof x === 'string' && TERM_ID.test(x)))].slice(0, LIMITS.saved) : [];
  ids.forEach((id, i) => {s.saved[id] = {u: now - (ids.length - i)};});
  if (isObj(input.progress)) for (const [id, r] of Object.entries(input.progress)) {
    const review = TERM_ID.test(id) ? parseReview(r) : null;
    if (review) s.progress[id] = {...review, u: review.lastReviewed || now};
  }
  if (isObj(input.best)) for (const [id, v] of Object.entries(input.best)) if (STAGE_ID.test(id) && num(v, 0, 100)) s.best[id] = {v: Math.round(v), u: now};
  s.best = newest(s.best, LIMITS.best, r => r.u);
  s.sync.clock = now;
  s.sync.rev = {profile: 1, saved: 1, progress: 1, scores: 1};
  return s;
}

/** Legacy-compatible helper: parse a stored JSON string and return the UI view. */
export function parseProfile(raw: string | null): Profile {
  if (!raw) return {...emptyProfile, saved: [], progress: {}, best: {}};
  let value: unknown;
  try {value = JSON.parse(raw);} catch {return {...emptyProfile, saved: [], progress: {}, best: {}};}
  if (isObj(value) && value.v === 3) return view(parseState(value));
  return view(migrateLegacy(value, Date.now()));
}

/** Records visible to the UI: only active entries for terms in the current content build. */
export function view(s: LearningState): Profile {
  const saved = Object.entries(s.saved).filter(([id, r]) => !r.d && termsById.has(id)).sort((a, b) => a[1].u - b[1].u).map(([id]) => id);
  const progress: Record<string, Review> = {};
  for (const [id, r] of Object.entries(s.progress)) if (termsById.has(id)) {const {u: _u, ...review} = r; progress[id] = review;}
  const best: Record<string, number> = {};
  for (const [id, r] of Object.entries(s.best)) best[id] = r.v;
  return {onboarded: s.device.onboarded, name: s.profile.name, avatar: s.profile.avatar, usePhoto: s.device.usePhoto, saved, progress, language: s.prefs.language, best};
}

/** Saved records that point to entries missing from this content build (kept, not shown). */
export const unavailableSavedCount = (s: LearningState) => Object.entries(s.saved).filter(([id, r]) => !r.d && !termsById.has(id)).length;

export const totalXP = (best: Record<string, number>) => Object.values(best).reduce((a, b) => a + Math.round(b / 10), 0) * 10;

export function localDayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return localDayOf(new Date(y, m - 1, d - 1, 12).getTime());
}
/** Consecutive local days with learning activity, ending today (or yesterday if today has none yet). */
export function streak(days: Record<string, number>, now = Date.now()): {current: number; best: number; activeToday: boolean} {
  const today = localDayOf(now);
  const activeToday = (days[today] ?? 0) > 0;
  let cursor = activeToday ? today : previousDay(today), current = 0;
  while ((days[cursor] ?? 0) > 0 && current < LIMITS.days) {current++; cursor = previousDay(cursor);}
  let best = 0, run = 0, prev = '';
  for (const day of Object.keys(days).sort()) {
    run = prev && previousDay(day) === prev ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return {current, best: Math.max(best, current), activeToday};
}

export function isDirty(s: LearningState, d?: Domain): boolean {
  return d ? s.sync.rev[d] > s.sync.pushed[d] : DOMAINS.some(x => s.sync.rev[x] > s.sync.pushed[x]);
}

/** Portable export: only the user's own learning records, no sync internals or messages. */
export function exportLearning(s: LearningState): string {
  const clean = parseState(JSON.parse(JSON.stringify(s)));
  return JSON.stringify({
    product: 'GenZ Code', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    profile: {name: clean.profile.name, avatar: clean.profile.avatar},
    preferences: {language: clean.prefs.language, quizCategory: clean.prefs.quizCategory, searchHistory: clean.device.searchHistory},
    saved: Object.entries(clean.saved).filter(([, r]) => !r.d).sort((a, b) => a[1].u - b[1].u).map(([id, r]) => ({id, expression: termsById.get(id)?.expression ?? null, savedAt: new Date(r.u).toISOString()})),
    reviewProgress: Object.fromEntries(Object.entries(clean.progress).map(([id, r]) => [id, {mastery: r.mastery, attempts: r.attempts, successes: r.successes, nextReview: new Date(r.nextReview).toISOString()}])),
    bestScores: Object.fromEntries(Object.entries(clean.best).map(([id, r]) => [id, r.v])),
    quizAttempts: Object.values(clean.attempts).sort((a, b) => b.at - a.at).map(a => ({...a, at: new Date(a.at).toISOString()})),
    activityDays: clean.days,
    recentlyViewed: clean.recent.map(r => ({id: r.id, at: new Date(r.at).toISOString()})),
    searchHistory: clean.searches.map(r => ({query: r.q, at: new Date(r.at).toISOString()})),
  }, null, 2);
}
/** @deprecated kept for compatibility with older callers/tests. */
export function exportProfile(p: Profile): string {
  const s = emptyState();
  s.profile = {name: cleanName(p.name), avatar: p.avatar, u: 0};
  s.prefs.language = LANGUAGES.includes(p.language) ? p.language : 'All';
  (Array.isArray(p.saved) ? p.saved : []).forEach((id, i) => {if (typeof id === 'string' && termsById.has(id)) s.saved[id] = {u: i + 1};});
  return exportLearning(s);
}
