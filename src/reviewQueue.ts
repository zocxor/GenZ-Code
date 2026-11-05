import {terms, termsById, Term} from './content';
import {Profile} from './profile';
import {Stage} from './games';
export function dueTerms(p: Profile, now = Date.now()): Term[] {return Object.entries(p.progress).filter(([id, r]) => r.attempts > 0 && r.nextReview <= now && termsById.get(id)?.sensitivity === 'None').sort((a, b) => a[1].nextReview - b[1].nextReview || a[0].localeCompare(b[0])).map(([id]) => termsById.get(id)!);}
export function reviewRound(p: Profile, now = Date.now()): Stage | null {
  const due = dueTerms(p, now).slice(0, 5); if (!due.length) return null;
  return {id: 'review', name: 'Your daily review', subtitle: 'Remember it in context', icon: 'sparkles', color: '#008493', questions: due.map((t, index) => {const answers = [t.full]; for (const x of terms) {if (x.id !== t.id && x.sensitivity === 'None' && x.full.length >= 4 && x.full.length <= 90 && !answers.some(a => a.toLowerCase() === x.full.toLowerCase())) answers.push(x.full); if (answers.length === 3) break;} const correct = index % answers.length; [answers[0], answers[correct]] = [answers[correct]!, answers[0]!]; return {termId: t.id, prompt: `Recall “${t.expression}”`, context: t.example || `In this reference · ${t.region}`, answers, correct, why: `${t.expression}: ${t.meaning} Context can change the interpretation.`};})};
}
