/**
 * Pure learning-state transitions. Each function returns a new state and never mutates
 * its input, so the repository can persist first and commit to the UI only on success.
 */
import {review} from './engine';
import {LearningState, Domain, LIMITS, LANGUAGES, QUIZ_CATEGORIES, AVATAR_COUNT, TERM_ID, STAGE_ID, cleanName, cleanQuery, localDayOf} from './profile';

export type Action = (s: LearningState, now: number) => LearningState;

function touch(s: LearningState, domains: Domain[], now: number): LearningState {
  const rev = {...s.sync.rev};
  for (const d of domains) rev[d] = Math.max(rev[d] + 1, 1);
  return {...s, sync: {...s.sync, rev, clock: Math.max(s.sync.clock, now)}};
}
const assert = (ok: boolean, message: string) => {if (!ok) throw new RangeError(message);};

export const setSaved = (id: string, on: boolean): Action => (s, now) => {
  assert(TERM_ID.test(id), 'Invalid entry id');
  const current = s.saved[id];
  if (on === !!(current && !current.d)) return s; // idempotent: no duplicate records
  return touch({...s, saved: {...s.saved, [id]: on ? {u: now} : {u: now, d: 1}}}, ['saved'], now);
};
export const toggleSaved = (id: string): Action => (s, now) => setSaved(id, !(s.saved[id] && !s.saved[id]!.d))(s, now);
export const removeAllSaved: Action = (s, now) => {
  const saved = {...s.saved};
  let changed = false;
  for (const [id, r] of Object.entries(saved)) if (!r.d) {saved[id] = {u: now, d: 1}; changed = true;}
  return changed ? touch({...s, saved}, ['saved'], now) : s;
};

export const setProfileDetails = (name: string, avatar: number): Action => (s, now) => {
  assert(Number.isInteger(avatar) && avatar >= 0 && avatar < AVATAR_COUNT, 'Invalid avatar');
  const clean = cleanName(name);
  if (clean === s.profile.name && avatar === s.profile.avatar) return s;
  return touch({...s, profile: {name: clean, avatar, u: now}}, ['profile'], now);
};
export const setAvatar = (avatar: number): Action => (s, now) => setProfileDetails(s.profile.name, avatar)(s, now);
export const setUsePhoto = (on: boolean): Action => s => (s.device.usePhoto === on ? s : {...s, device: {...s.device, usePhoto: on}});
export const setOnboarded: Action = s => (s.device.onboarded ? s : {...s, device: {...s.device, onboarded: true}});
export const setLanguage = (language: string): Action => (s, now) => {
  assert(LANGUAGES.includes(language), 'Invalid language');
  return language === s.prefs.language ? s : touch({...s, prefs: {...s.prefs, language, u: now}}, ['profile'], now);
};
export const setQuizCategory = (quizCategory: string): Action => (s, now) => {
  assert(QUIZ_CATEGORIES.includes(quizCategory), 'Invalid category');
  return quizCategory === s.prefs.quizCategory ? s : touch({...s, prefs: {...s.prefs, quizCategory, u: now}}, ['profile'], now);
};

/** One answered question: spaced-repetition update plus a learning-day mark for streaks. */
export const recordAnswer = (termId: string | undefined, correct: boolean): Action => (s, now) => {
  const day = localDayOf(now);
  const days = {...s.days, [day]: (s.days[day] ?? 0) + 1};
  const keys = Object.keys(days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - LIMITS.days))) delete days[k];
  let next: LearningState = {...s, days};
  const domains: Domain[] = ['scores'];
  if (termId && TERM_ID.test(termId)) {
    const old = s.progress[termId];
    const updated = review(old, correct, now);
    if (updated !== old) {next = {...next, progress: {...s.progress, [termId]: {...updated, u: now}}}; domains.push('progress');}
  }
  return touch(next, domains, now);
};

/** A finished round: best score (never for review rounds) plus a bounded attempt log. */
export const recordRound = (stageId: string, score: number, total: number, attemptId: string): Action => (s, now) => {
  assert(total >= 1 && total <= 100 && score >= 0 && score <= total, 'Invalid score');
  assert(stageId === 'review' || STAGE_ID.test(stageId), 'Invalid stage');
  if (s.attempts[attemptId]) return s; // idempotent retry
  const attempts = {...s.attempts, [attemptId]: {stage: stageId, score, total, at: now}};
  const ordered = Object.entries(attempts).sort((a, b) => b[1].at - a[1].at);
  const best = {...s.best};
  if (stageId !== 'review') {
    const pct = Math.round((score / total) * 100);
    if ((best[stageId]?.v ?? -1) < pct) best[stageId] = {v: pct, u: now};
  }
  return touch({...s, best, attempts: Object.fromEntries(ordered.slice(0, LIMITS.attempts))}, ['scores'], now);
};

export const recordView = (id: string): Action => (s, now) => {
  if (!TERM_ID.test(id)) return s;
  if (s.recent[0]?.id === id && now - s.recent[0].at < 60_000) return s;
  return {...s, recent: [{id, at: now}, ...s.recent.filter(r => r.id !== id)].slice(0, LIMITS.recent)};
};
export const recordSearch = (query: string): Action => (s, now) => {
  if (!s.device.searchHistory) return s;
  const q = cleanQuery(query);
  if (q.length < 2) return s;
  return {...s, searches: [{q, at: now}, ...s.searches.filter(r => r.q.toLowerCase() !== q.toLowerCase())].slice(0, LIMITS.searches)};
};
export const setSearchHistory = (on: boolean): Action => s => ({...s, device: {...s.device, searchHistory: on}, searches: on ? s.searches : []});
export const clearBrowsingHistory: Action = s => ({...s, recent: [], searches: []});
/** Resets sync across devices through a watermark, so old records cannot reappear on merge. */
export const resetScores: Action = (s, now) => touch({...s, best: {}, attempts: {}, days: {}, scoresResetAt: now}, ['scores'], now);
export const resetReviewProgress: Action = (s, now) => touch({...s, progress: {}, progressResetAt: now}, ['progress'], now);

export const newAttemptId = (now = Date.now()) => `a-${now.toString(36)}-${Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0')}`;
