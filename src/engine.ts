import {terms, Term, onContentChange} from './content';
export const normalize = (s: string) => s.normalize('NFC').toLocaleLowerCase().replace(/[’‘]/g, "'").replace(/\ufe0f/g, '').replace(/\s+/gu, ' ').trim();
export function distance(a: string, b: string): number {let row = Array.from({length: b.length + 1}, (_, i) => i); for (let i = 1; i <= a.length; i++) {const next = [i]; for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1]! + 1, row[j]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)); row = next;} return row[b.length]!;}

type Candidate = {term: Term; key: string; phrase: boolean};
type Trie = {next: Map<string, Trie>; match?: Candidate};
type Indexed = {t: Term; word: string; aliases: string[]; text: string};
type Index = {indexed: Indexed[]; exact: Map<string, Term[]>; root: Trie};

/** Search + decoder index. Rebuilt when published content changes (not on every render). */
function buildIndex(list: Term[]): Index {
  const indexed = list.map(t => ({t, word: normalize(t.expression), aliases: t.aliases.map(normalize), text: normalize([t.full, t.meaning, ...t.senses.map(s => s.definition), ...t.keywords].join(' '))}));
  const exact = new Map<string, Term[]>();
  for (const x of indexed) for (const k of [x.word, ...x.aliases]) {const a = exact.get(k) ?? []; if (!a.some(t => t.id === x.t.id)) a.push(x.t); exact.set(k, a);}
  const root: Trie = {next: new Map()};
  const canonical = new Map(list.map(t => [normalize(t.expression), t]));
  for (const t of list) {
    if (!t.decode) continue;
    for (const value of [t.expression, ...t.aliases, ...t.decoderAliases]) {
      const key = normalize(value);
      if (!key || key.length > 90) continue;
      const canonicalOwner = canonical.get(key);
      if (canonicalOwner && canonicalOwner.id !== t.id) continue;
      let n = root;
      for (const char of key) {let child = n.next.get(char); if (!child) {child = {next: new Map()}; n.next.set(char, child);} n = child;}
      if (!n.match || n.match.term.priority < t.priority) n.match = {term: t, key, phrase: key.includes(' ')};
    }
  }
  return {indexed, exact, root};
}
let idx = buildIndex(terms);
onContentChange(() => {idx = buildIndex(terms);});

function queryMeaning(query: string) {const {exact} = idx; const raw = normalize(query.slice(0, 120)); if (exact.has(raw)) return raw; const bare = raw.replace(/[?!.]+$/, ''); if (exact.has(bare)) return bare; const cleaned = bare.replace(/^(?:what (?:does|is|are)|meaning of|define|decode|explain)\s+/, '').replace(/\s+(?:mean|means|meaning)(?: in (?:text|chat|slang))?$/, '').replace(/\s+in (?:text|chat|slang)$/, '').replace(/^["“']|["”']$/g, ''); return exact.has(cleaned) ? cleaned : raw;}
function inScope(t: Term, c: string, l: string) {return (c === 'All' || t.categories.includes(c)) && (l === 'All' || t.language === l);}
export function search(query: string, category = 'All', language = 'All'): Term[] {const {indexed, exact} = idx; const q = queryMeaning(query); const exactNumber = /^\d{2,}$/.test(q) && exact.has(q); return indexed.filter(x => inScope(x.t, category, language)).map(x => {const score = exactNumber && x.word !== q && !x.aliases.includes(q) ? 0 : !q ? 1 : x.word === q ? 1000 : x.aliases.includes(q) ? 950 : x.word.startsWith(q) ? 800 : x.aliases.some(a => a.startsWith(q)) ? 750 : x.word.includes(q) ? 650 : x.aliases.some(a => a.includes(q)) ? 600 : x.text.includes(q) ? 400 : q.length >= 3 && Math.abs(q.length - x.word.length) <= 1 && distance(q, x.word) <= 1 ? 200 : 0; return {t: x.t, score};}).filter(x => x.score > 0).sort((a, b) => b.score - a.score || b.t.priority - a.t.priority).map(x => {if (category !== 'All' && category !== x.t.category) {const sense = x.t.senses.find(s => s.category === category); if (sense) return {...x.t, category, full: sense.definition.length > 90 ? sense.definition.slice(0, 87) + '…' : sense.definition, meaning: sense.definition, source: sense.source};} return x.t;});}
export type Segment = {text: string; term?: Term};
const wordChar = (s: string) => /[\p{L}\p{N}\p{M}]/u.test(s);
function mappedFold(s: string) {let folded = ''; const start: number[] = [], end: number[] = []; let offset = 0; for (const cp of s) {const at = offset; offset += cp.length; const f = cp.normalize('NFC').toLocaleLowerCase().replace(/[’‘]/g, "'").replace(/\ufe0f/g, ''); for (const ch of f) {if (/\s/u.test(ch)) {if (folded.endsWith(' ')) {end[end.length - 1] = offset; continue;} folded += ' '; start.push(at); end.push(offset);} else {folded += ch; for (let i = 0; i < ch.length; i++) {start.push(at); end.push(offset);}}}} return {folded, start, end};}
export function decode(message: string): {segments: Segment[]; plain: string; recognized: number} {
  if (message.length > 2000) throw new RangeError('Message exceeds 2000 characters');
  const {root} = idx; const {folded, start, end} = mappedFold(message); const segments: Segment[] = []; let cursor = 0, plain = '';
  for (let i = 0; i < folded.length;) {let n = root, j = i, best: {c: Candidate; end: number} | undefined; for (const char of folded.slice(i)) {const child = n.next.get(char); if (!child) break; n = child; j += char.length; if (n.match) {const c = n.match; const before = folded.slice(0, i).at(-1) ?? ' '; const after = folded.slice(j).at(0) ?? ' '; const boundary = (!wordChar(c.key[0]!) || !wordChar(before)) && (!wordChar(c.key.at(-1)!) || !wordChar(after)); const standalone = normalize(message) === c.key; const numericOkay = !(c.term.numericContext || /^\d+$/.test(c.term.expression)) || c.phrase || standalone; if (boundary && numericOkay) best = {c, end: j};}}
    if (best) {const a = start[i]!, b = end[best.end - 1]!; if (a > cursor) {const raw = message.slice(cursor, a); segments.push({text: raw}); plain += raw;} const raw = message.slice(a, b); segments.push({text: raw, term: best.c.term}); plain += best.c.term.expression === '20' && best.c.phrase ? (message.slice(b).startsWith('?') ? 'Where are you' : 'Where are you?') : `[${best.c.term.full}]`; cursor = b; i = best.end;} else {i += String.fromCodePoint(folded.codePointAt(i)!).length;}}
  if (cursor < message.length) {const raw = message.slice(cursor); segments.push({text: raw}); plain += raw;} return {segments, plain, recognized: segments.filter(s => s.term).length};
}
export type Review = {successes: number; attempts: number; lastReviewed: number; nextReview: number; mastery: number};
export function review(previous: Review | undefined, correct: boolean, now = Date.now()): Review {const old = previous ?? {successes: 0, attempts: 0, lastReviewed: 0, nextReview: 0, mastery: 0}; if (old.lastReviewed && now < old.nextReview) return old; const successes = correct ? old.successes + 1 : Math.max(0, old.successes - 1); const days = correct ? [1, 3, 7, 14, 30][Math.min(successes - 1, 4)]! : 0; return {successes, attempts: old.attempts + 1, lastReviewed: now, nextReview: now + (correct ? days * 86400000 : 600000), mastery: Math.min(100, successes * 20)};}
