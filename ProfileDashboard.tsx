/**
 * "You" tab — profile dashboard. Every number comes from the saved learning state;
 * nothing is simulated. Uses the existing GenZ Code glass design system.
 */
import React, {useMemo} from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {C, Glass, Icon, IconName, Button, BrandAvatar} from './ui';
import {LearningState, Profile, streak, totalXP, localDayOf} from './profile';
import {stages, unlocked} from './games';
import {termsById, Term, contentManifest, terms} from './content';
import {dueTerms} from './reviewQueue';
import {ago} from './shield/status';
import type {SyncStatus} from './sync/engine';
import {APP_VERSION} from './secure/config';
import {useAvatarPhoto} from './avatarPhoto';

export const RANKS: [number, string][] = [[0, 'Rookie'], [100, 'Decoder'], [250, 'Code Cracker'], [500, 'Lingo Pro'], [900, 'Internet Linguist'], [1400, 'Code Legend']];
export function rankFor(xp: number) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1]![0]) i++;
  const [floor, name] = RANKS[i]!;
  const next = RANKS[i + 1];
  return {level: i + 1, name, floor, next: next ? {xp: next[0], name: next[1]} : null, progress: next ? (xp - floor) / (next[0] - floor) : 1};
}
const stageName = (id: string) => stages.find(s => s.id === id)?.name ?? (id === 'review' ? 'Daily review' : id.startsWith('daily-') ? 'Daily five' : id.startsWith('shuffle-') ? 'Shuffle: ' + id.slice(8, 9).toUpperCase() + id.slice(9) : id);

type Props = {
  state: LearningState; profile: Profile; sync: SyncStatus; signedInEmail: string | null;
  onEdit: () => void; onOpen: (sheet: 'login' | 'export' | 'guide' | 'privacy' | 'feedback') => void;
  onSavedWords: () => void; onOpenTerm: (t: Term) => void; onReview: () => void; onPlay: () => void;
};

