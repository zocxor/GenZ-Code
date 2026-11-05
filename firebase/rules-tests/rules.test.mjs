// Firestore security-rules tests. Run against the OFFICIAL emulator (requires Java 21+):
//   npm run test:rules
// These tests were written alongside the rules but could not be executed in the build
// environment (the emulator binary could not be downloaded there). Run them before deploying.
import {test, before, after, beforeEach} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, writeBatch, serverTimestamp, Timestamp} from 'firebase/firestore';

let env;
const MFA = {firebase: {sign_in_provider: 'password', sign_in_second_factor: 'totp'}};
const NO_MFA = {firebase: {sign_in_provider: 'password'}};
const day = () => new Date().toISOString().slice(0, 10);
const stats = {saved: 0, quizzes: 0, levels: 0, reviewed: 0, streak: 0, xp: 0};
const account = () => ({status: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastActiveAt: serverTimestamp(), lastActiveDay: day(), appVersion: '0.8.0', platform: 'android', stats, schema: 1});
const user = (uid, email = `${uid}@example.com`) => env.authenticatedContext(uid, {email}).firestore();
const admin = (uid, mfa = true) => env.authenticatedContext(uid, {email: `${uid}@staff.test`, ...(mfa ? MFA : NO_MFA)}).firestore();
const seed = fn => env.withSecurityRulesDisabled(ctx => fn(ctx.firestore()));
const audit = (db, actor, role, action, target) => {
  const ref = doc(collection(db, 'auditLogs'));
  return {ref, data: {actor, role, action, target, summary: 'test', at: serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + 365 * 86400_000)}};
};

before(async () => {
  env = await initializeTestEnvironment({projectId: 'demo-genz-code', firestore: {rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')}});
});
after(async () => {await env.cleanup();});
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async db => {
    for (const [uid, role] of [['super1', 'super_admin'], ['super2', 'super_admin'], ['editor', 'content_manager'], ['mod', 'moderator'], ['support', 'support_admin'], ['analyst', 'analyst']])
      await setDoc(doc(db, 'admins', uid), {role, active: true, email: `${uid}@staff.test`, updatedAt: Timestamp.now(), updatedBy: 'seed', lastAuditId: 'seed'});
    await setDoc(doc(db, 'users', 'bob'), {...account(), createdAt: Timestamp.fromMillis(Date.now() - 60_000), updatedAt: Timestamp.fromMillis(Date.now() - 60_000), lastActiveAt: Timestamp.now()});
    await setDoc(doc(db, 'users', 'bob', 'sync', 'saved'), {items: {idk: {u: 1}}, v: 3, updatedAt: Timestamp.fromMillis(Date.now() - 60_000)});
    await setDoc(doc(db, 'directory', 'bob'), {email: 'bob@example.com', createdAt: Timestamp.now()});
    await setDoc(doc(db, 'users', 'sue'), {...account(), status: 'suspended', createdAt: Timestamp.now(), updatedAt: Timestamp.now(), lastActiveAt: Timestamp.now()});
  });
});

