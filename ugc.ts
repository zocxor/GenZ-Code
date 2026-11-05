/**
 * User submissions: word suggestions, content reports and app feedback.
 * Requires a signed-in, active account. Each write is batched with a rate-limit stamp
 * (users/{uid}/limits/ugc); Firestore rules reject writes less than 60 s apart, unknown
 * fields, oversize text, and spoofed owner IDs. Submissions are unpublished by default.
 */
import {cleanText, validateEntry, CONTENT_CATEGORIES} from '../shared/contentSchema';
import {APP_VERSION} from './secure/config';
import {Platform} from 'react-native';

export const REPORT_REASONS = ['Wrong meaning', 'Offensive or harmful', 'Outdated', 'Spelling or formatting', 'Other'] as const;
export type UgcResult = {ok: true} | {ok: false; message: string};

async function submit(collectionName: 'submissions' | 'reports' | 'feedback', body: Record<string, unknown>): Promise<UgcResult> {
  const [{doc, collection, writeBatch, serverTimestamp, FirestoreError}, {cloudDb, accountAuth}] = await Promise.all([import('firebase/firestore/lite'), import('./firebase/app')]);
  const user = accountAuth.currentUser;
  if (!user) return {ok: false, message: 'Sign in to send this. It helps us prevent spam.'};
  const db = cloudDb();
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', user.uid, 'limits', 'ugc'), {last: serverTimestamp()});
  batch.set(doc(collection(db, collectionName)), {...body, uid: user.uid, status: collectionName === 'feedback' ? 'new' : collectionName === 'reports' ? 'open' : 'pending', createdAt: serverTimestamp()});
  try {await batch.commit(); return {ok: true};}
  catch (e) {
    const code = e instanceof FirestoreError ? e.code : '';
    if (code === 'permission-denied') return {ok: false, message: 'Please wait a minute between submissions. If this keeps happening, your account may be restricted.'};
    if (code === 'unavailable') return {ok: false, message: 'You’re offline. Try again when you’re connected.'};
    return {ok: false, message: 'Couldn’t send that right now. Please try again.'};
  }
}

export function suggestWord(input: {term: string; meaning: string; example: string; category: string}): Promise<UgcResult> {
  const v = validateEntry({...input, language: 'English'});
  if (!v.ok) return Promise.resolve({ok: false, message: v.errors[0]!});
  if (!(CONTENT_CATEGORIES as readonly string[]).includes(input.category)) return Promise.resolve({ok: false, message: 'Choose a category.'});
  return submit('submissions', {term: v.entry.term, meaning: v.entry.meaning, example: v.entry.example, category: v.entry.category});
}
export function reportEntry(termId: string, reason: string, note: string): Promise<UgcResult> {
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) return Promise.resolve({ok: false, message: 'Choose a reason.'});
  return submit('reports', {termId, reason, note: cleanText(note, 300)});
}
export function sendFeedback(rating: number, message: string): Promise<UgcResult> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return Promise.resolve({ok: false, message: 'Choose a rating from 1 to 5.'});
  return submit('feedback', {rating, message: cleanText(message, 1000), appVersion: APP_VERSION, platform: Platform.OS});
}
