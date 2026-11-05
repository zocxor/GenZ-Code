import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LearningStore} from '../src/storage';
import {LearningRepository} from '../src/repository';
import {emptyState, view, isDirty, Domain, streak} from '../src/profile';
import {toggleSaved, setProfileDetails, recordRound, recordAnswer, resetScores, removeAllSaved} from '../src/learning';
import {SyncEngine, CloudAdapter, CloudError, AccountStatus} from '../src/sync/engine';
import {mergeSaved, mergeProgress, mergeScores, mergeDomain, parseRemote, DomainDoc} from '../src/sync/merge';
import {memory} from './helpers';
import {logger} from '../src/secure/logger';
logger.setSink(null);

/** In-memory server with transactional semantics and a status flag (simulates rules). */
function fakeCloud() {
  const docs = new Map<string, unknown>();
  const accounts = new Map<string, AccountStatus>();
  let offline = false, writes = 0, denied = false;
  const cloud: CloudAdapter = {
    async ensureAccount(uid) {if (offline) throw new CloudError('offline'); if (!accounts.has(uid)) accounts.set(uid, 'active'); return accounts.get(uid)!;},
    async transact(uid, domain, merge) {
      if (offline) throw new CloudError('offline');
      if (denied || accounts.get(uid) !== 'active') throw new CloudError('permission-denied');
      const key = uid + '/' + domain;
      const remote = parseRemote(domain, docs.get(key) ?? {});
      const merged = merge(remote);
      if (JSON.stringify(merged) !== JSON.stringify(remote)) {docs.set(key, JSON.parse(JSON.stringify(merged))); writes++;}
      return merged;
    },
    async reportActivity() {if (offline) throw new CloudError('offline');},
    async deleteCloudData(uid) {for (const k of [...docs.keys()]) if (k.startsWith(uid + '/')) docs.delete(k); accounts.set(uid, 'deleted');},
  };
  return {cloud, docs, accounts, setOffline: (v: boolean) => {offline = v;}, setDenied: (v: boolean) => {denied = v;}, writes: () => writes};
}
const manualTimer = () => {const jobs: (() => void)[] = []; return {timer: {set: (fn: () => void) => {jobs.push(fn); return jobs.length;}, clear: () => {}}, jobs};};
async function device(cloud: CloudAdapter, clock = {t: 1_000_000}) {
  const m = memory();
  const repo = new LearningRepository(new LearningStore(m.store), () => clock.t);
  await repo.load();
  const t = manualTimer();
  const engine = new SyncEngine(repo, cloud, {appVersion: '0.8.0', platform: 'test', now: () => clock.t, timer: t.timer, debounceMs: 1});
  return {repo, engine, m, jobs: t.jobs};
}

test('guest progress is pushed on first sign-in and confirmed by the server', async () => {
  const f = fakeCloud();
  const a = await device(f.cloud);
  await a.repo.mutate(toggleSaved('idk'));
  assert.equal(isDirty(a.repo.getState()), true);
  a.engine.setUser('user1');
  await a.engine.syncNow();
  assert.equal(a.engine.getStatus().phase, 'idle');
  assert.equal(isDirty(a.repo.getState()), false);
  assert.equal(a.repo.getState().sync.linkedUid, 'user1');
  assert.ok((f.docs.get('user1/saved') as {items: Record<string, unknown>}).items.idk);
});

test('two devices converge: favorites, removals, scores and profile edits all merge', async () => {
  const f = fakeCloud();
  const clock = {t: 1_000_000};
  const a = await device(f.cloud, clock), b = await device(f.cloud, clock);
  a.engine.setUser('u'); b.engine.setUser('u');
  await a.engine.syncNow(); await b.engine.syncNow();
  await a.repo.mutate(toggleSaved('idk')); clock.t += 10;
  await b.repo.mutate(toggleSaved('rn')); clock.t += 10;
  await b.repo.mutate(recordRound('chat', 5, 5, 'a-bbbb-0001')); clock.t += 10;
  await a.repo.mutate(setProfileDetails('Device A name', 3)); clock.t += 10;
  await a.engine.syncNow(); await b.engine.syncNow(); await a.engine.syncNow();
  for (const d of [a, b]) {
    const p = view(d.repo.getState());
    assert.deepEqual([...p.saved].sort(), ['idk', 'rn']);
    assert.equal(p.best.chat, 100);
    assert.equal(p.name, 'Device A name');
  }
  // A removal on one device wins over the older save on the other.
  await b.repo.mutate(toggleSaved('idk')); clock.t += 10;
  await b.engine.syncNow(); await a.engine.syncNow();
  assert.deepEqual(view(a.repo.getState()).saved, ['rn']);
});

