/**
 * Threat Shield — sign-in attempt guard (client side).
 *
 * Adds a growing wait after repeated failed sign-ins on this device and records the
 * pattern as a security event. This slows guessing from this app; it is NOT the server
 * control. Firebase Authentication enforces its own server-side throttling
 * (auth/too-many-requests), and email-enumeration protection must be enabled by the owner.
 */
export type GuardState = {failures: number; lastFailureAt: number; lockedUntil: number};
export type GuardStore = {getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void>};
export const GUARD_KEY = 'genz-code-login-guard';
const FREE_ATTEMPTS = 3, BASE_DELAY = 30_000, MAX_DELAY = 15 * 60_000, QUIET_RESET = 60 * 60_000;

export function nextLock(state: GuardState, now: number): GuardState {
  const failures = now - state.lastFailureAt > QUIET_RESET ? 1 : state.failures + 1;
  const over = failures - FREE_ATTEMPTS;
  const lockedUntil = over > 0 ? now + Math.min(MAX_DELAY, BASE_DELAY * 2 ** (over - 1)) : 0;
  return {failures, lastFailureAt: now, lockedUntil};
}

export class LoginGuard {
  private state: GuardState = {failures: 0, lastFailureAt: 0, lockedUntil: 0};
  constructor(private store: GuardStore, private now: () => number = Date.now) {}
  async load() {
    try {
      const v = JSON.parse((await this.store.getItem(GUARD_KEY)) ?? 'null');
      if (v && typeof v.failures === 'number' && typeof v.lastFailureAt === 'number' && typeof v.lockedUntil === 'number') this.state = {failures: Math.max(0, Math.min(1000, v.failures)), lastFailureAt: v.lastFailureAt, lockedUntil: Math.min(v.lockedUntil, this.now() + MAX_DELAY)};
    } catch {}
  }
  private async persist() {try {await this.store.setItem(GUARD_KEY, JSON.stringify(this.state));} catch {}}
  /** Milliseconds the user must wait before the next attempt (0 = allowed). */
  waitMs() {return Math.max(0, this.state.lockedUntil - this.now());}
  get failures() {return this.state.failures;}
  async failed(): Promise<number> {this.state = nextLock(this.state, this.now()); await this.persist(); return this.waitMs();}
  /** Returns the number of failures that preceded this success. */
  async succeeded(): Promise<number> {const prior = this.state.failures; this.state = {failures: 0, lastFailureAt: 0, lockedUntil: 0}; await this.persist(); return prior;}
}
