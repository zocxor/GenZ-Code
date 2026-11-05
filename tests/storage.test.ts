import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LearningStore, STATE_KEY, BACKUP_KEY, PROFILE_KEY, LEGACY_KEY, QUARANTINE_PREFIX, Store, encodeEnvelope, decodeEnvelope, ReadOnlyError, StorageUnavailableError} from '../src/storage';
import {emptyState, view} from '../src/profile';
import {LearningRepository} from '../src/repository';
import {toggleSaved, setProfileDetails, recordRound, newAttemptId} from '../src/learning';
import {logger} from '../src/secure/logger';
import {memory} from './helpers';
logger.setSink(null);

test('save → close → reopen restores the same learning data (persistence round trip)', async () => {
  const m = memory();
  const repo = new LearningRepository(new LearningStore(m.store), () => 1_000_000);
  await repo.load();
  await repo.mutate(toggleSaved('idk'));
  await repo.mutate(setProfileDetails('Ana', 2));
  await repo.mutate(recordRound('chat', 4, 5, 'a-test-0001'));
  // Simulate an app restart / force stop: a brand-new store and repository over the same disk.
  const reopened = new LearningRepository(new LearningStore(m.store));
  await reopened.load();
  const p = view(reopened.getState());
  assert.deepEqual(p.saved, ['idk']);
  assert.equal(p.name, 'Ana');
  assert.equal(p.avatar, 2);
  assert.equal(p.best.chat, 80);
  assert.equal(reopened.getHealth().outcome, 'loaded');
});

test('UI state only changes after the write is confirmed; failed writes leave state untouched', async () => {
  const m = memory();
  const repo = new LearningRepository(new LearningStore(m.store));
  await repo.load();
  m.store.fail = 'write';
  await assert.rejects(repo.mutate(toggleSaved('idk')));
  assert.deepEqual(view(repo.getState()).saved, []);
  assert.ok(repo.getHealth().lastError);
  m.store.fail = undefined;
  await repo.mutate(toggleSaved('idk'));
  assert.deepEqual(view(repo.getState()).saved, ['idk']);
  assert.equal(repo.getHealth().lastError, null);
});

test('saved entries missing from the current content build are preserved, not destroyed', async () => {
  const m = memory();
  m.data.set(PROFILE_KEY, JSON.stringify({onboarded: true, saved: ['idk', 'removed-in-update', 'idk'], best: {chat: 60}}));
  const repo = new LearningRepository(new LearningStore(m.store));
  await repo.load();
  assert.equal(repo.getHealth().outcome, 'migrated');
  assert.deepEqual(view(repo.getState()).saved, ['idk']); // hidden from UI
  await repo.mutate(toggleSaved('rn')); // a later save must not wipe the orphan
  const stored = decodeEnvelope(m.data.get(STATE_KEY)!)!;
  assert.ok(stored.saved['removed-in-update'] && !stored.saved['removed-in-update'].d);
  assert.equal(m.data.has(PROFILE_KEY), false, 'legacy key removed only after v3 write');
});

test('v1 legacy data migrates with order, scores and progress intact', async () => {
  const m = memory();
  const r = {successes: 1, attempts: 2, lastReviewed: 500, nextReview: 900, mastery: 20};
  m.data.set(LEGACY_KEY, JSON.stringify({name: 'Old', saved: ['rn', 'idk'], progress: {idk: r}, best: {emoji: 100}, language: 'English'}));
  const repo = new LearningRepository(new LearningStore(m.store));
  await repo.load();
  const p = view(repo.getState());
  assert.deepEqual(p.saved, ['rn', 'idk']);
  assert.deepEqual(p.progress.idk, r);
  assert.equal(p.best.emoji, 100);
  assert.equal(p.language, 'English');
  assert.equal(m.data.has(LEGACY_KEY), false);
});

test('a corrupt primary record recovers from the backup and is quarantined, not deleted', async () => {
  const m = memory();
  const good = emptyState();
  good.saved.idk = {u: 5};
  m.data.set(BACKUP_KEY, encodeEnvelope(good));
  m.data.set(STATE_KEY, '{"v":3,"sum":"00000000","data":{"saved":{}}'); // truncated write
  const repo = new LearningRepository(new LearningStore(m.store));
  await repo.load();
  assert.equal(repo.getHealth().outcome, 'recovered-backup');
  assert.deepEqual(view(repo.getState()).saved, ['idk']);
  assert.ok([...m.data.keys()].some(k => k.startsWith(QUARANTINE_PREFIX)));
});

