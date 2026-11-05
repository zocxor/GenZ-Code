/**
 * Security event recording (Secure Engine / Threat Shield).
 *
 * Data minimisation: events hold a type, a short non-personal detail code, a timestamp,
 * app version and platform. Never e-mail addresses, passwords, tokens, IP addresses,
 * device identifiers, locations or message text.
 * - Every event is kept in a small on-device log (last 50) shown in Threat Shield.
 * - Selected events are reported to the backend only while signed in; the server enforces
 *   ownership, an allow-listed type, a 90-day expiry and a rate limit.
 */
import {redact} from './logger';

export type SecurityEventType =
  | 'login_failed' | 'login_throttled' | 'login_succeeded_after_failures' | 'session_expired' | 'reauth_failed'
  | 'sync_permission_denied' | 'sync_blocked_account_status' | 'storage_quarantine' | 'content_validation_rejected'
  | 'account_deleted' | 'account_deletion_started' | 'admin_access_denied';
export const REPORTED_EVENTS: SecurityEventType[] = ['login_succeeded_after_failures', 'session_expired', 'reauth_failed', 'sync_permission_denied', 'sync_blocked_account_status', 'content_validation_rejected', 'account_deletion_started'];
export type SecurityEvent = {type: SecurityEventType; detail: string; at: number};
export type EventStore = {getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void>; removeItem?: (k: string) => Promise<void>};
export type EventReporter = (event: SecurityEvent) => Promise<void>;
export const EVENT_KEY = 'genz-code-security-log';
const MAX_LOCAL = 50;

export const sanitizeDetail = (detail?: string) => redact(String(detail ?? '')).replace(/[^\w .:/-]/g, '').slice(0, 80);

export class SecurityEventLog {
  private events: SecurityEvent[] = [];
  private loaded = false;
  private listeners = new Set<() => void>();
  private lastReport = 0;
  private reporter: EventReporter | null = null;
  constructor(private store: EventStore, private now: () => number = Date.now) {}
  subscribe = (fn: () => void) => {this.listeners.add(fn); return () => {this.listeners.delete(fn);};};
  list = () => this.events;
  setReporter(reporter: EventReporter | null) {this.reporter = reporter;}

  async load() {
    try {
      const raw = await this.store.getItem(EVENT_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      this.events = Array.isArray(parsed) ? parsed.filter((e): e is SecurityEvent => !!e && typeof e === 'object' && typeof e.type === 'string' && typeof e.at === 'number' && typeof e.detail === 'string').slice(0, MAX_LOCAL) : [];
    } catch {this.events = [];}
    this.loaded = true;
  }
  async record(type: SecurityEventType, detail?: string) {
    const event: SecurityEvent = {type, detail: sanitizeDetail(detail), at: this.now()};
    this.events = [event, ...this.events].slice(0, MAX_LOCAL);
    for (const fn of [...this.listeners]) fn();
    try {if (this.loaded) await this.store.setItem(EVENT_KEY, JSON.stringify(this.events));} catch {}
    if (this.reporter && REPORTED_EVENTS.includes(type) && event.at - this.lastReport >= 10_000) {
      this.lastReport = event.at;
      try {await this.reporter(event);} catch {/* best effort; never blocks the user */}
    }
  }
  /** Count of a type within a window (used for repeated-failure detection). */
  count(type: SecurityEventType, sinceMs: number) {const from = this.now() - sinceMs; return this.events.filter(e => e.type === type && e.at >= from).length;}
  async clear() {this.events = []; for (const fn of [...this.listeners]) fn(); try {await this.store.setItem(EVENT_KEY, '[]');} catch {}}
}
