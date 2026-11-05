/**
 * App service container. Local services start immediately; Firebase-backed services are
 * started after the first render so cloud code never delays opening the app.
 */
import {useSyncExternalStore} from 'react';
import {AppState, Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {LearningStore} from './storage';
import {LearningRepository} from './repository';
import {SecurityEventLog} from './secure/events';
import {LoginGuard} from './shield/loginGuard';
import type {SyncEngine, SyncStatus} from './sync/engine';
import type {User} from 'firebase/auth';
import {APP_VERSION} from './secure/config';
import {loadContentOverlay, refreshContent} from './contentSync';
import {loadPhoto} from './avatarPhoto';

export const repository = new LearningRepository(new LearningStore(AsyncStorage));
export const securityLog = new SecurityEventLog(AsyncStorage);
export const loginGuard = new LoginGuard(AsyncStorage);

type CloudServices = {engine: SyncEngine; getUser: () => User | null; onUser: (fn: () => void) => () => void};
let cloud: CloudServices | null = null;
let cloudStarting: Promise<CloudServices> | null = null;
const cloudListeners = new Set<() => void>();

/** Lazily start Firebase Auth + sync. Safe to call many times. */
export function startCloud(): Promise<CloudServices> {
  if (cloud) return Promise.resolve(cloud);
  if (!cloudStarting) cloudStarting = (async () => {
    const [{SyncEngine}, {firestoreCloud}, {startSession}] = await Promise.all([import('./sync/engine'), import('./sync/firestoreCloud'), import('./secure/session')]);
    const engine = new SyncEngine(repository, firestoreCloud, {appVersion: APP_VERSION, platform: Platform.OS, onSecurityEvent: (t, d) => void securityLog.record(t, d)});
    const session = startSession(engine, securityLog);
    cloud = {engine, getUser: session.getUser, onUser: session.onUser};
    engine.subscribe(() => cloudListeners.forEach(f => f()));
    session.onUser(() => cloudListeners.forEach(f => f()));
    cloudListeners.forEach(f => f());
    AppState.addEventListener('change', s => {if (s === 'active') {engine.requestSync(); void refreshContent(securityLog);}});
    return cloud;
  })();
  return cloudStarting;
}
export const getCloud = () => cloud;

/** Boot sequence: local data first, then content overlay cache, then cloud in the background. */
export async function bootServices() {
  await Promise.all([repository.load(), securityLog.load(), loginGuard.load(), loadPhoto()]);
  await loadContentOverlay();
  setTimeout(() => {void startCloud().then(() => refreshContent(securityLog)).catch(() => {});}, 0);
}

// ---------- React bindings ----------
export const useLearningState = () => useSyncExternalStore(repository.subscribe, repository.getState);
export const useStorageHealth = () => useSyncExternalStore(repository.subscribe, repository.getHealth);
export const useSecurityEvents = () => useSyncExternalStore(securityLog.subscribe, securityLog.list);
const subscribeCloud = (fn: () => void) => {cloudListeners.add(fn); return () => {cloudListeners.delete(fn);};};
const signedOut: SyncStatus = {phase: 'signed-out', uid: null, account: null, lastError: null, nextRetryAt: 0, lastSyncAt: 0, pending: false};
export const useSyncStatus = () => useSyncExternalStore(subscribeCloud, () => cloud?.engine.getStatus() ?? signedOut);
export const useAccountUser = () => useSyncExternalStore(subscribeCloud, () => cloud?.getUser() ?? null);