test('offline changes stay local, retry is scheduled, and sync completes after reconnecting', async () => {
  const f = fakeCloud();
  const a = await device(f.cloud);
  a.engine.setUser('u');
  await a.engine.syncNow();
  f.setOffline(true);
  await a.repo.mutate(toggleSaved('idk'));
  await a.engine.syncNow();
  assert.equal(a.engine.getStatus().phase, 'offline');
  assert.ok(a.engine.getStatus().nextRetryAt > 0);
  assert.deepEqual(view(a.repo.getState()).saved, ['idk'], 'local data is never removed while offline');
  assert.equal(isDirty(a.repo.getState()), true);
  f.setOffline(false);
  a.jobs.at(-1)!(); // the scheduled retry fires
  await a.engine.syncNow();
  assert.equal(isDirty(a.repo.getState()), false);
  assert.equal(a.engine.getStatus().phase, 'idle');
});

test('re-running sync with no changes performs no writes (idempotent, no duplicate sync)', async () => {
  const f = fakeCloud();
  const a = await device(f.cloud);
  await a.repo.mutate(toggleSaved('idk'));
  a.engine.setUser('u');
  await a.engine.syncNow();
  const writes = f.writes();
  await a.engine.syncNow(); await a.engine.syncNow();
  assert.equal(f.writes(), writes);
});

test('signing into a different account never merges the previous account’s data', async () => {
  const f = fakeCloud();
  const a = await device(f.cloud);
  await a.repo.mutate(toggleSaved('idk'));
  a.engine.setUser('alice');
  await a.engine.syncNow();
  a.engine.setUser(null);
  a.engine.setUser('bob');
  await a.engine.syncNow();
  assert.equal(a.engine.getStatus().phase, 'account-mismatch');
  assert.equal(f.docs.has('bob/saved'), false);
  await a.engine.adoptSignedInAccount();
  assert.deepEqual(view(a.repo.getState()).saved, []);
  assert.equal(a.repo.getState().sync.linkedUid, 'bob');
  assert.ok((f.docs.get('alice/saved') as {items: Record<string, unknown>}).items.idk, 'alice’s cloud copy untouched');
});

test('suspended accounts are blocked from syncing but keep local learning', async () => {
  const f = fakeCloud();
  f.accounts.set('u', 'suspended');
  const events: string[] = [];
  const m = memory();
  const repo = new LearningRepository(new LearningStore(m.store));
  await repo.load();
  await repo.mutate(toggleSaved('idk'));
  const engine = new SyncEngine(repo, f.cloud, {appVersion: 'x', platform: 't', timer: manualTimer().timer, onSecurityEvent: t => events.push(t)});
  engine.setUser('u');
  await engine.syncNow();
  assert.equal(engine.getStatus().phase, 'blocked');
  assert.equal(f.docs.size, 0);
  assert.deepEqual(view(repo.getState()).saved, ['idk']);
  assert.deepEqual(events, ['sync_blocked_account_status']);
});

test('repeated server denials are recorded and eventually stop retries', async () => {
  const f = fakeCloud();
  const events: string[] = [];
  const m = memory();
  const repo = new LearningRepository(new LearningStore(m.store));
  await repo.load();
  const engine = new SyncEngine(repo, f.cloud, {appVersion: 'x', platform: 't', timer: manualTimer().timer, onSecurityEvent: t => events.push(t)});
  engine.setUser('u'); await engine.syncNow();
  f.setDenied(true);
  for (let i = 0; i < 3; i++) await engine.syncNow();
  assert.equal(engine.getStatus().phase, 'blocked');
  assert.equal(events.filter(e => e === 'sync_permission_denied').length, 3);
});

test('cloud deletion removes all server records for the account', async () => {
  const f = fakeCloud();
  const a = await device(f.cloud);
  await a.repo.mutate(toggleSaved('idk'));
  a.engine.setUser('u'); await a.engine.syncNow();
  assert.ok(f.docs.size > 0);
  await a.engine.deleteCloudData();
  assert.equal([...f.docs.keys()].filter(k => k.startsWith('u/')).length, 0);
  assert.equal(f.accounts.get('u'), 'deleted');
});