export default function ProfileDashboard({state, profile: p, sync, signedInEmail, onEdit, onOpen, onSavedWords, onOpenTerm, onReview, onPlay}: Props) {
  const now = Date.now();
  const photo = useAvatarPhoto();
  const d = useMemo(() => {
    const xp = totalXP(p.best);
    const rank = rankFor(xp);
    const st = streak(state.days, now);
    const mastered = Object.values(p.progress).filter(r => r.mastery >= 80).length;
    const due = dueTerms(p, now).length;
    const week = Array.from({length: 7}, (_, i) => {const t = new Date(now); t.setHours(12, 0, 0, 0); t.setDate(t.getDate() - (6 - i)); const key = localDayOf(t.getTime()); return {key, label: t.toLocaleDateString('en', {weekday: 'narrow'}), count: state.days[key] ?? 0, today: i === 6};});
    const weekMax = Math.max(1, ...week.map(w => w.count));
    const attempts = Object.values(state.attempts).sort((a, b) => b.at - a.at);
    const cleared = stages.filter(g => (p.best[g.id] ?? 0) >= 60).length;
    const played = stages.filter(g => p.best[g.id] !== undefined).length;
    const recent = state.recent.map(r => termsById.get(r.id)).filter((t): t is Term => !!t).slice(0, 8);
    const perfect = Object.values(p.best).some(v => v === 100);
    const badges: {icon: IconName; label: string; earned: boolean; hint: string}[] = [
      {icon: 'chatbubbles', label: 'Code cracker', earned: played > 0, hint: 'Play a level'},
      {icon: 'star', label: 'Perfect round', earned: perfect, hint: 'Score 5 / 5'},
      {icon: 'bookmark', label: 'Word collector', earned: p.saved.length >= 5, hint: 'Save 5 words'},
      {icon: 'flame', label: 'On a roll', earned: st.best >= 3, hint: '3-day streak'},
      {icon: 'calendar', label: 'Week warrior', earned: st.best >= 7, hint: '7-day streak'},
      {icon: 'school', label: 'Sharp memory', earned: mastered >= 10, hint: 'Master 10 words'},
    ];
    return {xp, rank, st, mastered, due, week, weekMax, attempts, cleared, recent, badges, weekAnswers: week.reduce((a, w) => a + w.count, 0), weekDays: week.filter(w => w.count > 0).length, reviewing: Object.keys(p.progress).length};
  }, [state, p, now - (now % 60_000)]);

  const syncLabel = !signedInEmail ? 'Stored on this device only' : sync.phase === 'idle' && !sync.pending ? `Backed up${sync.lastSyncAt ? ' · ' + ago(now - sync.lastSyncAt) : ''}` : sync.phase === 'syncing' ? 'Syncing…' : sync.phase === 'offline' ? 'Offline · will sync later' : sync.pending ? 'Changes waiting to sync' : 'Sync needs attention';
  const syncIcon: IconName = !signedInEmail ? 'phone-portrait-outline' : sync.phase === 'idle' && !sync.pending ? 'cloud-done-outline' : sync.phase === 'offline' ? 'cloud-offline-outline' : 'cloud-upload-outline';

  return <>
    <LinearGradient colors={['#5a2fd3', '#3c55e4', '#2b86e6']} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={s.hero}>
      <View pointerEvents="none" style={[s.orb, {top: -60, right: -40, width: 190, height: 190}]} />
      <View pointerEvents="none" style={[s.orb, {bottom: -70, left: -50, width: 170, height: 170, opacity: 0.6}]} />
      <View style={s.heroRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit your profile" onPress={onEdit} style={s.avatarRing}>
          <BrandAvatar index={p.avatar} size={84} photo={p.usePhoto ? photo : null} />
          <View style={s.editBadge}><Icon name="pencil" size={13} color={C.blue} /></View>
        </Pressable>
        <View style={{flex: 1, gap: 6}}>
          <Text style={s.heroEyebrow}>YOUR CODE PROFILE</Text>
          <Text accessibilityRole="header" style={s.heroName} numberOfLines={1}>{p.name}</Text>
          <View style={s.rankPill}><Icon name="sparkles" size={13} color="#fff" /><Text style={s.rankText}>Level {d.rank.level} · {d.rank.name}</Text></View>
        </View>
      </View>
      <View style={{gap: 8}}>
        <View style={s.xpTrack} accessibilityRole="progressbar" accessibilityValue={{min: 0, max: 100, now: Math.round(d.rank.progress * 100)}}><View style={[s.xpFill, {width: `${Math.max(4, d.rank.progress * 100)}%`}]} /></View>
        <View style={s.between}><Text style={s.heroSmall}>{d.xp} XP</Text><Text style={s.heroSmall}>{d.rank.next ? `${d.rank.next.xp - d.xp} XP to ${d.rank.next.name}` : 'Top rank reached'}</Text></View>
      </View>
      <Pressable accessibilityRole="button" onPress={() => onOpen('login')} style={s.syncChip}>
        <Icon name={syncIcon} size={16} color="#fff" />
        <Text style={s.syncText} numberOfLines={1}>{syncLabel}</Text>
        <Icon name="chevron-forward" size={14} color="rgba(255,255,255,.8)" />
      </Pressable>
    </LinearGradient>

    <View style={s.grid}>
      <Stat icon="flame" tint="#d9631e" bg="#ffeedd" value={String(d.st.current)} label={d.st.current === 1 ? 'Day streak' : 'Day streak'} sub={d.st.activeToday ? `Best ${d.st.best} · today done` : d.st.current ? 'Play today to keep it' : `Best ${d.st.best} days`} />
      <Stat icon="flash" tint={C.blue} bg="#e3ecff" value={d.xp.toLocaleString()} label="Total XP" sub="From your best scores" />
      <Stat icon="bookmark" tint={C.teal} bg="#ddf3f2" value={String(p.saved.length)} label="Saved words" sub="In your pocket" onPress={onSavedWords} />
      <Stat icon="ribbon" tint="#7a3fc4" bg="#efe5ff" value={String(d.mastered)} label="Mastered" sub={`${d.reviewing} in review`} />
    </View>

    <Glass>
      <View style={s.between}><View><Text style={s.eyebrow}>THIS WEEK</Text><Text style={s.cardTitle}>{d.weekAnswers ? `${d.weekAnswers} answers · ${d.weekDays} of 7 days` : 'A fresh week'}</Text></View><Icon name="pulse-outline" color={C.blue} /></View>
      <View style={s.bars} accessible accessibilityLabel={`Activity in the last 7 days: ${d.week.map(w => w.count).join(', ')} answers`}>
        {d.week.map(w => <View key={w.key} style={s.barCol}>
          <View style={s.barSlot}><LinearGradient colors={w.today ? ['#6d8dff', '#245ee6'] : ['#b9cdf5', '#8eaeea']} style={[s.bar, {height: w.count ? `${Math.max(12, (w.count / d.weekMax) * 100)}%` : 4, opacity: w.count ? 1 : 0.5}]} /></View>
          <Text style={[s.barLabel, w.today && {color: C.blue, fontWeight: '900'}]}>{w.label}</Text>
        </View>)}
      </View>
      {!d.weekAnswers && <Text style={s.caption}>Answer one quiz question to start a streak. Streaks count days you practise, in your local time.</Text>}
    </Glass>

    <Glass>
      <View style={s.between}><View><Text style={s.eyebrow}>LEARNING PATH</Text><Text style={s.cardTitle}>{d.cleared} of {stages.length} levels cleared</Text></View><Pressable accessibilityRole="button" onPress={onPlay} style={s.linkRow}><Text style={s.link}>Play</Text><Icon name="arrow-forward" size={16} color={C.blue} /></Pressable></View>
      <View style={s.path}>
        {stages.map((g, i) => {const best = p.best[g.id]; const done = (best ?? 0) >= 60; const open = unlocked(i, p.best); return <React.Fragment key={g.id}>
          {i > 0 && <View style={[s.pathLine, done && {backgroundColor: g.color}]} />}
          <View accessible accessibilityLabel={`${g.name}: ${done ? `cleared, best ${best}%` : open ? 'unlocked' : 'locked'}`} style={[s.node, done ? {backgroundColor: g.color, borderColor: g.color} : open ? {borderColor: g.color} : null]}>
            <Icon name={done ? 'checkmark' : open ? g.icon : 'lock-closed'} size={done ? 20 : 17} color={done ? '#fff' : open ? g.color : C.muted} />
          </View>
        </React.Fragment>;})}
      </View>
      <View style={s.reviewRow}>
        <View style={s.reviewIcon}><Icon name="repeat" color={C.teal} size={20} /></View>
        <View style={{flex: 1}}><Text style={s.rowTitle}>{d.due ? `${d.due} ${d.due === 1 ? 'word is' : 'words are'} ready to review` : d.reviewing ? 'Reviews are scheduled' : 'Your review queue is empty'}</Text><Text style={s.caption}>{d.reviewing ? `${d.reviewing} words tracked with spaced repetition` : 'Words you answer in quizzes come back when due.'}</Text></View>
        {d.due > 0 && <Pressable accessibilityRole="button" onPress={onReview} style={s.smallCta}><Text style={s.smallCtaText}>Review</Text></Pressable>}
      </View>
    </Glass>

    {d.attempts.length > 0 && <Glass>
      <View style={s.between}><Text style={s.eyebrow}>RECENT ROUNDS</Text><Text style={s.caption}>{d.attempts.length} saved</Text></View>
      {d.attempts.slice(0, 3).map((a, i) => {const pct = Math.round((a.score / a.total) * 100); return <View key={i} style={s.attempt}>
        <View style={{flex: 1}}><Text style={s.rowTitle} numberOfLines={1}>{stageName(a.stage)}</Text><Text style={s.caption}>{ago(now - a.at)}</Text></View>
        <View style={[s.scorePill, {backgroundColor: pct >= 60 ? '#e1f5e9' : '#fff1e6'}]}><Text style={[s.scoreText, {color: pct >= 60 ? '#13684a' : '#97501c'}]}>{a.score}/{a.total}</Text></View>
      </View>;})}
    </Glass>}

    <View style={{gap: 12}}>
      <Text style={s.sectionTitle}>Your little wins</Text>
      <View style={s.badges}>{d.badges.map(b => <View key={b.label} accessible accessibilityLabel={`${b.label}: ${b.earned ? 'earned' : 'not yet. ' + b.hint}`} style={[s.badge, !b.earned && {opacity: 0.55}]}>
        <LinearGradient colors={b.earned ? ['#fff4d6', '#ffe1a3'] : ['#f1f5fa', '#e3eaf3']} style={s.medal}><Icon name={b.earned ? b.icon : (b.icon + '-outline') as IconName} size={24} color={b.earned ? '#a2681a' : C.muted} /></LinearGradient>
        <Text style={s.badgeText} numberOfLines={1}>{b.label}</Text>
        <Text style={s.fine}>{b.earned ? 'Earned' : b.hint}</Text>
      </View>)}</View>
    </View>

    {d.recent.length > 0 && <Glass>
      <Text style={s.eyebrow}>RECENTLY VIEWED</Text>
      <View style={s.wrap}>{d.recent.map(t => <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`Open ${t.expression}`} onPress={() => onOpenTerm(t)} style={s.recentChip}><Text style={s.recentText} numberOfLines={1}>{t.expression}</Text></Pressable>)}</View>
    </Glass>}

    <Glass style={{padding: 8}}>
      <Row icon={signedInEmail ? 'person-circle-outline' : 'log-in-outline'} title="My account" description={signedInEmail ? `Signed in · ${syncLabel.toLowerCase()}` : 'Optional · back up and sync'} onPress={() => onOpen('login')} />
      <Row icon="bookmarks-outline" title="My saved words" description={`${p.saved.length} expressions in your pocket`} onPress={onSavedWords} />
      <Row icon="shield-checkmark-outline" title="Threat Shield" description="Privacy, security & your data" onPress={() => onOpen('privacy')} />
      <Row icon="download-outline" title="Export learning data" description="A copy of your saves and progress" onPress={() => onOpen('export')} />
      <Row icon="chatbubble-ellipses-outline" title="Send feedback" description="Tell us what to improve" onPress={() => onOpen('feedback')} />
      <Row icon="help-buoy-outline" title="Where do I start?" onPress={() => onOpen('guide')} />
    </Glass>
    <Text style={s.fine}>GenZ Code · {APP_VERSION} · {terms.length.toLocaleString()} entries{terms.length !== contentManifest.uniqueEntries ? ' (includes published updates)' : ''}</Text>
  </>;
}

