/**
 * Web account deletion (Google Play "delete account outside the app" requirement).
 * Same server-side steps as the app: tombstone + learning data in one batch, then the user's
 * own submissions, then the Firebase Authentication account. Rules enforce ownership.
 */
import {initializeApp} from 'firebase/app';
import {initializeAuth, inMemoryPersistence, signInWithEmailAndPassword, deleteUser, signOut} from 'firebase/auth';
import {getFirestore, doc, collection, writeBatch, serverTimestamp, getDocs, query, where} from 'firebase/firestore/lite';
import config from '../../src/auth/firebaseConfig.json';

const app = initializeApp({apiKey: config.apiKey, projectId: config.projectId}, 'GenZCodeDeletion');
const auth = initializeAuth(app, {persistence: inMemoryPersistence});
const db = getFirestore(app);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (kind: 'error' | 'ok', text: string) => {const m = $('msg'); m.className = `notice ${kind}`; m.textContent = text;};

$('form').addEventListener('submit', async e => {
  e.preventDefault();
  const button = $<HTMLButtonElement>('submit');
  if (!$<HTMLInputElement>('confirm').checked) return;
  button.disabled = true; show('ok', 'Deleting…');
  try {
    const {user} = await signInWithEmailAndPassword(auth, $<HTMLInputElement>('email').value.trim(), $<HTMLInputElement>('password').value);
    $<HTMLInputElement>('password').value = '';
    const uid = user.uid;
    const b = writeBatch(db);
    b.set(doc(db, 'users', uid), {status: 'deleted', deletedAt: serverTimestamp(), updatedAt: serverTimestamp()});
    for (const d of ['profile', 'saved', 'progress', 'scores']) b.delete(doc(db, 'users', uid, 'sync', d));
    for (const l of ['ugc', 'sec']) b.delete(doc(db, 'users', uid, 'limits', l));
    b.delete(doc(db, 'directory', uid));
    await b.commit();
    for (const c of ['submissions', 'reports', 'feedback']) {
      const snap = await getDocs(query(collection(db, c), where('uid', '==', uid)));
      for (let i = 0; i < snap.docs.length; i += 400) {const batch = writeBatch(db); snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref)); await batch.commit();}
    }
    await deleteUser(user);
    show('ok', 'Your account and its cloud data have been deleted. To remove learning data stored only on your phone, delete it in the app or uninstall GenZ Code.');
    ($('form').querySelectorAll('input,button') as NodeListOf<HTMLInputElement>).forEach(el => {el.disabled = true;});
  } catch (err) {
    const code = (err as {code?: string}).code ?? '';
    show('error', code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' ? 'The e-mail or password is incorrect.' : code === 'auth/too-many-requests' ? 'Too many attempts. Please wait and try again.' : 'Deletion could not be completed. Nothing further was changed; please try again or contact support.');
    await signOut(auth).catch(() => {});
    button.disabled = false;
  }
});