test('merge is commutative and idempotent for every domain', () => {
  const s1 = emptyState(), s2 = emptyState();
  s1.saved = {a1: {u: 5}, b1: {u: 9, d: 1}}; s2.saved = {a1: {u: 7, d: 1}, b1: {u: 3}, c1: {u: 4}};
  const ab = mergeSaved({items: s1.saved}, {items: s2.saved}), ba = mergeSaved({items: s2.saved}, {items: s1.saved});
  assert.deepEqual(ab, ba);
  assert.deepEqual(mergeSaved(ab, {items: s1.saved}), ab);
  assert.deepEqual(ab.items, {a1: {u: 7, d: 1}, b1: {u: 9, d: 1}, c1: {u: 4}});
  const r = (u: number, a: number) => ({successes: 1, attempts: a, lastReviewed: u, nextReview: u + 1, mastery: 20, u});
  const p1 = {items: {x1: r(10, 2)}, resetAt: 0}, p2 = {items: {x1: r(10, 3), y1: r(4, 1)}, resetAt: 5};
  assert.deepEqual(mergeProgress(p1, p2), mergeProgress(p2, p1));
  assert.deepEqual(Object.keys(mergeProgress(p1, p2).items), ['x1'], 'reset watermark drops older records');
  const sc1 = {best: {chat: {v: 60, u: 2}}, attempts: {'a-1111': {stage: 'chat', score: 3, total: 5, at: 2}}, days: {'2026-11-01': 2}, resetAt: 0};
  const sc2 = {best: {chat: {v: 80, u: 1}}, attempts: {'a-2222': {stage: 'chat', score: 4, total: 5, at: 3}}, days: {'2026-11-01': 1, '2026-11-02': 1}, resetAt: 0};
  const m = mergeScores(sc1, sc2);
  assert.deepEqual(m, mergeScores(sc2, sc1));
  assert.equal(m.best.chat!.v, 80);
  assert.equal(Object.keys(m.attempts).length, 2);
  assert.deepEqual(m.days, {'2026-11-01': 2, '2026-11-02': 1});
  for (const d of ['profile', 'saved', 'progress', 'scores'] as Domain[]) {const x = parseRemote(d, {}); assert.deepEqual(mergeDomain(d, x as DomainDoc[typeof d], x as DomainDoc[typeof d]), x);}
});

test('remote documents are validated as untrusted input', () => {
  const hostile = parseRemote('saved', {items: {'../../etc': {u: 1}, ok1: {u: 'x'}, idk: {u: 3, d: 1, extra: true}, ['x'.repeat(200)]: {u: 1}}});
  assert.deepEqual(hostile.items, {idk: {u: 3, d: 1}});
  const prof = parseRemote('profile', {profile: {name: '\u202Eevil\u0000', avatar: 99, u: 1}, prefs: {language: 'Klingon', u: 1}});
  assert.equal(prof.profile.name, 'evil');
  assert.equal(prof.profile.avatar, 0);
  assert.equal(prof.prefs.language, 'All');
});

test('bulk resets and removals propagate to other devices', async () => {
  const f = fakeCloud();
  const clock = {t: 2_000_000};
  const a = await device(f.cloud, clock), b = await device(f.cloud, clock);
  a.engine.setUser('u'); b.engine.setUser('u');
  await a.repo.mutate(recordRound('chat', 5, 5, 'a-cccc-0001'));
  await a.repo.mutate(toggleSaved('idk')); await a.repo.mutate(toggleSaved('rn'));
  // setUser() started a sync that may have run before these edits; the follow-up run is
  // normally fired by the debounce timer, which is manual in tests.
  await a.engine.syncNow(); await a.engine.syncNow(); await b.engine.syncNow(); await b.engine.syncNow();
  assert.deepEqual(view(b.repo.getState()).saved.sort(), ['idk', 'rn']);
  assert.equal(view(b.repo.getState()).best.chat, 100);
  clock.t += 100;
  await b.repo.mutate(resetScores); await b.repo.mutate(removeAllSaved);
  await b.engine.syncNow(); await a.engine.syncNow();
  assert.deepEqual(view(a.repo.getState()).best, {});
  assert.deepEqual(view(a.repo.getState()).saved, []);
});

test('streaks count consecutive local days of answered questions', async () => {
  const day = (d: number) => new Date(2026, 10, d, 12).getTime();
  let s = emptyState();
  for (const d of [1, 2, 3, 5, 6]) s = recordAnswer(undefined, true)(s, day(d));
  assert.deepEqual(streak(s.days, day(6)), {current: 2, best: 3, activeToday: true});
  assert.equal(streak(s.days, day(7)).current, 2, 'yesterday still counts until today ends');
  assert.equal(streak(s.days, day(8)).current, 0);
});
