/** Suggest-a-word, report-an-entry and feedback forms (signed-in users; server rate-limited). */
import React, {useState} from 'react';
import {View, Text, TextInput, Pressable, StyleSheet} from 'react-native';
import {C, Glass, Button, Chip, Icon} from './ui';
import {suggestWord, reportEntry, sendFeedback, REPORT_REASONS, UgcResult} from './ugc';
import {CONTENT_CATEGORIES} from '../shared/contentSchema';
import {useAccountUser} from './services';

function useSubmit() {
  const [busy, setBusy] = useState(false), [result, setResult] = useState<UgcResult | null>(null);
  const run = async (fn: () => Promise<UgcResult>) => {if (busy) return; setBusy(true); setResult(null); try {setResult(await fn());} catch {setResult({ok: false, message: 'Couldn’t send that right now. Please try again.'});} finally {setBusy(false);}};
  return {busy, result, run};
}
function SignInFirst({onSignIn, what}: {onSignIn: () => void; what: string}) {
  return <Glass><Icon name="person-circle-outline" size={32} color={C.blue} /><Text style={s.title}>Sign in to {what}</Text><Text style={s.body}>A free account keeps submissions accountable and lets us prevent spam. Your learning still works without one.</Text><Button title="Sign in or create an account" icon="log-in-outline" onPress={onSignIn} /></Glass>;
}
function Outcome({result, success}: {result: UgcResult | null; success: string}) {
  if (!result) return null;
  return <Text accessibilityRole="alert" style={result.ok ? s.ok : s.err}>{result.ok ? success : result.message}</Text>;
}

export function SuggestWordForm({onSignIn, initialTerm = ''}: {onSignIn: () => void; initialTerm?: string}) {
  const user = useAccountUser();
  const [term, setTerm] = useState(initialTerm), [meaning, setMeaning] = useState(''), [example, setExample] = useState(''), [category, setCategory] = useState('Chat');
  const {busy, result, run} = useSubmit();
  if (!user) return <SignInFirst onSignIn={onSignIn} what="suggest a word" />;
  if (result?.ok) return <Glass><Icon name="checkmark-circle" size={34} color="#13805a" /><Text style={s.title}>Thanks — suggestion received.</Text><Text style={s.body}>Editors review every suggestion before anything is published. Nothing you send appears in the app automatically.</Text></Glass>;
  return <Glass>
    <Text style={s.label}>Word or phrase</Text>
    <TextInput accessibilityLabel="Suggested word" value={term} onChangeText={setTerm} maxLength={60} autoCapitalize="none" style={s.input} placeholder="e.g. delulu" placeholderTextColor={C.muted} />
    <Text style={s.label}>What it means</Text>
    <TextInput accessibilityLabel="Meaning" value={meaning} onChangeText={setMeaning} maxLength={500} multiline style={[s.input, s.multi]} placeholder="Explain it simply and neutrally" placeholderTextColor={C.muted} />
    <Text style={s.label}>Example (optional)</Text>
    <TextInput accessibilityLabel="Example" value={example} onChangeText={setExample} maxLength={300} style={s.input} placeholder="Avoid real names or private details" placeholderTextColor={C.muted} />
    <Text style={s.label}>Category</Text>
    <View style={s.wrap}>{CONTENT_CATEGORIES.map(c => <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />)}</View>
    <Outcome result={result} success="" />
    <Button title={busy ? 'Sending…' : 'Send suggestion'} icon="paper-plane-outline" disabled={busy || !term.trim() || !meaning.trim()} onPress={() => void run(() => suggestWord({term, meaning, example, category}))} />
    <Text style={s.small}>Sent with your account ID for moderation. Don’t include personal information.</Text>
  </Glass>;
}

