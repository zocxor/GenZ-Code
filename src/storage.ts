/**
 * Durable local storage for learning data.
 *
 * AsyncStorage is backed by SQLite on Android; multiSet runs in one transaction, so the
 * primary record and its backup are committed together. Every write is serialized.
 *
 * Load order: v3 primary → v3 backup (previous good write) → v2/v1 migration → fresh.
 * Unreadable data is copied to a quarantine key before anything new is written, so a
 * corrupt record never blocks the app forever and is never silently destroyed.
 * A transient read failure (storage unavailable) still blocks writes (read-only mode).
 */
import {LearningState, parseState, migrateLegacy, emptyState} from './profile';
import {fnv1a} from './secure/integrity';

export const STATE_KEY = 'genz-code-v3', BACKUP_KEY = 'genz-code-v3.bak', PROFILE_KEY = 'genz-code-v2', LEGACY_KEY = 'genz-mode-v1', QUARANTINE_PREFIX = 'genz-code-quarantine.';
export const MAX_RECORD_CHARS = 1_800_000; // below Android's 2 MB CursorWindow per value

export type Store = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  multiSet?: (pairs: [string, string][]) => Promise<void>;
  multiRemove: (keys: string[]) => Promise<void>;
  getAllKeys?: () => Promise<readonly string[]>;
};
export type LoadOutcome = 'fresh' | 'loaded' | 'migrated' | 'recovered-backup' | 'reset-corrupt';
export type LoadResult = {state: LearningState; outcome: LoadOutcome; quarantined: number};

export class StorageUnavailableError extends Error {constructor(message = 'Storage is unavailable.') {super(message); this.name = 'StorageUnavailableError';}}
export class StorageQuotaError extends Error {constructor() {super('Learning data is too large to save safely.'); this.name = 'StorageQuotaError';}}
export class ReadOnlyError extends Error {constructor() {super('Read-only recovery mode.'); this.name = 'ReadOnlyError';}}

type Envelope = {v: 3; savedAt: number; sum: string; data: unknown};
export function encodeEnvelope(state: LearningState, now = Date.now()): string {
  const data = JSON.stringify(state);
  return `{"v":3,"savedAt":${now},"sum":"${fnv1a(data)}","data":${data}}`;
}
/** Returns the parsed state, or null when the envelope is malformed or fails its checksum. */
export function decodeEnvelope(raw: string | null): LearningState | null {
  if (raw === null) return null;
  let env: Envelope;
  try {env = JSON.parse(raw);} catch {return null;}
  if (!env || typeof env !== 'object' || env.v !== 3 || typeof env.sum !== 'string' || !env.data || typeof env.data !== 'object') return null;
  if (fnv1a(JSON.stringify(env.data)) !== env.sum) return null;
  return parseState(env.data);
}

export class LearningStore {
  private tail: Promise<unknown> = Promise.resolve();
  private writable = false;
  private lastGood: string | null = null;
  constructor(private store: Store, private clock: () => number = Date.now) {}

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.tail.catch(() => {}).then(job);
    this.tail = run;
    return run;
  }
  private async writePair(primary: string, backup: string | null) {
    if (primary.length > MAX_RECORD_CHARS) throw new StorageQuotaError();
    const pairs: [string, string][] = backup ? [[STATE_KEY, primary], [BACKUP_KEY, backup]] : [[STATE_KEY, primary]];
    if (this.store.multiSet) await this.store.multiSet(pairs);
    else for (const [k, v] of pairs) await this.store.setItem(k, v);
    this.lastGood = primary;
  }
  private async quarantine(raw: string, now: number) {
    await this.store.setItem(QUARANTINE_PREFIX + now, raw.slice(0, MAX_RECORD_CHARS));
    if (this.store.getAllKeys) {
      const old = (await this.store.getAllKeys()).filter(k => k.startsWith(QUARANTINE_PREFIX)).sort().slice(0, -3);
      if (old.length) await this.store.multiRemove(old);
    }
  }

  load(): Promise<LoadResult> {
    this.writable = false;
    return this.enqueue(async () => {
      let primary: string | null, backup: string | null, v2: string | null, v1: string | null;
      try {
        primary = await this.store.getItem(STATE_KEY);
        backup = await this.store.getItem(BACKUP_KEY);
        v2 = primary === null ? await this.store.getItem(PROFILE_KEY) : null;
        v1 = primary === null && v2 === null ? await this.store.getItem(LEGACY_KEY) : null;
      } catch {
        throw new StorageUnavailableError();
      }
      const now = this.clock();
      let quarantined = 0;
      const fromPrimary = decodeEnvelope(primary);
      if (fromPrimary) {this.lastGood = primary; this.writable = true; return {state: fromPrimary, outcome: 'loaded', quarantined};}
      const fromBackup = decodeEnvelope(backup);
      if (primary !== null) {await this.quarantine(primary, now); quarantined++;}
      if (fromBackup) {
        await this.writePair(encodeEnvelope(fromBackup, now), backup);
        this.writable = true;
        return {state: fromBackup, outcome: 'recovered-backup', quarantined};
      }
      if (primary !== null) {
        if (backup !== null) {await this.quarantine(backup, now + 1); quarantined++;}
        const fresh = emptyState();
        await this.writePair(encodeEnvelope(fresh, now), null);
        this.writable = true;
        return {state: fresh, outcome: 'reset-corrupt', quarantined};
      }
      const legacyRaw = v2 ?? v1;
      if (legacyRaw !== null) {
        let legacy: unknown = undefined;
        try {legacy = JSON.parse(legacyRaw);} catch {}
        const valid = !!legacy && typeof legacy === 'object' && !Array.isArray(legacy);
        if (!valid) {await this.quarantine(legacyRaw, now); quarantined++;}
        const migrated = valid ? migrateLegacy(legacy, now) : emptyState();
        await this.writePair(encodeEnvelope(migrated, now), null);
        await this.store.multiRemove([PROFILE_KEY, LEGACY_KEY]); // only after the v3 write is confirmed
        this.writable = true;
        return {state: migrated, outcome: valid ? 'migrated' : 'reset-corrupt', quarantined};
      }
      this.writable = true;
      return {state: emptyState(), outcome: 'fresh', quarantined};
    });
  }

  /** Resolves only once the write is committed. The previous good record becomes the backup. */
  save(state: LearningState): Promise<void> {
    if (!this.writable) return Promise.reject(new ReadOnlyError());
    const raw = encodeEnvelope(state, this.clock());
    return this.enqueue(async () => {
      if (!this.writable) throw new ReadOnlyError();
      await this.writePair(raw, this.lastGood);
    });
  }

  clear(): Promise<void> {
    this.writable = false;
    return this.enqueue(async () => {
      const keys = [STATE_KEY, BACKUP_KEY, PROFILE_KEY, LEGACY_KEY, 'genz-code-avatar-photo'];
      if (this.store.getAllKeys) keys.push(...(await this.store.getAllKeys()).filter(k => k.startsWith(QUARANTINE_PREFIX)));
      await this.store.multiRemove(keys);
      this.lastGood = null;
      this.writable = true;
    });
  }
  get canWrite() {return this.writable;}
}

/** @deprecated name kept for older imports. */
export const ProfileStore = LearningStore;