// ---------- accounts & ownership ----------
test('unauthenticated clients can read no private data', async () => {
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, 'users/bob')));
  await assertFails(getDoc(doc(anon, 'users/bob/sync/saved')));
  await assertFails(getDoc(doc(anon, 'directory/bob')));
  await assertFails(getDocs(collection(anon, 'users')));
});
test('a user can create only their own active account record', async () => {
  const alice = user('alice');
  await assertSucceeds(setDoc(doc(alice, 'users/alice'), account()));
  await assertFails(setDoc(doc(alice, 'users/mallory'), account()));
  await assertFails(setDoc(doc(user('carol'), 'users/carol'), {...account(), status: 'suspended'}));
  await assertFails(setDoc(doc(user('dave'), 'users/dave'), {...account(), role: 'super_admin'}));
});
test('users cannot change their own status (no self-reactivation)', async () => {
  await assertFails(updateDoc(doc(user('sue'), 'users/sue'), {status: 'active', updatedAt: serverTimestamp()}));
  await assertFails(updateDoc(doc(user('bob'), 'users/bob'), {status: 'suspended', updatedAt: serverTimestamp()}));
});
test('owners read/write their learning data; other users cannot (no IDOR)', async () => {
  const bob = user('bob'), eve = user('eve');
  await assertSucceeds(getDoc(doc(bob, 'users/bob/sync/saved')));
  await assertFails(getDoc(doc(eve, 'users/bob/sync/saved')));
  await assertFails(setDoc(doc(eve, 'users/bob/sync/saved'), {items: {}, v: 3, updatedAt: serverTimestamp()}));
  await assertSucceeds(setDoc(doc(bob, 'users/bob/sync/saved'), {items: {idk: {u: 2}}, v: 3, updatedAt: serverTimestamp()}));
});
test('sync writes are schema-checked and rate-limited', async () => {
  const bob = user('bob');
  await assertFails(setDoc(doc(bob, 'users/bob/sync/saved'), {items: {}, v: 3, updatedAt: serverTimestamp(), extra: true}));
  await assertFails(setDoc(doc(bob, 'users/bob/sync/admin'), {items: {}, v: 3, updatedAt: serverTimestamp()}));
  await assertSucceeds(setDoc(doc(bob, 'users/bob/sync/progress'), {items: {}, resetAt: 0, v: 3, updatedAt: serverTimestamp()}));
  await assertFails(setDoc(doc(bob, 'users/bob/sync/progress'), {items: {}, resetAt: 1, v: 3, updatedAt: serverTimestamp()}));
});
test('suspended accounts cannot sync', async () => {
  await assertFails(setDoc(doc(user('sue'), 'users/sue/sync/saved'), {items: {}, v: 3, updatedAt: serverTimestamp()}));
});
test('directory e-mail must match the verified token e-mail', async () => {
  await assertSucceeds(setDoc(doc(user('alice'), 'directory/alice'), {email: 'alice@example.com', createdAt: serverTimestamp()}));
  await assertFails(setDoc(doc(user('carl'), 'directory/carl'), {email: 'ceo@example.com', createdAt: serverTimestamp()}));
});
test('self-deletion: tombstone + data removal in one batch; data cannot be deleted otherwise', async () => {
  const bob = user('bob');
  await assertFails(deleteDoc(doc(bob, 'users/bob/sync/saved')));
  const b = writeBatch(bob);
  b.set(doc(bob, 'users/bob'), {status: 'deleted', deletedAt: serverTimestamp(), updatedAt: serverTimestamp()});
  b.delete(doc(bob, 'users/bob/sync/saved'));
  b.delete(doc(bob, 'directory/bob'));
  await assertSucceeds(b.commit());
  await assertFails(setDoc(doc(bob, 'users/bob/sync/saved'), {items: {}, v: 3, updatedAt: serverTimestamp()}));
});

