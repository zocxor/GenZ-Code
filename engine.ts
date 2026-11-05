/**
 * Offline-first cloud sync.
 *
 * Local storage is always the source the UI reads. When signed in, each domain is pushed
 * and pulled through a server transaction: read remote → merge (see merge.ts) → write only
 * if changed. A domain is marked clean only after the server confirms the write *and* no
 * newer local change arrived meanwhile. Failures leave data dirty and schedule a retry.
 * Local data is never deleted because the cloud is unreachable.
 */
import {LearningState, Domain, DOMAINS, isDirty, emptyState, streak, totalXP, view, localDayOf} from '../profile';
import {LearningRepository} from '../repository';
import {mergeDomain, fromState, intoState, maxStamp, DomainDoc} from './merge';
import {logger} from '../secure/logger';
import type {SecurityEventType} from '../secure/events';

export type AccountStatus = 'active' | 'suspended' | 'deleted';
export type AccountStats = {saved: number; quizzes: number; levels: number; reviewed: number; streak: number; xp: number};
export interface CloudAdapter {
  ensureAccount(uid: string, info: {appVersion: string; platform: string}): Promise<AccountStatus>;
  transact<D extends Domain>(uid: string, domain: D, merge: (remote: DomainDoc[D]) => DomainDoc[D]): Promise<DomainDoc[D]>;
  reportActivity(uid: string, activity: {day: string; stats: AccountStats; appVersion: string; platform: string}): Promise<void>;
  deleteCloudData(uid: string): Promise<void>;
}
export class CloudError extends Error {
  constructor(public code: 'offline' | 'permission-denied' | 'unauthenticated' | 'rate-limited' | 'too-large' | 'unknown', message?: string) {super(message ?? code); this.name = 'CloudError';}
}
export type SyncPhase = 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error' | 'blocked' | 'account-mismatch' | 'session-expired';
export type SyncStatus = {phase: SyncPhase; uid: string | null; account: AccountStatus | null; lastError: string | null; nextRetryAt: number; lastSyncAt: number; pending: boolean};
type Timer = {set: (fn: () => void, ms: number) => unknown; clear: (h: unknown) => void};
type Options = {appVersion: string; platform: string; now?: () => number; timer?: Timer; onSecurityEvent?: (type: SecurityEventType, detail?: string) => void; debounceMs?: number};

const BACKOFF = [5_000, 15_000, 60_000, 300_000, 900_000];
const messages: Record<CloudError['code'], string> = {
  offline: 'You’re offline. Changes are saved on this device and will sync when you reconnect.',
  'permission-denied': 'The server refused this sync. Your account may be restricted.',
  unauthenticated: 'Your session expired. Sign in again to resume syncing.',
  'rate-limited': 'Syncing is paused briefly to protect the service. It will retry automatically.',
  'too-large': 'Your learning data is too large for one cloud record. It remains saved on this device.',
  unknown: 'Sync didn’t complete. Your changes are safe on this device and will retry.',
};

export class SyncEngine {
  private uid: string | null = null;
  private status: SyncStatus = {phase: 'signed-out', uid: null, account: null, lastError: null, nextRetryAt: 0, lastSyncAt: 0, pending: false};
  private listeners = new Set<() => void>();
  private running: Promise<SyncStatus> | null = null;
  private again = false;
  private failures = 0;
  private deniedCount = 0;
  private timerHandle: unknown = null;
  private lastActivityReport = '';
  private lastReportAt = 0;
  private now: () => number;
  private timer: Timer;
  private unsubscribeRepo: () => void;

  constructor(private repo: LearningRepository, private cloud: CloudAdapter, private opts: Options) {
    this.now = opts.now ?? Date.now;
    this.timer = opts.timer ?? {set: (fn, ms) => setTimeout(fn, ms), clear: h => clearTimeout(h as ReturnType<typeof setTimeout>)};
    this.status.lastSyncAt = repo.getState().sync.lastSyncAt;
    this.unsubscribeRepo = repo.subscribe(() => {
      const pending = isDirty(this.repo.getState());
      if (pending !== this.status.pending) this.set({pending});
      if (pending && this.uid && this.status.phase === 'idle') this.schedule(this.opts.debounceMs ?? 4_000);
    });
  }
  getStatus = () => this.status;
  subscribe = (fn: () => void) => {this.listeners.add(fn); return () => {this.listeners.delete(fn);};};
  private set(patch: Partial<SyncStatus>) {this.status = {...this.status, ...patch}; for (const fn of [...this.listeners]) fn();}
  dispose() {this.unsubscribeRepo(); if (this.timerHandle) this.timer.clear(this.timerHandle);}

