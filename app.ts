/** Single Firebase app shared by Authentication and Firestore Lite (REST, no realtime cache). */
import {getApps, initializeApp} from 'firebase/app';
import {getAuth, initializeAuth, connectAuthEmulator} from 'firebase/auth';
import {getFirestore, connectFirestoreEmulator, Firestore} from 'firebase/firestore/lite';
import {persistence} from '../auth/persistence';
import {FIREBASE_CONFIG, EMULATOR_HOST} from '../secure/config';

const existing = getApps().find(app => app.name === 'GenZCodeAccount');
export const firebaseApp = existing ?? initializeApp(FIREBASE_CONFIG, 'GenZCodeAccount');
export const accountAuth = existing ? getAuth(firebaseApp) : initializeAuth(firebaseApp, {persistence});
accountAuth.languageCode = 'en';

let db: Firestore | null = null;
export function cloudDb(): Firestore {
  if (!db) {
    db = getFirestore(firebaseApp);
    if (EMULATOR_HOST) connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  }
  return db;
}
if (EMULATOR_HOST && !existing) connectAuthEmulator(accountAuth, `http://${EMULATOR_HOST}:9099`, {disableWarnings: true});
