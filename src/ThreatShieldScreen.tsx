/**
 * Threat Shield — privacy & security centre. Replaces the former "Privacy & safety" sheet.
 * Shows only real, defined checks (see shield/status.ts) and real controls.
 * Threat Shield is a set of app protections; it is not antivirus or a firewall.
 */
import React, {useEffect, useState} from 'react';
import {View, Text, Pressable, Switch, StyleSheet, Platform} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {C, Glass, Icon, IconName, Button, confirmAction} from './ui';
import {shieldChecks, summarize, ShieldCheck, ago} from './shield/status';
import {useLearningState, useStorageHealth, useSyncStatus, useAccountUser, useSecurityEvents, repository, getCloud} from './services';
import {setSearchHistory, clearBrowsingHistory, resetScores, resetReviewProgress, removeAllSaved, Action} from './learning';
import {unavailableSavedCount} from './profile';
import {LAST_SECURITY_REVIEW, PRIVACY_POLICY_URL} from './secure/config';

const eventLabels: Record<string, string> = {login_failed: 'Failed sign-in attempt', login_throttled: 'Sign-in paused after repeated failures', login_succeeded_after_failures: 'Signed in after failed attempts', session_expired: 'Session ended by the server', reauth_failed: 'Identity check failed', sync_permission_denied: 'Server refused a sync request', sync_blocked_account_status: 'Sync paused by account status', storage_quarantine: 'Damaged data set aside', content_validation_rejected: 'Invalid content update ignored', account_deleted: 'Account deleted', account_deletion_started: 'Account deletion started', admin_access_denied: 'Admin access denied'};
const stateStyle: Record<ShieldCheck['state'], {icon: IconName; color: string; bg: string}> = {
  pass: {icon: 'checkmark-circle', color: '#13805a', bg: '#e1f5e9'}, attention: {icon: 'alert-circle', color: '#a35a12', bg: '#fff1dc'},
  info: {icon: 'information-circle', color: C.blue, bg: '#e4edff'}, 'n/a': {icon: 'remove-circle-outline', color: C.muted, bg: '#edf1f6'},
};