  private schedule(ms: number) {
    if (this.timerHandle) this.timer.clear(this.timerHandle);
    this.timerHandle = this.timer.set(() => {this.timerHandle = null; void this.syncNow();}, ms);
  }

  /** Called whenever Firebase reports the signed-in user (or null). */
  setUser(uid: string | null) {
    if (uid === this.uid) return;
    this.uid = uid;
    this.failures = 0;
    if (this.timerHandle) {this.timer.clear(this.timerHandle); this.timerHandle = null;}
    if (!uid) {this.set({phase: 'signed-out', uid: null, account: null, lastError: null, nextRetryAt: 0}); return;}
    this.set({phase: 'idle', uid, account: null, lastError: null});
    void this.syncNow();
  }
  /** Foreground / manual trigger. Throttled unless forced. */
  requestSync(force = false) {
    if (!this.uid) return;
    if (!force && this.now() - this.status.lastSyncAt < 60_000 && !isDirty(this.repo.getState())) return;
    void this.syncNow();
  }
  /** The session's tokens were rejected; stop syncing until the user signs in again. */
  sessionExpired() {
    this.opts.onSecurityEvent?.('session_expired');
    this.set({phase: 'session-expired', lastError: messages.unauthenticated});
  }

  syncNow(): Promise<SyncStatus> {
    if (this.running) {this.again = true; return this.running;}
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) {this.again = false; this.schedule(this.opts.debounceMs ?? 4_000);}
    });
    return this.running;
  }

  private async run(): Promise<SyncStatus> {
    const uid = this.uid;
    if (!uid) return this.status;
    if (this.status.phase === 'account-mismatch' || this.status.phase === 'session-expired') return this.status;
    const linked = this.repo.getState().sync.linkedUid;
    if (linked && linked !== uid) {
      this.set({phase: 'account-mismatch', lastError: 'This device holds learning data from a different account.'});
      return this.status;
    }
    this.set({phase: 'syncing', lastError: null});
    try {
      if (!linked) {
        // First sign-in on this device: attach the guest learning data to this account and push all of it.
        await this.repo.mutate(s => ({...s, sync: {...s.sync, linkedUid: uid, rev: Object.fromEntries(DOMAINS.map(d => [d, s.sync.rev[d] + 1])) as LearningState['sync']['rev']}}));
      }
      const account = await this.cloud.ensureAccount(uid, {appVersion: this.opts.appVersion, platform: this.opts.platform});
      if (account !== 'active') {
        this.opts.onSecurityEvent?.('sync_blocked_account_status', account);
        this.set({phase: 'blocked', account, lastError: account === 'suspended' ? 'This account is suspended. Learning continues on this device; syncing is paused.' : 'This account is being deleted. Syncing is disabled.'});
        return this.status;
      }
      this.set({account});
      for (const domain of DOMAINS) await this.syncDomain(uid, domain);
      await this.report(uid);
      const at = this.now();
      await this.repo.mutate(s => ({...s, sync: {...s.sync, lastSyncAt: at, lastAttemptAt: at, lastError: null}}));
      this.failures = 0;
      this.deniedCount = 0;
      this.set({phase: 'idle', lastSyncAt: at, lastError: null, nextRetryAt: 0, pending: isDirty(this.repo.getState())});
      if (isDirty(this.repo.getState())) this.schedule(this.opts.debounceMs ?? 4_000);
    } catch (e) {
      this.fail(e);
    }
    return this.status;
  }

  private async syncDomain(uid: string, domain: Domain) {
    const before = this.repo.getState();
    const capturedRev = before.sync.rev[domain];
    const local = fromState(domain, before);
    const confirmed = await this.cloud.transact(uid, domain, remote => mergeDomain(domain, local, remote));
    if (this.uid !== uid) throw new CloudError('unauthenticated', 'User changed during sync');
    await this.repo.mutate(s => {
      // Re-merge with the *current* local state so changes made during the request are kept.
      const merged = mergeDomain(domain, fromState(domain, s), confirmed);
      const next = intoState(domain, s, merged);
      const pushed = {...s.sync.pushed, [domain]: Math.max(s.sync.pushed[domain], capturedRev)};
      return {...next, sync: {...s.sync, pushed, clock: Math.max(s.sync.clock, maxStamp(domain, confirmed))}};
    });
  }

  private async report(uid: string) {
    const s = this.repo.getState(), p = view(s), day = localDayOf(this.now());
    const stats: AccountStats = {saved: p.saved.length, quizzes: Object.keys(s.attempts).length, levels: Object.keys(p.best).filter(k => !k.startsWith('daily-') && !k.startsWith('shuffle-')).length, reviewed: Object.keys(p.progress).length, streak: streak(s.days, this.now()).current, xp: totalXP(p.best)};
    const key = day + JSON.stringify(stats);
    // Throttled (rules allow one update per 20 s) and best-effort: never blocks learning sync.
    if (key === this.lastActivityReport || this.now() - this.lastReportAt < 60_000) return;
    try {
      await this.cloud.reportActivity(uid, {day, stats, appVersion: this.opts.appVersion, platform: this.opts.platform});
      this.lastActivityReport = key;
      this.lastReportAt = this.now();
    } catch (e) {
      if (e instanceof CloudError && e.code === 'unauthenticated') throw e;
    }
  }

  private fail(e: unknown) {
    const code: CloudError['code'] = e instanceof CloudError ? e.code : 'unknown';
    logger.warn('sync', 'Sync failed', {code, attempt: this.failures + 1});
    if (code === 'unauthenticated') {this.sessionExpired(); return;}
    if (code === 'permission-denied') {
      this.opts.onSecurityEvent?.('sync_permission_denied');
      this.deniedCount++;
      // A rules denial can be a transient rate-limit hit; block only when it repeats.
      if (this.deniedCount >= 3) {this.set({phase: 'blocked', lastError: messages[code]}); return;}
    } else this.deniedCount = 0;
    const delay = code === 'rate-limited' || code === 'permission-denied' ? 60_000 : BACKOFF[Math.min(this.failures, BACKOFF.length - 1)]!;
    this.failures++;
    const at = this.now();
    this.set({phase: code === 'offline' ? 'offline' : 'error', lastError: messages[code], nextRetryAt: at + delay});
    void this.repo.mutate(s => ({...s, sync: {...s.sync, lastAttemptAt: at, lastError: messages[code]}})).catch(() => {});
    if (code !== 'too-large') this.schedule(delay);
  }

  /** Try a final push before sign-out. Resolves true when nothing is left unsynced. */
  async flush(timeoutMs = 8_000): Promise<boolean> {
    if (!this.uid || !isDirty(this.repo.getState())) return !isDirty(this.repo.getState());
    await Promise.race([this.syncNow(), new Promise(r => this.timer.set(() => r(null), timeoutMs))]);
    return !isDirty(this.repo.getState());
  }
  /**
   * Resolve an account mismatch by replacing this device's learning data with the signed-in
   * account's cloud copy. The other account's synced data is untouched in the cloud.
   */
  async adoptSignedInAccount() {
    const uid = this.uid;
    if (!uid) return;
    await this.repo.mutate(s => ({...emptyState(), device: s.device, recent: [], searches: [], sync: {...emptyState().sync, linkedUid: uid, clock: s.sync.clock}}));
    this.set({phase: 'idle', lastError: null});
    await this.syncNow();
  }
  /** After sign-out with "remove from this device". */
  async detachDevice(removeLocal: boolean) {
    if (removeLocal) await this.repo.clear();
  }
  /** Delete every cloud record for the signed-in user (called before deleting the auth account). */
  async deleteCloudData(): Promise<void> {
    if (!this.uid) throw new CloudError('unauthenticated');
    if (this.timerHandle) {this.timer.clear(this.timerHandle); this.timerHandle = null;}
    await this.cloud.deleteCloudData(this.uid);
    await this.repo.mutate(s => ({...s, sync: {...s.sync, linkedUid: null, pushed: {...s.sync.rev}, lastError: null}}));
    this.set({phase: 'blocked', account: 'deleted'});
  }
}
