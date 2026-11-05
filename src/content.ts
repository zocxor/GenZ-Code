import library from './data/library.json';
import manifest from './data/manifest.json';
export type Source = {name: string; url: string; license: string; date: string};
export type Sense = {definition: string; category: string; source?: Source | null; labels: string[]};
export type Term = {id: string; expression: string; full: string; meaning: string; category: string; categories: string[]; language: string; region: string; tone: string; example: string; reply: string; caution: string; aliases: string[]; status: 'Source checked' | 'Authored draft' | 'Imported reference' | 'Standard reference' | 'Editor reviewed'; source?: Source | null; senses: Sense[]; priority: number; decode: boolean; decoderAliases: string[]; numericContext?: boolean; sensitivity: string; keywords: string[]; subcategory?: string; contentVersion?: number};

/** The bundled library shipped in the APK. Never modified at runtime. */
export const bundledTerms = library as Term[];
export const contentManifest = manifest;
export const categories = ['All', 'Chat', 'Numbers', 'Social', 'Emoji', 'Gaming', 'Campus', 'Work', 'Regional'];
export const categoryLabels: Record<string, string> = {All: 'All', Chat: 'Chat codes', Numbers: 'Numbers', Social: 'Social & internet', Emoji: 'Emoji & symbols', Gaming: 'Gaming', Campus: 'Campus & study', Work: 'Work & business', Regional: 'Regional English + Urdu'};

/**
 * Live content = bundled library + published CMS overlay (additions, edits, removals).
 * These are ES live bindings: importers always read the current value.
 */
export let terms: Term[] = bundledTerms;
export let termsById = new Map(terms.map(t => [t.id, t]));
export let categoryCounts: Record<string, number> = computeCounts(terms);
export let contentRevision = 0;
export let overlayStats = {added: 0, updated: 0, removed: 0};

function computeCounts(list: Term[]): Record<string, number> {
  const counts: Record<string, number> = {All: list.length};
  for (const t of list) for (const c of t.categories) counts[c] = (counts[c] ?? 0) + 1;
  return counts;
}
const listeners = new Set<() => void>();
export function onContentChange(fn: () => void) {listeners.add(fn); return () => {listeners.delete(fn);};}

/** Apply an already-validated overlay. Bundled records are preserved underneath it. */
export function applyOverlay(entries: Term[], removedIds: string[]) {
  const map = new Map(bundledTerms.map(t => [t.id, t]));
  let added = 0, updated = 0, removed = 0;
  for (const id of removedIds) if (map.delete(id)) removed++;
  for (const t of entries) {if (map.has(t.id)) updated++; else added++; map.set(t.id, t);}
  terms = [...map.values()];
  termsById = new Map(terms.map(t => [t.id, t]));
  categoryCounts = computeCounts(terms);
  overlayStats = {added, updated, removed};
  contentRevision++;
  for (const fn of [...listeners]) fn();
}
