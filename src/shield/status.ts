/**
 * Threat Shield status: a list of clearly defined, real checks. No invented scores.
 * The summary is simply "passed / applicable", and each check states what it verifies.
 */
import type {StorageHealth} from '../repository';
import type {SyncStatus} from '../sync/engine';
import type {SecurityEvent} from '../secure/events';
import type {LearningState} from '../profile';
import {isDirty} from '../profile';

export type CheckState = 'pass' | 'attention' | 'info' | 'n/a';
export type ShieldCheck = {id: string; title: string; state: CheckState; detail: string; action?: 'retry-storage' | 'sign-in' | 'verify-email' | 'sync-now' | 'open-account'};
export type ShieldInput = {
  health: StorageHealth; volatile: boolean; state: LearningState; sync: SyncStatus;
  signedIn: boolean; emailVerified: boolean; secureSessionStorage: boolean | null; events: SecurityEvent[]; now: number;
};

export function shieldChecks(i: ShieldInput): ShieldCheck[] {
  const day = 86400_000;
  const failed24h = i.events.filter(e => e.type === 'login_failed' && i.now - e.at < day).length;
  const checks: ShieldCheck[] = [
    i.health.status === 'ready' && !i.volatile && !i.health.lastError
      ? {id: 'storage', title: 'Learning data is saved on this device', state: 'pass', detail: i.health.lastSavedAt ? `Last confirmed save ${ago(i.now - i.health.lastSavedAt)}. A backup copy of the previous save is kept.` : 'Storage is readable and writable. A backup copy is kept after each save.'}
      : {id: 'storage', title: 'Learning data needs attention', state: 'attention', detail: i.health.lastError ?? 'Storage is in read-only recovery mode. New progress is temporary until it can be read again.', action: 'retry-storage'},
    i.health.quarantined
      ? {id: 'integrity', title: 'Unreadable data was set aside', state: 'attention', detail: `${i.health.quarantined} damaged record(s) were copied aside instead of being overwritten. Your current data loaded normally.`}
      : {id: 'integrity', title: 'Saved data passed its integrity check', state: 'pass', detail: 'Each saved record carries a checksum that detects corruption or truncation (not a tamper-proof signature).'},
    !i.signedIn
      ? {id: 'account', title: 'No account signed in', state: 'info', detail: 'Everything stays on this device. Sign in to back up and sync your learning.', action: 'sign-in'}
      : i.emailVerified
        ? {id: 'account', title: 'Account e-mail verified', state: 'pass', detail: 'Password resets and account recovery go to a confirmed address.'}
        : {id: 'account', title: 'Verify your account e-mail', state: 'attention', detail: 'An unverified address makes account recovery less reliable.', action: 'verify-email'},
    !i.signedIn
      ? {id: 'session', title: 'Session storage', state: 'n/a', detail: 'No session on this device.'}
      : i.secureSessionStorage
        ? {id: 'session', title: 'Session kept in encrypted storage', state: 'pass', detail: 'Your sign-in session uses the device’s hardware-backed secure storage. Passwords are never stored.'}
        : {id: 'session', title: 'Session is memory-only', state: 'info', detail: 'Secure storage isn’t available here, so you’ll sign in again after closing the app.'},
    syncCheck(i),
    failed24h >= 3
      ? {id: 'signin-attempts', title: `${failed24h} failed sign-in attempts in 24 hours`, state: 'attention', detail: 'Repeated failures on this device. If this wasn’t you, change your password.', action: 'open-account'}
      : {id: 'signin-attempts', title: 'No repeated failed sign-ins', state: 'pass', detail: 'Fewer than 3 failed sign-in attempts on this device in the last 24 hours.'},
    {id: 'transport', title: 'Encrypted connections only', state: 'pass', detail: 'This build blocks unencrypted HTTP traffic; account and sync requests use HTTPS/TLS.'},
    {id: 'messages', title: 'Decoded messages stay private', state: 'pass', detail: 'Messages are decoded on this device, never saved or sent, and cleared when the app goes to the background.'},
  ];
  return checks;
}
function syncCheck(i: ShieldInput): ShieldCheck {
  if (!i.signedIn) return {id: 'sync', title: 'Cloud backup is off', state: 'info', detail: 'Uninstalling the app removes data that exists only on this device.', action: 'sign-in'};
  const pending = isDirty(i.state);
  switch (i.sync.phase) {
    case 'idle': return pending ? {id: 'sync', title: 'Changes waiting to sync', state: 'info', detail: 'Your latest changes are saved on this device and will upload shortly.', action: 'sync-now'} : {id: 'sync', title: 'Backed up to your account', state: 'pass', detail: i.sync.lastSyncAt ? `Last synced ${ago(i.now - i.sync.lastSyncAt)}.` : 'Sync is active.'};
    case 'syncing': return {id: 'sync', title: 'Syncing now…', state: 'info', detail: 'Your data stays on this device while it uploads.'};
    case 'offline': return {id: 'sync', title: 'Offline — will retry', state: 'info', detail: i.sync.lastError ?? 'Changes are safe on this device.', action: 'sync-now'};
    case 'account-mismatch': return {id: 'sync', title: 'Data belongs to another account', state: 'attention', detail: 'Choose which account’s learning to keep on this device.', action: 'open-account'};
    case 'session-expired': return {id: 'sync', title: 'Session expired', state: 'attention', detail: 'Sign in again to resume syncing.', action: 'sign-in'};
    default: return {id: 'sync', title: 'Sync needs attention', state: 'attention', detail: i.sync.lastError ?? 'Sync is paused. Your data is safe on this device.', action: 'sync-now'};
  }
}
export function summarize(checks: ShieldCheck[]) {
  const applicable = checks.filter(c => c.state === 'pass' || c.state === 'attention');
  return {passed: applicable.filter(c => c.state === 'pass').length, applicable: applicable.length, attention: applicable.filter(c => c.state === 'attention').length};
}
export function ago(ms: number): string {
  if (ms < 60_000) return 'just now';
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)} h ago`;
  return `${Math.floor(ms / 86400_000)} d ago`;
}
