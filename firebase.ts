/**
 * Admin portal Firebase client. Public client configuration only; no service-account keys.
 * Sessions are per-tab (browserSessionPersistence) and end after 30 minutes of inactivity.
 */
import {initializeApp} from 'firebase/app';
import {initializeAuth, browserSessionPersistence, connectAuthEmulator, signOut} from 'firebase/auth';
import {getFirestore, connectFirestoreEmulator, doc, collection, writeBatch, serverTimestamp, Timestamp, WriteBatch} from 'firebase/firestore/lite';
import config from '../../src/auth/firebaseConfig.json';
import type {Role} from './rbac';

export const app = initializeApp({apiKey: config.apiKey, projectId: config.projectId, authDomain: `${config.projectId}.firebaseapp.com`}, 'GenZCodeAdmin');
export const auth = initializeAuth(app, {persistence: browserSessionPersistence});
export const db = getFirestore(app);
const emulator = (import.meta as {env?: Record<string, string | undefined>}).env?.VITE_FIREBASE_EMULATOR_HOST;
if (emulator && /^(localhost|127\.0\.0\.1)$/.test(emulator)) {
  connectAuthEmulator(auth, `http://${emulator}:9099`, {disableWarnings: true});
  connectFirestoreEmulator(db, emulator, 8080);
}

export type AuditAction = 'admin.login' | 'admin.role.set' | 'user.suspend' | 'user.reactivate' | 'user.delete' | 'user.note' | 'content.create' | 'content.update' | 'content.submit_review' | 'content.publish' | 'content.archive' | 'content.rollback' | 'content.import' | 'submission.accept' | 'submission.reject' | 'report.resolve' | 'report.dismiss' | 'feedback.triage' | 'config.update';

/** Adds an audit entry to a batch and returns its id (to be stored as lastAuditId). */
export function addAudit(batch: WriteBatch, actor: string, role: Role, action: AuditAction, target: string, summary = ''): string {
  const ref = doc(collection(db, 'auditLogs'));
  batch.set(ref, {actor, role, action, target, summary: summary.slice(0, 300), at: serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + 365 * 86400_000)});
  return ref.id;
}
export const newBatch = () => writeBatch(db);

// ---------- inactivity timeout ----------
const IDLE_MS = 30 * 60_000;
let idleTimer: number | undefined;
export function armIdleTimeout(onTimeout: () => void) {
  const reset = () => {window.clearTimeout(idleTimer); idleTimer = window.setTimeout(() => {void signOut(auth).finally(onTimeout);}, IDLE_MS);};
  for (const ev of ['pointerdown', 'keydown', 'visibilitychange']) window.addEventListener(ev, reset, {passive: true});
  reset();
  return () => {window.clearTimeout(idleTimer); for (const ev of ['pointerdown', 'keydown', 'visibilitychange']) window.removeEventListener(ev, reset);};
}

/** Firestore errors are mapped to safe, generic messages (no raw server text in the UI). */
export function errorMessage(e: unknown): string {
  const code = e && typeof e === 'object' && 'code' in e ? String((e as {code: unknown}).code) : '';
  if (code === 'permission-denied') return 'The server refused this action for your role (or a rule check failed).';
  if (code === 'unavailable') return 'Network unavailable. Check your connection and retry.';
  if (code === 'failed-precondition') return 'A required Firestore index or precondition is missing. See docs/ADMIN_PORTAL.md.';
  if (code === 'not-found') return 'That record no longer exists.';
  if (code.startsWith('auth/')) return 'Authentication error. Sign in again.';
  return 'Something went wrong. Please retry.';
}
