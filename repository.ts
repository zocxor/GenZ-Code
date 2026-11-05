/**
 * LearningRepository — the single writer for persistent learning data.
 *
 * mutate(action): computes the next state from the latest *committed* state, validates it,
 * writes it to durable storage, and only then publishes it to subscribers (the UI).
 * If the write fails, the committed state is unchanged and the error is returned to the
 * caller, so the UI never shows progress that was not saved.
 */
import {LearningState, emptyState} from './profile';
import {Action} from './learning';
import {LearningStore, LoadOutcome, StorageUnavailableError} from './storage';
import {logger} from './secure/logger';

export type StorageHealth = {
  status: 'loading' | 'ready' | 'read-only' | 'error';
  outcome: LoadOutcome | null;
  quarantined: number;
  lastSavedAt: number;
  lastError: string | null;
  pending: number;
};
type Listener = () => void;

export class LearningRepository {
  private state: LearningState = emptyState();
  private health: StorageHealth = {status: 'loading', outcome: null, quarantined: 0, lastSavedAt: 0, lastError: null, pending: 0};
  private listeners = new Set<Listener>();
  private queue: Promise<unknown> = Promise.resolve();
  /** Changes made while storage is read-only. Kept in memory and never written over unread data. */
  private volatile = false;

  constructor(private store: LearningStore, private now: () => number = Date.now) {}

  getState = () => this.state;
  getHealth = () => this.health;
  get isVolatile() {return this.volatile;}
  subscribe = (fn: Listener) => {this.listeners.add(fn); return () => {this.listeners.delete(fn);};};
  private emit() {for (const fn of [...this.listeners]) fn();}
  private setHealth(patch: Partial<StorageHealth>) {this.health = {...this.health, ...patch}; this.emit();}

  async load(): Promise<StorageHealth> {
    this.setHealth({status: 'loading', lastError: null});
    try {
      const {state, outcome, quarantined} = await this.store.load();
      this.state = state;
      this.volatile = false;
      this.setHealth({status: 'ready', outcome, quarantined, lastError: null});
      if (quarantined) logger.warn('storage', 'Unreadable learning data was quarantined', {outcome, quarantined});
    } catch (e) {
      this.setHealth({status: e instanceof StorageUnavailableError ? 'read-only' : 'error', lastError: 'Saved data could not be read. Nothing has been overwritten.'});
    }
    return this.health;
  }

  /** Stamp generator: hybrid logical clock so local stamps never go backwards. */
  private stamp() {return Math.max(this.now(), this.state.sync.clock + 1);}

  mutate(action: Action): Promise<LearningState> {
    const run = this.queue.catch(() => {}).then(async () => {
      const at = this.stamp();
      const next = action(this.state, at);
      if (next === this.state) return this.state;
      if (this.health.status !== 'ready') {
        // Read-only recovery mode: keep the change in memory only and say so in the UI.
        this.volatile = true;
        this.state = next;
        this.emit();
        return next;
      }
      this.setHealth({pending: this.health.pending + 1});
      try {
        await this.store.save(next);
        this.state = next;
        this.setHealth({pending: this.health.pending - 1, lastSavedAt: this.now(), lastError: null});
        return next;
      } catch (e) {
        this.setHealth({pending: this.health.pending - 1, lastError: 'Couldn’t save on this device. Check available storage and try again.'});
        logger.error('storage', 'Write failed', {name: e instanceof Error ? e.name : 'unknown'});
        throw e;
      }
    });
    this.queue = run;
    return run;
  }

  /** Delete every local learning record. Account sessions live in separate secure storage. */
  clear(): Promise<void> {
    const run = this.queue.catch(() => {}).then(async () => {
      await this.store.clear();
      const fresh = emptyState();
      this.state = {...fresh, device: {...fresh.device, onboarded: true}};
      await this.store.save(this.state);
      this.volatile = false;
      this.setHealth({status: 'ready', outcome: 'fresh', quarantined: 0, lastError: null});
    });
    this.queue = run;
    return run;
  }
}
