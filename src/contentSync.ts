/**
 * Remote content delivery: published CMS entries reach the app without an APK update.
 *
 * - Only `publishedContent` documents are readable by the public (rules); drafts never leave
 *   the admin side. Each entry is validated with the shared schema before use.
 * - The validated overlay is cached on the device, so updates keep working offline.
 * - Bundled entries are never modified; edits overlay them and removals hide them.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {applyOverlay, bundledTerms, Term} from './content';
import {validateEntry, ID_PATTERN} from '../shared/contentSchema';
import type {SecurityEventLog} from './secure/events';
import {logger} from './secure/logger';

export const OVERLAY_KEY = 'genz-code-content-overlay';
const REFRESH_EVERY = 6 * 3600_000, PAGE = 300, MAX_ENTRIES = 5000;
type Cached = {cursor: number; cursorId: string; checkedAt: number; entries: Record<string, Term | {removed: true}>};
let cache: Cached = {cursor: 0, cursorId: '', checkedAt: 0, entries: {}};
let refreshing: Promise<number> | null = null;
const bundledById = new Map(bundledTerms.map(t => [t.id, t]));

/** Convert a validated published document into an app Term, keeping bundled provenance. */
export function toTerm(raw: unknown): Term | {removed: true} | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ID_PATTERN.test(r.id)) return null;
  if (r.status === 'archived') return {removed: true};
  if (r.status !== 'published') return null;
  const v = validateEntry(r, {requireId: true});
  if (!v.ok) return null;
  const e = v.entry, base = bundledById.get(e.id);
  const version = typeof r.version === 'number' && Number.isInteger(r.version) ? r.version : 1;
  return {
    ...(base ?? {source: null, senses: [], keywords: [], decoderAliases: [], reply: '', priority: 120, numericContext: /^\d+$/.test(e.term)}),
    id: e.id, expression: e.term, full: e.full, meaning: e.meaning, example: e.example,
    category: e.category, categories: base ? [...new Set([e.category, ...base.categories])] : [e.category],
    subcategory: e.subcategory, aliases: e.variations, region: e.region, tone: e.tone, language: e.language,
    sensitivity: e.sensitivity, caution: e.caution, status: 'Editor reviewed', decode: e.term.length > 1, contentVersion: version,
  } as Term;
}
function apply() {
  const entries: Term[] = [], removed: string[] = [];
  for (const [id, t] of Object.entries(cache.entries)) {if ('removed' in t) removed.push(id); else entries.push(t);}
  applyOverlay(entries, removed);
}

export async function loadContentOverlay() {
  try {
    const raw = await AsyncStorage.getItem(OVERLAY_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Cached;
    if (!parsed || typeof parsed.cursor !== 'number' || typeof parsed.entries !== 'object') return;
    const entries: Cached['entries'] = {};
    for (const [id, t] of Object.entries(parsed.entries).slice(0, MAX_ENTRIES)) {
      if (!ID_PATTERN.test(id)) continue;
      if (t && 'removed' in t) entries[id] = {removed: true};
      else {const term = toTerm({...t, term: (t as Term).expression, variations: (t as Term).aliases, id, status: 'published', version: (t as Term).contentVersion}); if (term) entries[id] = term;}
    }
    cache = {cursor: parsed.cursor, cursorId: typeof parsed.cursorId === 'string' ? parsed.cursorId : '', checkedAt: parsed.checkedAt || 0, entries};
    apply();
  } catch {logger.warn('content', 'Cached content overlay ignored');}
}

/** Fetch published changes since the last cursor. Throttled; returns number of changes. */
export function refreshContent(log?: SecurityEventLog, force = false): Promise<number> {
  if (refreshing) return refreshing;
  if (!force && Date.now() - cache.checkedAt < REFRESH_EVERY) return Promise.resolve(0);
  refreshing = (async () => {
    const [{collection, query, where, orderBy, startAfter, limit, getDocs, documentId, Timestamp}, {cloudDb}] = await Promise.all([import('firebase/firestore/lite'), import('./firebase/app')]);
    // Cursor = (updatedAt, id) so entries published in the same batch are never skipped.
    let changes = 0, rejected = 0, cursor = cache.cursor, cursorId = cache.cursorId;
    const entries = {...cache.entries};
    for (let page = 0; page < 20; page++) {
      const snap = await getDocs(query(collection(cloudDb(), 'publishedContent'), where('status', 'in', ['published', 'archived']), orderBy('updatedAt'), orderBy(documentId()), startAfter(Timestamp.fromMillis(cursor), cursorId), limit(PAGE)));
      for (const d of snap.docs) {
        const data = d.data();
        const at = data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : 0;
        const t = d.id === data.id ? toTerm(data) : null;
        if (t) {entries[d.id] = t; changes++;} else rejected++;
        if (at > cursor || (at === cursor && d.id > cursorId)) {cursor = at; cursorId = d.id;}
      }
      if (snap.docs.length < PAGE) break;
    }
    if (rejected) void log?.record('content_validation_rejected', `count:${rejected}`);
    cache = {cursor, cursorId, checkedAt: Date.now(), entries: Object.fromEntries(Object.entries(entries).slice(0, MAX_ENTRIES))};
    await AsyncStorage.setItem(OVERLAY_KEY, JSON.stringify(cache));
    if (changes) apply();
    return changes;
  })().catch(() => 0).finally(() => {refreshing = null;});
  return refreshing;
}
export const contentCacheInfo = () => ({cursor: cache.cursor, checkedAt: cache.checkedAt, entries: Object.keys(cache.entries).length});
