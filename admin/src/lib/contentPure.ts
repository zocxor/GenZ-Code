/** Pure CMS helpers (no Firebase): merging, duplicate detection, ID generation, import planning. */
import {validateEntry, normalizeTerm, SlangEntry, ContentStatus, ID_PATTERN} from '../../../shared/contentSchema';
import type {Timestamp} from 'firebase/firestore/lite';

export type BundledEntry = {id: string; expression: string; full: string; meaning: string; example: string; category: string; categories: string[]; language: string; region: string; tone: string; aliases: string[]; sensitivity: string; caution: string; status: string};
export type CmsDoc = SlangEntry & {status: ContentStatus; version: number; createdAt?: Timestamp; updatedAt?: Timestamp; updatedBy?: string};
export type Row = {id: string; term: string; meaning: string; category: string; language: string; source: 'bundled' | 'cms'; status: ContentStatus | 'bundled'; version: number; updatedAt: number; cms?: CmsDoc; bundled?: BundledEntry};

export const bundledToEntry = (b: BundledEntry): SlangEntry => ({id: b.id, term: b.expression, full: b.full, meaning: b.meaning, example: b.example, category: b.category as SlangEntry['category'], subcategory: '', variations: b.aliases, region: b.region, tone: b.tone, language: (b.language === 'Roman Urdu' || b.language === 'Urdu' || b.language === 'Universal' ? b.language : 'English') as SlangEntry['language'], sensitivity: b.sensitivity === 'Caution' ? 'Caution' : 'None', caution: b.caution});

/** Merge bundled entries with CMS working copies; a CMS doc with the same id overrides. */
export function mergeRows(bundled: BundledEntry[], cms: CmsDoc[]): Row[] {
  const byId = new Map<string, Row>();
  for (const b of bundled) byId.set(b.id, {id: b.id, term: b.expression, meaning: b.meaning, category: b.category, language: b.language, source: 'bundled', status: 'bundled', version: 0, updatedAt: 0, bundled: b});
  for (const c of cms) byId.set(c.id, {id: c.id, term: c.term, meaning: c.meaning, category: c.category, language: c.language, source: 'cms', status: c.status, version: c.version, updatedAt: c.updatedAt?.toMillis() ?? 0, cms: c, bundled: byId.get(c.id)?.bundled});
  return [...byId.values()];
}

/** Duplicate detection by normalised term and variations (case, quotes, emoji VS16, spacing). */
export function buildTermIndex(rows: Row[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const add = (k: string, id: string) => {if (!k) return; const a = index.get(k) ?? []; if (!a.includes(id)) a.push(id); index.set(k, a);};
  for (const r of rows) {
    if (r.status === 'archived') continue;
    add(normalizeTerm(r.term), r.id);
    for (const v of r.cms?.variations ?? r.bundled?.aliases ?? []) add(normalizeTerm(v), r.id);
  }
  return index;
}
export function findDuplicates(index: Map<string, string[]>, entry: Pick<SlangEntry, 'term' | 'variations'>, selfId?: string): string[] {
  const ids = new Set<string>();
  for (const k of [entry.term, ...entry.variations].map(normalizeTerm)) for (const id of index.get(k) ?? []) if (id !== selfId) ids.add(id);
  return [...ids];
}
export function slugId(term: string, rand = Math.random): string {
  const slug = normalizeTerm(term).normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'entry';
  const id = `cms-${slug}-${Math.floor(rand() * 36 ** 4).toString(36).padStart(4, '0')}`;
  return ID_PATTERN.test(id) ? id : `cms-entry-${Date.now().toString(36)}`;
}

export type ImportRow = {line: number; ok: boolean; errors: string[]; entry?: SlangEntry; duplicateOf: string[]};
/** Validate an import batch: schema, duplicates against the library, and duplicates within the file. */
export function planImport(records: unknown[], index: Map<string, string[]>, maxRows = 5000): ImportRow[] {
  if (records.length > maxRows) throw new RangeError(`Imports are limited to ${maxRows} rows per file.`);
  const seen = new Map<string, number>();
  return records.map((rec, i) => {
    const r = rec && typeof rec === 'object' ? {...(rec as Record<string, unknown>)} : {};
    if (r.term === undefined && typeof r.expression === 'string') r.term = r.expression;
    if (r.variations === undefined && r.aliases !== undefined) r.variations = r.aliases;
    delete r.id; // imported rows always get new ids; editing existing entries is done in the editor
    const v = validateEntry(r);
    if (!v.ok) return {line: i + 2, ok: false, errors: v.errors, duplicateOf: []};
    const key = normalizeTerm(v.entry.term);
    const dupes = findDuplicates(index, v.entry);
    const inFile = seen.get(key);
    seen.set(key, i + 2);
    return {line: i + 2, ok: true, errors: inFile ? [`Duplicate of line ${inFile} in this file.`] : [], entry: v.entry, duplicateOf: dupes};
  });
}