export default function ThreatShieldScreen({onOpenAccount, onExport, onDeleteLocal, onClearMessage, deleting}: {onOpenAccount: () => void; onExport: () => void; onDeleteLocal: () => void; onClearMessage: () => void; deleting: boolean}) {
  const state = useLearningState(), health = useStorageHealth(), sync = useSyncStatus(), user = useAccountUser(), events = useSecurityEvents();
  const [secure, setSecure] = useState<boolean | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (Platform.OS === 'web') {setSecure(false); return;}
    import('expo-secure-store').then(m => m.isAvailableAsync()).then(setSecure).catch(() => setSecure(false));
  }, []);
  const checks = shieldChecks({health, volatile: repository.isVolatile, state, sync, signedIn: !!user, emailVerified: !!user?.emailVerified, secureSessionStorage: secure, events, now: Date.now()});
  const sum = summarize(checks);
  const act = (a: Action, done: string) => repository.mutate(a).then(() => setNotice(done)).catch(() => setNotice('That change could not be saved. Please try again.'));
  const confirm = confirmAction;
  const runAction = (c: ShieldCheck) => {
    if (c.action === 'retry-storage') void repository.load();
    else if (c.action === 'sync-now') void getCloud()?.engine.syncNow();
    else onOpenAccount();
  };
  const orphans = unavailableSavedCount(state);

  return <>
    <LinearGradient colors={sum.attention ? ['#fff7e8', '#ffeccc'] : ['#e9f8f0', '#d8f1e6']} style={s.hero}>
      <View style={[s.shield, {backgroundColor: sum.attention ? '#ffe2b3' : '#c6ecd8'}]}><Icon name={sum.attention ? 'shield-half' : 'shield-checkmark'} size={38} color={sum.attention ? '#a35a12' : '#13805a'} /></View>
      <Text accessibilityRole="header" style={s.heroTitle}>{sum.attention ? `${sum.attention} ${sum.attention === 1 ? 'item needs' : 'items need'} your attention` : 'Your protections are active'}</Text>
      <Text style={s.heroBody}>{sum.passed} of {sum.applicable} applicable checks passed on this device. Each check is listed below with what it verifies.</Text>
    </LinearGradient>
    {!!notice && <Pressable accessibilityRole="button" onPress={() => setNotice('')} style={s.notice}><Icon name="checkmark-circle-outline" size={18} color="#175e47" /><Text accessibilityLiveRegion="polite" style={s.noticeText}>{notice}</Text></Pressable>}

    <Glass style={{gap: 4, padding: 10}}>
      {checks.map(c => {const st = stateStyle[c.state]; return <View key={c.id} style={s.check}>
        <View style={[s.checkIcon, {backgroundColor: st.bg}]}><Icon name={st.icon} size={20} color={st.color} /></View>
        <View style={{flex: 1, gap: 3}}>
          <Text style={s.checkTitle}>{c.title}</Text>
          <Text style={s.caption}>{c.detail}</Text>
          {c.action && c.state !== 'pass' && <Pressable accessibilityRole="button" onPress={() => runAction(c)} style={s.inlineAction}><Text style={s.link}>{c.action === 'retry-storage' ? 'Retry reading data' : c.action === 'sync-now' ? 'Sync now' : c.action === 'verify-email' ? 'Open account' : c.action === 'sign-in' ? 'Sign in' : 'Open account'}</Text></Pressable>}
        </View>
      </View>;})}
    </Glass>

    <Text style={s.section}>Privacy settings</Text>
    <Glass>
      <View style={s.toggleRow}>
        <View style={{flex: 1, gap: 3}}><Text style={s.checkTitle}>Remember my searches</Text><Text style={s.caption}>Off by default. Kept only on this device (last 20) and never synced.</Text></View>
        <Switch accessibilityLabel="Remember my searches" value={state.device.searchHistory} onValueChange={v => void act(setSearchHistory(v), v ? 'Search history is on for this device.' : 'Search history turned off and cleared.')} />
      </View>
      <Button light title={`Clear browsing history (${state.recent.length + state.searches.length})`} icon="time-outline" disabled={!state.recent.length && !state.searches.length} onPress={() => void act(clearBrowsingHistory, 'Recently viewed words and searches were cleared.')} />
      <Button light title="Clear my current message" icon="chatbox-outline" onPress={onClearMessage} />
    </Glass>

    <Text style={s.section}>Your data</Text>
    <Glass>
      <Button light title="Export my learning data" icon="download-outline" onPress={onExport} />
      <Button light title="Remove all saved words" icon="bookmark-outline" disabled={!Object.values(state.saved).some(r => !r.d)} onPress={() => confirm('Remove all saved words?', user ? 'They will also be removed from your other signed-in devices.' : 'This removes every saved word on this device.', () => void act(removeAllSaved, 'All saved words were removed.'))} />
      <Button light title="Reset quiz scores & streak" icon="trophy-outline" onPress={() => confirm('Reset scores and streak?', 'Best scores, round history and streak days are reset' + (user ? ' on all your signed-in devices.' : '.'), () => void act(resetScores, 'Scores, round history and streak were reset.'))} />
      <Button light title="Reset word review progress" icon="repeat-outline" onPress={() => confirm('Reset review progress?', 'Spaced-repetition schedules and mastery are cleared' + (user ? ' on all your signed-in devices.' : '.'), () => void act(resetReviewProgress, 'Word review progress was reset.'))} />
      <Button light disabled={deleting} title={deleting ? 'Deleting…' : 'Delete all data on this device'} icon="trash-bin-outline" onPress={() => confirm('Delete data on this device?', user ? 'This removes your nickname, saved words and progress from this device. Your cloud copy stays in your account and returns next time you sync. To delete it, delete your account.' : 'This removes your nickname, saved words and learning progress from this device. It cannot be undone.', onDeleteLocal)} />
      <Button light title={user ? 'Account & account deletion' : 'Sign in or create an account'} icon="person-circle-outline" onPress={onOpenAccount} />
      {orphans > 0 && <Text style={s.caption}>{orphans} saved {orphans === 1 ? 'entry refers' : 'entries refer'} to words not in this version of the dictionary. They are kept safely and reappear if the words return.</Text>}
    </Glass>

    <Text style={s.section}>What we store, and where</Text>
    {[
      {icon: 'phone-portrait-outline' as IconName, title: 'On this device', body: 'Nickname, avatar, your profile photo (if you add one — it is never uploaded), saved word IDs, quiz scores, review schedule, streak days, recently viewed words and (if enabled) searches. Stored in app-private storage with a checksum and backup copy. Uninstalling the app deletes it; device backups are disabled for this app.'},
      {icon: 'cloud-outline' as IconName, title: 'In your account (only if you sign in)', body: 'The same learning records, synced so they survive reinstalling and appear on your other devices, plus sign-up date, last-active day, app version and summary counts. Your e-mail is held by Firebase Authentication and in a support directory visible only to support staff. Recently viewed words and searches are never uploaded.'},
      {icon: 'lock-closed-outline' as IconName, title: 'Never collected', body: 'Decoded messages, contacts, location, microphone, camera, advertising IDs or device identifiers. No ads, AI provider or third-party analytics SDK is connected.'},
    ].map(v => <Glass key={v.title}><View style={s.inline}><Icon name={v.icon} color={C.blue} /><Text style={s.checkTitle}>{v.title}</Text></View><Text style={s.body}>{v.body}</Text></Glass>)}

    <Text style={s.section}>Security activity on this device</Text>
    <Glass>
      {events.length === 0 ? <Text style={s.caption}>No security events recorded on this device.</Text> : events.slice(0, 8).map((e, i) => <View key={i} style={s.event}><Icon name="ellipse" size={8} color={e.type.includes('failed') || e.type.includes('denied') ? '#c26b20' : C.blue} /><Text style={[s.caption, {flex: 1, color: C.ink}]}>{eventLabels[e.type] ?? e.type}</Text><Text style={s.fine}>{ago(Date.now() - e.at)}</Text></View>)}
      <Text style={s.fine}>Kept on this device (last 50). Selected events — never your e-mail, password, messages or location — are reported to the service while signed in, kept 90 days, to detect abuse.</Text>
    </Glass>
    <Text style={s.fine}>Last code security review: {LAST_SECURITY_REVIEW}. Threat Shield covers app storage, sessions, sign-in throttling and server access rules; it is not antivirus and does not scan your device. Privacy policy: {PRIVACY_POLICY_URL}</Text>
  </>;
}