export function ReportForm({termId, expression, onSignIn}: {termId: string; expression: string; onSignIn: () => void}) {
  const user = useAccountUser();
  const [reason, setReason] = useState<string>(''), [note, setNote] = useState('');
  const {busy, result, run} = useSubmit();
  if (!user) return <SignInFirst onSignIn={onSignIn} what="report an entry" />;
  if (result?.ok) return <Glass><Icon name="flag" size={30} color="#13805a" /><Text style={s.title}>Report sent. Thank you.</Text><Text style={s.body}>A moderator will review “{expression}”.</Text></Glass>;
  return <Glass>
    <Text style={s.title}>What’s wrong with “{expression}”?</Text>
    <View style={s.wrap}>{REPORT_REASONS.map(r => <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />)}</View>
    <TextInput accessibilityLabel="Report details" value={note} onChangeText={setNote} maxLength={300} multiline style={[s.input, s.multi]} placeholder="Details (optional)" placeholderTextColor={C.muted} />
    <Outcome result={result} success="" />
    <Button title={busy ? 'Sending…' : 'Send report'} icon="flag-outline" disabled={busy || !reason} onPress={() => void run(() => reportEntry(termId, reason, note))} />
  </Glass>;
}

export function FeedbackForm({onSignIn}: {onSignIn: () => void}) {
  const user = useAccountUser();
  const [rating, setRating] = useState(0), [message, setMessage] = useState('');
  const {busy, result, run} = useSubmit();
  if (!user) return <SignInFirst onSignIn={onSignIn} what="send feedback" />;
  if (result?.ok) return <Glass><Icon name="heart" size={30} color="#c2417a" /><Text style={s.title}>Thanks for the feedback!</Text><Text style={s.body}>It goes straight to the GenZ Code team.</Text></Glass>;
  return <Glass>
    <Text style={s.title}>How is GenZ Code working for you?</Text>
    <View style={s.stars}>{[1, 2, 3, 4, 5].map(n => <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`} accessibilityState={{selected: rating === n}} onPress={() => setRating(n)} style={s.star}><Icon name={n <= rating ? 'star' : 'star-outline'} size={34} color="#c38a1d" /></Pressable>)}</View>
    <TextInput accessibilityLabel="Feedback message" value={message} onChangeText={setMessage} maxLength={1000} multiline style={[s.input, s.multi]} placeholder="What should we improve? (optional)" placeholderTextColor={C.muted} />
    <Outcome result={result} success="" />
    <Button title={busy ? 'Sending…' : 'Send feedback'} icon="send-outline" disabled={busy || !rating} onPress={() => void run(() => sendFeedback(rating, message))} />
    <Text style={s.small}>Includes your rating, message, app version and platform. Don’t include personal information.</Text>
  </Glass>;
}

const s = StyleSheet.create({
  title: {fontSize: 19, fontWeight: '800', color: C.ink, letterSpacing: -0.3},
  body: {fontSize: 15, lineHeight: 23, color: C.muted},
  label: {fontSize: 14, fontWeight: '800', color: C.ink},
  input: {minHeight: 52, padding: 14, borderWidth: 1, borderColor: '#bccfe6', borderRadius: 16, backgroundColor: '#e7f0fb', fontSize: 16, color: C.ink},
  multi: {minHeight: 96, textAlignVertical: 'top'},
  wrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  stars: {flexDirection: 'row', justifyContent: 'center', gap: 4},
  star: {minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center'},
  small: {fontSize: 12, lineHeight: 18, color: C.muted},
  ok: {padding: 12, borderRadius: 14, backgroundColor: '#e1f5e9', color: '#175e47'},
  err: {padding: 12, borderRadius: 14, backgroundColor: '#fff0ee', color: '#96383f', lineHeight: 20},
});

/** Single lazy entry point used by App for the three submission sheets. */
export function FormHost({kind, term, initialTerm, onSignIn}: {kind: 'feedback' | 'suggest' | 'report'; term: {id: string; expression: string} | null; initialTerm?: string; onSignIn: () => void}) {
  if (kind === 'feedback') return <FeedbackForm onSignIn={onSignIn} />;
  if (kind === 'report' && term) return <ReportForm termId={term.id} expression={term.expression} onSignIn={onSignIn} />;
  return <SuggestWordForm onSignIn={onSignIn} initialTerm={initialTerm} />;
}