// ---------- administration ----------
test('admin access requires MFA and an admin record', async () => {
  await assertFails(getDocs(collection(admin('analyst', false), 'users')));
  await assertSucceeds(getDocs(collection(admin('analyst'), 'users')));
  await assertFails(getDocs(collection(user('bob'), 'users')));
  await assertFails(getDocs(collection(env.authenticatedContext('bob', {email: 'bob@example.com', ...MFA}).firestore(), 'users')));
});
test('least privilege: analysts cannot see e-mails or learning data; support can', async () => {
  await assertFails(getDoc(doc(admin('analyst'), 'directory/bob')));
  await assertFails(getDoc(doc(admin('analyst'), 'users/bob/sync/saved')));
  await assertSucceeds(getDoc(doc(admin('support'), 'directory/bob')));
  await assertSucceeds(getDoc(doc(admin('support'), 'users/bob/sync/saved')));
});
test('suspension requires a matching audit entry in the same batch', async () => {
  const mod = admin('mod');
  await assertFails(updateDoc(doc(mod, 'users/bob'), {status: 'suspended', statusReason: 'spam', statusUpdatedAt: serverTimestamp(), statusUpdatedBy: 'mod', updatedAt: serverTimestamp(), lastAuditId: 'missing'}));
  const a = audit(mod, 'mod', 'moderator', 'user.suspend', 'users/bob');
  const b = writeBatch(mod);
  b.set(a.ref, a.data);
  b.update(doc(mod, 'users/bob'), {status: 'suspended', statusReason: 'spam', statusUpdatedAt: serverTimestamp(), statusUpdatedBy: 'mod', updatedAt: serverTimestamp(), lastAuditId: a.ref.id});
  await assertSucceeds(b.commit());
  const analyst = admin('analyst');
  const a2 = audit(analyst, 'analyst', 'analyst', 'user.reactivate', 'users/bob');
  const b2 = writeBatch(analyst);
  b2.set(a2.ref, a2.data);
  b2.update(doc(analyst, 'users/bob'), {status: 'active', statusReason: 'x', statusUpdatedAt: serverTimestamp(), statusUpdatedBy: 'analyst', updatedAt: serverTimestamp(), lastAuditId: a2.ref.id});
  await assertFails(b2.commit());
});
test('audit logs are append-only and cannot be forged', async () => {
  const mod = admin('mod');
  const forged = audit(mod, 'super1', 'super_admin', 'user.suspend', 'users/bob');
  await assertFails(setDoc(forged.ref, forged.data));
  const ok = audit(mod, 'mod', 'moderator', 'admin.login', 'admins/mod');
  await assertSucceeds(setDoc(ok.ref, ok.data));
  await assertFails(updateDoc(doc(admin('super1'), 'auditLogs', ok.ref.id), {summary: 'edited'}));
  await assertFails(deleteDoc(doc(admin('super1'), 'auditLogs', ok.ref.id)));
  await assertFails(getDoc(doc(mod, 'auditLogs', ok.ref.id)));
});
test('super admins cannot change their own role; other roles cannot grant roles', async () => {
  const s1 = admin('super1');
  const a = audit(s1, 'super1', 'super_admin', 'admin.role.set', 'admins/super1');
  const b = writeBatch(s1);
  b.set(a.ref, a.data);
  b.set(doc(s1, 'admins/super1'), {role: 'super_admin', active: false, email: 'x@y.z', updatedAt: serverTimestamp(), updatedBy: 'super1', lastAuditId: a.ref.id});
  await assertFails(b.commit());
  const ed = admin('editor');
  const a2 = audit(ed, 'editor', 'content_manager', 'admin.role.set', 'admins/bob');
  const b2 = writeBatch(ed);
  b2.set(a2.ref, a2.data);
  b2.set(doc(ed, 'admins/bob'), {role: 'super_admin', active: true, email: 'bob@example.com', updatedAt: serverTimestamp(), updatedBy: 'editor', lastAuditId: a2.ref.id});
  await assertFails(b2.commit());
});