const s = StyleSheet.create({
  hero: {borderRadius: 28, padding: 22, gap: 10, alignItems: 'center', borderWidth: 1.5, borderColor: '#fff'},
  shield: {width: 72, height: 72, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff'},
  heroTitle: {fontSize: 21, fontWeight: '900', color: C.ink, textAlign: 'center', letterSpacing: -0.4},
  heroBody: {fontSize: 14, lineHeight: 21, color: C.muted, textAlign: 'center'},
  check: {flexDirection: 'row', gap: 12, padding: 10, alignItems: 'flex-start'},
  checkIcon: {width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  checkTitle: {fontSize: 15, fontWeight: '800', color: C.ink},
  caption: {fontSize: 12, lineHeight: 18, color: C.muted},
  body: {fontSize: 14, lineHeight: 22, color: C.muted},
  fine: {fontSize: 11, lineHeight: 17, color: '#5c7189'},
  section: {fontSize: 19, fontWeight: '800', color: C.ink, letterSpacing: -0.3, marginTop: 4},
  inlineAction: {minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start'},
  link: {fontSize: 13, color: C.blue, fontWeight: '800'},
  toggleRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  inline: {flexDirection: 'row', alignItems: 'center', gap: 9},
  event: {flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 30},
  notice: {flexDirection: 'row', gap: 9, padding: 14, borderRadius: 16, backgroundColor: '#e1f5e9', alignItems: 'center'},
  noticeText: {flex: 1, color: '#175e47', fontSize: 14, lineHeight: 20},
});
