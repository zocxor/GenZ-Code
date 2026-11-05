/**
 * Session management (Secure Engine).
 *
 * - Firebase Auth owns tokens: short-lived ID tokens refreshed by the SDK, refresh token in
 *   SecureStore on native (memory-only on web). The app never handles raw tokens.
 * - On foreground the token is re-validated. Revoked, disabled or expired sessions are
 *   signed out locally and recorded; learning data on the device is not touched.
 * - Signing out clears the persisted session from secure storage (Firebase SDK).
 */
import {AppState} from 'react-native';
import {onAuthStateChanged, signOut, User} from 'firebase/auth';
import {accountAuth} from '../firebase/app';
import type {SyncEngine} from '../sync/engine';
import type {SecurityEventLog, SecurityEvent} from './events';
import {doc, collection, writeBatch, serverTimestamp, Timestamp} from 'firebase/firestore/lite';
import {Platform} from 'react-native';
import {cloudDb} from '../firebase/app';
import {APP_VERSION} from './config';

const EXPIRED = new Set(['auth/user-token-expired', 'auth/user-disabled', 'auth/invalid-user-token', 'auth/user-not-found']);

export function startSession(engine: SyncEngine, log: SecurityEventLog) {
  let user: User | null = accountAuth.currentUser;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(f => f());
  const expire = async (code: string) => {
    void log.record('session_expired', code);
    engine.sessionExpired();
    try {await signOut(accountAuth);} catch {}
  };
  // Report allow-listed events while signed in: event + rate-limit stamp in one batch (rules check both).
  log.setReporter(async (e: SecurityEvent) => {
    const current = accountAuth.currentUser;
    if (!current) return;
    const db = cloudDb(), batch = writeBatch(db);
    batch.set(doc(db, 'users', current.uid, 'limits', 'sec'), {last: serverTimestamp()});
    batch.set(doc(collection(db, 'securityEvents')), {uid: current.uid, type: e.type, detail: e.detail, platform: Platform.OS, appVersion: APP_VERSION, at: serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + 90 * 86400_000)});
    await batch.commit();
  });
  onAuthStateChanged(accountAuth, u => {
    user = u;
    engine.setUser(u?.uid ?? null);
    emit();
  }, () => {/* restoration errors leave the user signed out; offline learning continues */});
  AppState.addEventListener('change', async state => {
    if (state !== 'active' || !accountAuth.currentUser) return;
    try {await accountAuth.currentUser.getIdToken();}
    catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? String((e as {code: unknown}).code) : '';
      if (EXPIRED.has(code)) await expire(code);
    }
  });
  return {
    getUser: () => user,
    onUser: (fn: () => void) => {listeners.add(fn); return () => {listeners.delete(fn);};},
  };
}