// ---------- content ----------
const entry = (id, status, version) => ({id, term: 'delulu', full: 'Delusional', meaning: 'Playfully unrealistic hopes.', example: '', category: 'Social', subcategory: '', variations: [], region: 'Online', tone: 'Playful', language: 'English', sensitivity: 'None', caution: 'Context matters.', status, version});
async function writeContent(db, uid, role, id, status, version, action, extra = b => {}) {
  const a = audit(db, uid, role, `content.${action}`, `content/${id}`);
  const b = writeBatch(db);
  b.set(a.ref, a.data);
  const data = {...entry(id, status, version), createdAt: version === 1 ? serverTimestamp() : Timestamp.fromMillis(0), updatedAt: serverTimestamp(), updatedBy: uid, lastAuditId: a.ref.id};
  b.set(doc(db, 'content', id), data);
  b.set(doc(db, 'content', id, 'versions', String(version)), {snapshot: entry(id, status, version), by: uid, at: serverTimestamp(), action: action === 'submit_review' ? 'submit_review' : action});
  extra(b);
  return b.commit();
}
test('content workflow: draft → review → publish, with history and audit', async () => {
  const ed = admin('editor');
  await assertSucceeds(writeContent(ed, 'editor', 'content_manager', 'cms-delulu', 'draft', 1, 'create'));
  // Publishing straight from draft is denied.
  await assertFails(writeContent(ed, 'editor', 'content_manager', 'cms-delulu', 'published', 2, 'publish', b => b.set(doc(ed, 'publishedContent/cms-delulu'), {...entry('cms-delulu', 'published', 2), updatedAt: serverTimestamp()})));
  await seed(db => updateDoc(doc(db, 'content/cms-delulu'), {createdAt: Timestamp.fromMillis(0)}));
  await assertSucceeds(writeContent(ed, 'editor', 'content_manager', 'cms-delulu', 'in_review', 2, 'submit_review'));
  await assertSucceeds(writeContent(ed, 'editor', 'content_manager', 'cms-delulu', 'published', 3, 'publish', b => b.set(doc(ed, 'publishedContent/cms-delulu'), {...entry('cms-delulu', 'published', 3), updatedAt: serverTimestamp()})));
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(anon, 'publishedContent/cms-delulu')));
  await assertFails(getDoc(doc(anon, 'content/cms-delulu')));
  await assertFails(updateDoc(doc(ed, 'content/cms-delulu/versions/1'), {action: 'update'}));
});
test('moderators and analysts cannot edit content; invalid content is rejected', async () => {
  await assertFails(writeContent(admin('mod'), 'mod', 'moderator', 'cms-x', 'draft', 1, 'create'));
  const ed = admin('editor');
  const a = audit(ed, 'editor', 'content_manager', 'content.create', 'content/cms-bad');
  const b = writeBatch(ed);
  b.set(a.ref, a.data);
  b.set(doc(ed, 'content/cms-bad'), {...entry('cms-bad', 'draft', 1), term: 'x'.repeat(61), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: 'editor', lastAuditId: a.ref.id});
  b.set(doc(ed, 'content/cms-bad/versions/1'), {snapshot: {}, by: 'editor', at: serverTimestamp(), action: 'create'});
  await assertFails(b.commit());
});

// ---------- user submissions & security events ----------
test('submissions need an active account and are rate-limited server-side', async () => {
  const bob = user('bob');
  const submit = () => {const b = writeBatch(bob); b.set(doc(bob, 'users/bob/limits/ugc'), {last: serverTimestamp()}); b.set(doc(collection(bob, 'submissions')), {term: 'delulu', meaning: 'Unrealistic.', example: '', category: 'Social', uid: 'bob', status: 'pending', createdAt: serverTimestamp()}); return b.commit();};
  await assertSucceeds(submit());
  await assertFails(submit());
  await assertFails(setDoc(doc(collection(bob, 'submissions')), {term: 'x', meaning: 'y', example: '', category: 'Social', uid: 'bob', status: 'pending', createdAt: serverTimestamp()}));
  const sue = user('sue');
  const b = writeBatch(sue); b.set(doc(sue, 'users/sue/limits/ugc'), {last: serverTimestamp()}); b.set(doc(collection(sue, 'submissions')), {term: 'a', meaning: 'b', example: '', category: 'Chat', uid: 'sue', status: 'pending', createdAt: serverTimestamp()});
  await assertFails(b.commit());
});
test('security events: allow-listed, owner-stamped, rate-limited, readable only by super admins', async () => {
  const bob = user('bob');
  const ev = type => {const b = writeBatch(bob); b.set(doc(bob, 'users/bob/limits/sec'), {last: serverTimestamp()}); const ref = doc(collection(bob, 'securityEvents')); b.set(ref, {uid: 'bob', type, detail: '', platform: 'android', appVersion: '0.8.0', at: serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + 90 * 86400_000)}); return b.commit().then(() => ref);};
  const ref = await assertSucceeds(ev('session_expired'));
  await assertFails(ev('session_expired'));
  await assertFails(getDocs(query(collection(admin('mod'), 'securityEvents'), where('type', '==', 'session_expired'))));
  await assertSucceeds(getDoc(doc(admin('super1'), 'securityEvents', ref.id)));
});
test('drafts and staff collections are never public', async () => {
  const anon = env.unauthenticatedContext().firestore();
  for (const c of ['content', 'auditLogs', 'securityEvents', 'admins', 'submissions', 'reports', 'feedback']) await assertFails(getDocs(collection(anon, c)));
  await assertSucceeds(getDoc(doc(anon, 'config/app')));
});