function Stat({icon, tint, bg, value, label, sub, onPress}: {icon: IconName; tint: string; bg: string; value: string; label: string; sub: string; onPress?: () => void}) {
  const body = <><View style={s.statTop}><View style={[s.statIcon, {backgroundColor: bg}]}><Icon name={icon} color={tint} size={19} /></View><Text style={s.statValue} numberOfLines={1}>{value}</Text></View><Text style={s.statLabel}>{label}</Text><Text style={s.fine} numberOfLines={1}>{sub}</Text></>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={s.stat}>{body}</Pressable> : <View accessible accessibilityLabel={`${label}: ${value}. ${sub}`} style={s.stat}>{body}</View>;
}
function Row({icon, title, description, onPress}: {icon: IconName; title: string; description?: string; onPress: () => void}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={s.settingRow}><View style={s.miniIcon}><Icon name={icon} color={C.blue} /></View><View style={{flex: 1, gap: 3}}><Text style={s.rowTitle}>{title}</Text>{description && <Text style={s.caption} numberOfLines={1}>{description}</Text>}</View><Icon name="chevron-forward" size={17} color={C.muted} /></Pressable>;
}

const s = StyleSheet.create({
  hero: {borderRadius: 30, padding: 22, gap: 18, overflow: 'hidden', shadowColor: '#3b3fb0', shadowOffset: {width: 0, height: 12}, shadowOpacity: 0.25, shadowRadius: 22, elevation: 8},
  orb: {position: 'absolute', borderRadius: 200, backgroundColor: 'rgba(255,255,255,.12)'},
  heroRow: {flexDirection: 'row', alignItems: 'center', gap: 16},
  avatarRing: {width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: 'rgba(255,255,255,.85)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.15)'},
  editBadge: {position: 'absolute', right: -2, bottom: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: {width: 0, height: 2}, elevation: 3},
  heroEyebrow: {fontSize: 10, fontWeight: '800', letterSpacing: 1.6, color: 'rgba(255,255,255,.75)'},
  heroName: {fontSize: 27, fontWeight: '900', letterSpacing: -0.8, color: '#fff'},
  rankPill: {alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,.3)'},
  rankText: {color: '#fff', fontSize: 12, fontWeight: '800'},
  xpTrack: {height: 9, borderRadius: 9, backgroundColor: 'rgba(255,255,255,.25)', overflow: 'hidden'},
  xpFill: {height: 9, borderRadius: 9, backgroundColor: '#fff'},
  heroSmall: {color: 'rgba(255,255,255,.88)', fontSize: 12, fontWeight: '700'},
  syncChip: {flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: 16, backgroundColor: 'rgba(14,20,70,.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,.22)'},
  syncText: {flex: 1, color: '#fff', fontSize: 13, fontWeight: '700'},
  between: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 12},
  stat: {flexBasis: '47%', flexGrow: 1, backgroundColor: 'rgba(255,255,255,.72)', borderRadius: 22, paddingVertical: 14, paddingHorizontal: 15, gap: 2, borderWidth: 1.5, borderColor: '#fff', shadowColor: '#3e6c9a', shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.08, shadowRadius: 12, elevation: 2},
  statTop: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6},
  statIcon: {width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  statValue: {flex: 1, fontSize: 26, fontWeight: '900', color: C.ink, letterSpacing: -0.6},
  statLabel: {fontSize: 13, fontWeight: '800', color: C.ink},
  eyebrow: {fontSize: 10, fontWeight: '800', letterSpacing: 1.6, color: C.blue},
  cardTitle: {fontSize: 18, fontWeight: '800', color: C.ink, letterSpacing: -0.3, marginTop: 3},
  sectionTitle: {fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: C.ink},
  bars: {flexDirection: 'row', gap: 8, height: 112, alignItems: 'flex-end'},
  barCol: {flex: 1, alignItems: 'center', gap: 6, height: '100%'},
  barSlot: {flex: 1, width: '100%', justifyContent: 'flex-end', alignItems: 'center'},
  bar: {width: '72%', maxWidth: 30, borderRadius: 9},
  barLabel: {fontSize: 11, color: C.muted, fontWeight: '700'},
  linkRow: {flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44},
  link: {fontSize: 14, color: C.blue, fontWeight: '800'},
  path: {flexDirection: 'row', alignItems: 'center', paddingVertical: 4},
  pathLine: {flex: 1, height: 3, borderRadius: 3, backgroundColor: '#d3dfee', marginHorizontal: 4},
  node: {width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#cbd8e8', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center'},
  reviewRow: {flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: '#eef6f8'},
  reviewIcon: {width: 38, height: 38, borderRadius: 13, backgroundColor: '#d9f0ef', alignItems: 'center', justifyContent: 'center'},
  smallCta: {minHeight: 40, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.blue, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: '#1647bd'},
  smallCtaText: {color: '#fff', fontWeight: '800', fontSize: 13},
  rowTitle: {fontSize: 15, fontWeight: '800', color: C.ink},
  caption: {fontSize: 12, lineHeight: 18, color: C.muted},
  fine: {fontSize: 11, lineHeight: 16, color: '#5c7189'},
  attempt: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6},
  scorePill: {paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999},
  scoreText: {fontSize: 13, fontWeight: '900'},
  badges: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  badge: {flexBasis: '30%', flexGrow: 1, alignItems: 'center', gap: 5, paddingVertical: 12, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.55)', borderWidth: 1, borderColor: '#fff'},
  medal: {width: 52, height: 52, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff'},
  badgeText: {fontSize: 11, fontWeight: '800', color: C.ink, textAlign: 'center'},
  wrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  recentChip: {minHeight: 40, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 14, backgroundColor: '#e8f0fc', borderWidth: 1, borderColor: '#d2e0f3', maxWidth: 180},
  recentText: {fontSize: 14, fontWeight: '800', color: C.blue},
  settingRow: {padding: 14, minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 13},
  miniIcon: {width: 40, height: 40, borderRadius: 14, backgroundColor: '#e3eeff', alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: '#fff'},
});
