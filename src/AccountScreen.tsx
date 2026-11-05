import React, {useEffect, useState} from 'react';
import {View, Text, TextInput, Pressable, StyleSheet, AppState, Platform, Linking, Switch} from 'react-native';
import {signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, reload, signOut, deleteUser, EmailAuthProvider, reauthenticateWithCredential} from 'firebase/auth';
import {accountAuth} from './auth/client';
import {accountError, validateCredentials} from './auth/policy';
import {C, Glass, Button, Icon, Mark} from './ui';
import {startCloud, useAccountUser, useSyncStatus, useLearningState, loginGuard, securityLog, repository} from './services';
import {isDirty} from './profile';
import {ago} from './shield/status';
import {ACCOUNT_DELETION_URL} from './secure/config';

type Mode = 'signin' | 'create' | 'reset';
type Panel = null | 'signout' | 'delete';
const CREDENTIAL_FAILURES = new Set(['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials', 'auth/too-many-requests']);
const codeOf = (e: unknown) => (e && typeof e === 'object' && 'code' in e ? String((e as {code: unknown}).code) : '');

export default function AccountScreen({onContinue}: {onContinue: () => void}) {
  const user = useAccountUser(), sync = useSyncStatus(), state = useLearningState();
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [mode, setMode] = useState<Mode>('signin'), [panel, setPanel] = useState<Panel>(null);
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [notice, setNotice] = useState(''), [error, setError] = useState(''), [verified, setVerified] = useState(false);
  const [removeLocal, setRemoveLocal] = useState(false), [waitMs, setWaitMs] = useState(loginGuard.waitMs());
  useEffect(() => {startCloud().then(() => setReady(true)).catch(() => {setReady(true); setError('Couldn’t start account services. You can still learn offline.');});}, []);
  useEffect(() => {setVerified(user?.emailVerified ?? false); if (!user) {setMode('signin'); setConfirmation('');}}, [user]);
  useEffect(() => {const sub = AppState.addEventListener('change', s => {if (s !== 'active') {setPassword(''); setConfirmation('');}}); return () => sub.remove();}, []);
  useEffect(() => {if (!waitMs) return; const t = setInterval(() => setWaitMs(loginGuard.waitMs()), 1000); return () => clearInterval(t);}, [waitMs > 0]);
  const engine = () => startCloud().then(c => c.engine);
  const changeMode = (value: Mode) => {setMode(value); setPassword(''); setConfirmation(''); setError(''); setNotice('');};
  const run = async (action: () => Promise<void>) => {if (busy) return; setBusy(true); setError(''); setNotice(''); try {await action();} catch (e) {setError(accountError(e));} finally {setPassword(''); setConfirmation(''); setBusy(false);}};

  const submit = () => {
    const wait = loginGuard.waitMs();
    if (mode !== 'reset' && wait) {setWaitMs(wait); setError(`Too many attempts on this device. Try again in ${Math.ceil(wait / 1000)} s.`); return;}
    const invalid = validateCredentials(email, password, mode === 'create');
    if (mode !== 'reset' && invalid) {setError(invalid); return;}
    if (mode === 'reset' && validateCredentials(email, 'not-empty')) {setError('Enter a valid email address.'); return;}
    if (mode === 'create' && password !== confirmation) {setError('The passwords do not match.'); return;}
    void run(async () => {
      const address = email.trim();
      if (mode === 'reset') {await sendPasswordResetEmail(accountAuth, address); setNotice('If this address can receive a reset email, check its inbox and spam folder.'); return;}
      try {
        if (mode === 'create') await createUserWithEmailAndPassword(accountAuth, address, password);
        else await signInWithEmailAndPassword(accountAuth, address, password);
      } catch (e) {
        if (mode === 'signin' && CREDENTIAL_FAILURES.has(codeOf(e))) {
          void securityLog.record('login_failed', codeOf(e));
          const lock = await loginGuard.failed();
          if (lock) {void securityLog.record('login_throttled', `failures:${loginGuard.failures}`); setWaitMs(lock);}
        }
        throw e;
      }
      const prior = await loginGuard.succeeded();
      setWaitMs(0);
      if (prior >= 3) void securityLog.record('login_succeeded_after_failures', `count:${prior}`);
      setNotice(mode === 'create' ? 'Account created. Your learning on this device is now backed up. Send a verification email below.' : 'You’re signed in. Your learning syncs automatically.');
    });
  };

  const finishSignOut = (remove: boolean) => void run(async () => {
    await signOut(accountAuth);
    if (remove) await repository.clear();
    setPanel(null); setEmail('');
    setNotice(remove ? 'Signed out and removed learning data from this device. Your cloud copy is safe in your account.' : 'Signed out. Your learning stays on this device and resumes syncing when you sign in again.');
  });
  const beginSignOut = () => void run(async () => {
    const clean = await (await engine()).flush();
    setPanel('signout');
    if (!clean) setError('Some recent changes haven’t synced yet (you may be offline). If you remove data from this device now, those changes will be lost.');
  });

  const deleteAccount = () => void run(async () => {
    const current = accountAuth.currentUser;
    if (!current?.email) return;
    try {await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, password));}
    catch (e) {void securityLog.record('reauth_failed', codeOf(e)); throw e;}
    void securityLog.record('account_deletion_started');
    const sync = await engine();
    try {await sync.deleteCloudData();}
    catch {throw Object.assign(new Error('cloud'), {code: 'genz/cloud-deletion-failed'});}
    try {await deleteUser(current);}
    catch {throw Object.assign(new Error('auth'), {code: 'genz/auth-deletion-incomplete'});}
    void securityLog.record('account_deleted');
    if (removeLocal) await repository.clear();
    setPanel(null); setEmail('');
    setNotice(removeLocal ? 'Your account, its cloud data and this device’s learning data were deleted.' : 'Your account and its cloud data were deleted. Learning on this device was kept as a guest profile.');
  });

  if (!ready) return <Glass><Text accessibilityLiveRegion="polite" style={s.body}>Checking your account…</Text></Glass>;
  const dirty = isDirty(state);
  return <View style={s.page}>
    <View style={s.center}><Mark large /><Text accessibilityRole="header" style={s.title}>{user ? 'Your corner of the internet.' : mode === 'create' ? 'Stay curious. Join in.' : mode === 'reset' ? 'Let’s get you back.' : 'Welcome to GenZ Code.'}</Text></View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
    {user ? <>
      <Glass>
        <Icon name="person-circle-outline" color={C.blue} size={36} />
        <Text selectable style={s.label}>{user.email}</Text>
        <View style={s.inline}><Icon name={verified ? 'checkmark-circle' : 'alert-circle-outline'} size={17} color={verified ? '#13805a' : '#a35a12'} /><Text style={s.body}>{verified ? 'Email verified' : 'Email not verified'}</Text></View>
        {!verified && <><Button title="Send verification email" icon="mail-outline" disabled={busy} onPress={() => void run(async () => {await sendEmailVerification(user); setNotice('Verification email sent. Open the link in your inbox, then check your status here.');})} /><Button title="Check verification status" icon="checkmark-circle-outline" light disabled={busy} onPress={() => void run(async () => {await reload(user); setVerified(user.emailVerified); setNotice(user.emailVerified ? 'Your email is verified.' : 'Not verified yet. Open the verification link first.');})} /></>}
      </Glass>
      <Glass>
        <View style={s.inline}><Icon name={sync.phase === 'idle' && !dirty ? 'cloud-done-outline' : sync.phase === 'offline' ? 'cloud-offline-outline' : 'cloud-upload-outline'} color={C.blue} size={24} /><Text style={s.label}>Cloud sync</Text></View>
        <Text style={s.body}>{sync.phase === 'syncing' ? 'Syncing now…' : sync.phase === 'idle' ? (dirty ? 'Recent changes are saved on this device and will upload shortly.' : `Up to date${sync.lastSyncAt ? ` · last synced ${ago(Date.now() - sync.lastSyncAt)}` : ''}.`) : sync.lastError ?? 'Sync is paused.'}</Text>
        {sync.phase === 'account-mismatch' ? <>
          <Text style={s.small}>This device’s learning belongs to a different account, so it was not mixed into this one. Choose “Use this account here” to replace this device’s learning with {user.email}’s cloud copy. The other account’s synced data stays in that account.{dirty ? ' Unsynced changes from the other account will be removed from this device.' : ''}</Text>
          <Button title="Use this account here" icon="swap-horizontal-outline" disabled={busy} onPress={() => void run(async () => {await (await engine()).adoptSignedInAccount(); setNotice('This device now shows your account’s learning.');})} />
        </> : <Button light title="Sync now" icon="sync-outline" disabled={busy || sync.phase === 'syncing' || sync.phase === 'blocked'} onPress={() => void run(async () => {const st = await (await engine()).syncNow(); if (st.phase === 'idle') setNotice('Sync complete.');})} />}
      </Glass>
      {panel === 'signout' ? <Glass>
        <Text style={s.label}>Keep your learning on this device?</Text>
        <Text style={s.small}>Your account’s cloud copy is unaffected either way.</Text>
        <Button title="Sign out, keep data on this device" icon="log-out-outline" disabled={busy} onPress={() => finishSignOut(false)} />
        <Button light title="Sign out and remove it from this device" icon="trash-outline" disabled={busy} onPress={() => finishSignOut(true)} />
        <Button light title="Cancel" icon="close-outline" disabled={busy} onPress={() => {setPanel(null); setError('');}} />
      </Glass> : panel === 'delete' ? <Glass>
        <Text style={s.label}>Delete your account permanently</Text>
        <Text style={s.small}>This deletes your synced learning data, your pending suggestions, reports and feedback, your support directory entry, and your sign-in account. It can’t be undone. Security logs without personal details expire after 90 days; see the privacy policy.</Text>
        <Text style={s.label}>Confirm your password</Text>
        <TextInput accessibilityLabel="Password to confirm deletion" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" maxLength={4096} editable={!busy} style={s.input} placeholder="Your password" placeholderTextColor={C.muted} />
        <View style={s.toggle}><Text style={[s.small, {flex: 1}]}>Also delete learning data on this device</Text><Switch accessibilityLabel="Also delete learning data on this device" value={removeLocal} onValueChange={setRemoveLocal} /></View>
        <Button title={busy ? 'Deleting…' : 'Delete my account'} icon="trash-bin-outline" disabled={busy || !password} onPress={deleteAccount} />
        <Button light title="Cancel" icon="close-outline" disabled={busy} onPress={() => {setPanel(null); setPassword('');}} />
      </Glass> : <Glass>
        <Button light title="Sign out" icon="log-out-outline" disabled={busy} onPress={beginSignOut} />
        <Button light title="Delete account and cloud data" icon="trash-bin-outline" disabled={busy} onPress={() => {setPanel('delete'); setError(''); setNotice('');}} />
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(ACCOUNT_DELETION_URL)} style={s.linkButton}><Text style={s.link}>Request deletion from the web instead</Text></Pressable>
      </Glass>}
    </> : <Glass>
      <Text style={s.label}>Email address</Text>
      <TextInput accessibilityLabel="Account email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" maxLength={254} editable={!busy} style={s.input} placeholder="you@example.com" placeholderTextColor={C.muted} />
      {mode !== 'reset' && <><Text style={s.label}>Password{mode === 'create' ? ' · 12+ characters' : ''}</Text><TextInput accessibilityLabel="Account password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={mode === 'create' ? 'new-password' : 'current-password'} textContentType={mode === 'create' ? 'newPassword' : 'password'} maxLength={4096} editable={!busy} style={s.input} placeholder="Your password" placeholderTextColor={C.muted} /></>}
      {mode === 'create' && <><Text style={s.label}>Confirm password</Text><TextInput accessibilityLabel="Confirm account password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" maxLength={4096} editable={!busy} style={s.input} /><Text style={s.small}>Creating an account sends your email and password securely (HTTPS) to Firebase Authentication. Your saved words and progress are then backed up to your account. Core learning stays free without one.</Text></>}
      {waitMs > 0 && mode !== 'reset' && <Text accessibilityLiveRegion="polite" style={s.small}>Sign-in paused on this device for {Math.ceil(waitMs / 1000)} s after repeated failed attempts.</Text>}
      <Button title={busy ? 'Please wait…' : mode === 'create' ? 'Create account' : mode === 'reset' ? 'Send password reset' : 'Sign in with email'} icon={mode === 'reset' ? 'mail-outline' : 'log-in-outline'} disabled={busy || (mode !== 'reset' && waitMs > 0)} onPress={submit} />
      <View style={s.links}>{mode !== 'signin' && <Pressable disabled={busy} accessibilityRole="button" onPress={() => changeMode('signin')} style={s.linkButton}><Text style={s.link}>Back to sign in</Text></Pressable>}{mode === 'signin' && <><Pressable disabled={busy} accessibilityRole="button" onPress={() => changeMode('create')} style={s.linkButton}><Text style={s.link}>Create an account</Text></Pressable><Pressable disabled={busy} accessibilityRole="button" onPress={() => changeMode('reset')} style={s.linkButton}><Text style={s.link}>Forgot password?</Text></Pressable></>}</View>
    </Glass>}
    {!user && <Glass><View style={s.google}><Icon name="logo-google" color={C.muted} /><Text style={s.label}>Google sign-in</Text><Text style={s.small}>Not configured</Text></View><Text style={s.small}>Google sign-in needs the app’s signing fingerprints and OAuth configuration in Firebase. Email sign-in is separate.</Text></Glass>}
    <Button light title="Continue learning" icon="book-outline" disabled={busy} onPress={onContinue} />
    <Text style={s.small}>{Platform.OS === 'web' ? 'Web sessions are memory-only and end on page reload.' : 'Account sessions use encrypted device storage when available; otherwise they last for this app session.'} Passwords are never saved by GenZ Code. Pasted messages stay on-device. Without an account, uninstalling the app deletes your learning data.</Text>
  </View>;
}
const s = StyleSheet.create({page: {gap: 20}, center: {alignItems: 'center', gap: 18}, title: {fontSize: 29, lineHeight: 35, fontWeight: '900', color: C.ink, textAlign: 'center'}, body: {fontSize: 15, lineHeight: 23, color: C.muted}, label: {fontSize: 15, fontWeight: '700', color: C.ink}, input: {minHeight: 54, padding: 15, borderWidth: 1, borderColor: '#bccfe6', borderRadius: 17, backgroundColor: '#e7f0fb', fontSize: 17, color: C.ink}, small: {fontSize: 12, lineHeight: 19, color: C.muted}, links: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between'}, linkButton: {minHeight: 48, justifyContent: 'center'}, link: {fontSize: 14, fontWeight: '700', color: C.blue}, error: {padding: 15, borderRadius: 16, backgroundColor: '#fff0ee', color: '#96383f', fontSize: 14, lineHeight: 22}, notice: {padding: 15, borderRadius: 16, backgroundColor: '#e1f5e9', color: '#175e47', fontSize: 14, lineHeight: 22}, google: {flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap'}, inline: {flexDirection: 'row', alignItems: 'center', gap: 8}, toggle: {flexDirection: 'row', alignItems: 'center', gap: 10}});