test('checksum mismatch is detected as corruption', () => {
  const raw = encodeEnvelope(emptyState());
  assert.ok(decodeEnvelope(raw));
  assert.equal(decodeEnvelope(raw.replace('"Code Explorer"', '"Code Explorers"')), null);
});

test('corrupt primary and backup: data quarantined, app continues with fresh writable state', async () => {
  const m = memory();
  m.data.set(STATE_KEY, '{bad');
  m.data.set(BACKUP_KEY, 'also bad');
  const repo = new LearningRepository(new LearningStore(m.store));
  const health = await repo.load();
  assert.equal(health.outcome, 'reset-corrupt');
  assert.equal(health.quarantined, 2);
  await repo.mutate(toggleSaved('idk'));
  assert.deepEqual(view(repo.getState()).saved, ['idk']);
  const quarantined = [...m.data.entries()].filter(([k]) => k.startsWith(QUARANTINE_PREFIX)).map(([, v]) => v).sort();
  assert.deepEqual(quarantined, ['also bad', '{bad'].sort());
});

test('transient read failure blocks all writes, preserves data, and can be retried', async () => {
  const m = memory();
  const s = emptyState(); s.profile.name = 'Keep me';
  m.data.set(STATE_KEY, encodeEnvelope(s));
  m.store.fail = 'read';
  const store = new LearningStore(m.store);
  await assert.rejects(store.load(), StorageUnavailableError);
  await assert.rejects(store.save(emptyState()), ReadOnlyError);
  m.store.fail = undefined;
  assert.equal((await store.load()).state.profile.name, 'Keep me');
  assert.equal(m.calls.length, 0);
});

test('read-only mode keeps new changes in memory only and never overwrites unread data', async () => {
  const m = memory();
  m.data.set(STATE_KEY, encodeEnvelope(emptyState()));
  m.store.fail = 'read';
  const repo = new LearningRepository(new LearningStore(m.store));
  assert.equal((await repo.load()).status, 'read-only');
  await repo.mutate(toggleSaved('idk'));
  assert.equal(repo.isVolatile, true);
  assert.equal(m.calls.length, 0);
});

test('writes are serialized; deletion waits for pending writes and leaves storage empty', async () => {
  const m = memory();
  let release!: () => void;
  const held = new Promise<void>(r => (release = r));
  const original = m.store.multiSet!;
  m.store.multiSet = async pairs => {await held; await original(pairs);};
  const repo = new LearningRepository(new LearningStore(m.store));
  await repo.load();
  const save = repo.mutate(toggleSaved('idk'));
  const clear = repo.clear();
  release();
  await Promise.all([save, clear]);
  assert.equal(m.calls[0], 'multiSet:' + STATE_KEY);
  assert.ok(m.calls.includes('remove'));
  assert.deepEqual(view(repo.getState()).saved, []);
  assert.equal(repo.getState().device.onboarded, true);
});

test('duplicate saves are idempotent and repeated round results are not double-counted', async () => {
  const m = memory();
  const repo = new LearningRepository(new LearningStore(m.store));
  await repo.load();
  await repo.mutate(toggleSaved('idk'));
  const writes = m.calls.length;
  const id = newAttemptId(1);
  await repo.mutate(recordRound('chat', 3, 5, id));
  await repo.mutate(recordRound('chat', 3, 5, id));
  assert.equal(Object.keys(repo.getState().attempts).length, 1);
  assert.equal(m.calls.length, writes + 1);
});

test('the previous good record is kept as a backup in the same transaction', async () => {
  const m = memory();
  const repo = new LearningRepository(new LearningStore(m.store));
  await repo.load();
  await repo.mutate(toggleSaved('idk'));
  await repo.mutate(toggleSaved('rn'));
  assert.equal(m.calls.at(-1), `multiSet:${STATE_KEY},${BACKUP_KEY}`);
  assert.deepEqual(view(decodeEnvelope(m.data.get(BACKUP_KEY)!)!).saved, ['idk']);
});
