/**
 * Slang entry schema shared by the mobile app (validating published CMS content) and the
 * admin portal (validating edits and bulk imports). Firestore rules mirror these limits.
 * All inputs are untrusted: text is normalised, control/bidi-override characters removed,
 * lengths bounded, enums checked. Nothing here is ever rendered as HTML.
 */
export const CONTENT_CATEGORIES = ['Chat', 'Numbers', 'Social', 'Emoji', 'Gaming', 'Campus', 'Work', 'Regional'] as const;
export const CONTENT_LANGUAGES = ['English', 'Roman Urdu', 'Urdu', 'Universal'] as const;
export const CONTENT_STATUSES = ['draft', 'in_review', 'published', 'archived'] as const;
export const SENSITIVITY = ['None', 'Caution'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export const LIMITS = {term: 60, full: 120, meaning: 500, example: 300, subcategory: 40, variation: 60, variations: 20, region: 80, tone: 60, caution: 300} as const;
export const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;

export type SlangEntry = {
  id: string; term: string; full: string; meaning: string; example: string;
  category: (typeof CONTENT_CATEGORIES)[number]; subcategory: string; variations: string[];
  region: string; tone: string; language: (typeof CONTENT_LANGUAGES)[number];
  sensitivity: (typeof SENSITIVITY)[number]; caution: string;
};
export type ValidationResult = {ok: true; entry: SlangEntry} | {ok: false; errors: string[]};

/** Remove control characters, bidi overrides/isolates and invisible spaces. Keeps ZWJ/VS16 (emoji) and ZWNJ/LRM/RLM (Urdu text). */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u200B\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, '')
    .replace(/[\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, max);
}
export const normalizeTerm = (s: string) => cleanText(s, 200).toLocaleLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\uFE0F/g, '').replace(/\s+/g, ' ');

export function validateEntry(input: unknown, opts: {requireId?: boolean} = {}): ValidationResult {
  const errors: string[] = [];
  const r = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const id = typeof r.id === 'string' ? r.id.trim() : '';
  if ((opts.requireId || id) && !ID_PATTERN.test(id)) errors.push('id must be lowercase letters, digits, - or _ (max 80).');
  const check = (key: keyof typeof LIMITS, required: boolean) => {
    const raw = r[key];
    if (raw !== undefined && raw !== null && typeof raw !== 'string') {errors.push(`${key} must be text.`); return '';}
    const v = cleanText(raw, Number.MAX_SAFE_INTEGER);
    if (required && !v) errors.push(`${key} is required.`);
    if (v.length > LIMITS[key]) errors.push(`${key} must be at most ${LIMITS[key]} characters.`);
    return v.slice(0, LIMITS[key]);
  };
  const term = check('term', true), meaning = check('meaning', true);
  const full = check('full', false) || meaning.slice(0, LIMITS.full);
  const example = check('example', false), subcategory = check('subcategory', false), region = check('region', false), tone = check('tone', false), caution = check('caution', false);
  const category = String(r.category ?? '');
  if (!(CONTENT_CATEGORIES as readonly string[]).includes(category)) errors.push(`category must be one of ${CONTENT_CATEGORIES.join(', ')}.`);
  const language = String(r.language ?? 'English');
  if (!(CONTENT_LANGUAGES as readonly string[]).includes(language)) errors.push(`language must be one of ${CONTENT_LANGUAGES.join(', ')}.`);
  const sensitivity = String(r.sensitivity ?? 'None');
  if (!(SENSITIVITY as readonly string[]).includes(sensitivity)) errors.push('sensitivity must be None or Caution.');
  let variations: string[] = [];
  const rawVar = r.variations;
  if (Array.isArray(rawVar)) variations = rawVar.map(v => cleanText(v, LIMITS.variation));
  else if (typeof rawVar === 'string') variations = rawVar.split(/[;|]/).map(v => cleanText(v, LIMITS.variation));
  else if (rawVar !== undefined && rawVar !== null) errors.push('variations must be a list.');
  variations = [...new Set(variations.filter(Boolean))];
  if (variations.length > LIMITS.variations) errors.push(`At most ${LIMITS.variations} variations.`);
  if (/^[=+\-@]/.test(term)) errors.push('term must not start with = + - or @ (spreadsheet formula injection).');
  if (/<\s*\/?\s*(script|iframe|img|svg|object|embed|style|a)\b|javascript:/i.test([term, full, meaning, example].join(' '))) errors.push('HTML or script content is not allowed.');
  if (errors.length) return {ok: false, errors};
  return {ok: true, entry: {id, term, full, meaning, example, category: category as SlangEntry['category'], subcategory, variations: variations.slice(0, LIMITS.variations), region: region || 'Context-dependent', tone: tone || 'Context-dependent', language: language as SlangEntry['language'], sensitivity: sensitivity as SlangEntry['sensitivity'], caution: caution || 'Meaning depends on context and community. Ask if you are unsure.'}};
}

/** Neutralise spreadsheet formula injection when exporting CSV. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : Array.isArray(value) ? value.join(';') : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/** RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). Bounded to protect the browser. */
export function parseCsv(text: string, maxRows = 20000): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {if (src[i + 1] === '"') {field += '"'; i++;} else quoted = false;}
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') {row.push(field); field = '';}
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
      if (rows.length > maxRows + 1) throw new RangeError(`CSV exceeds ${maxRows} rows.`);
    } else field += c;
  }
  if (quoted) throw new SyntaxError('Unterminated quoted field.');
  row.push(field);
  if (row.some(x => x !== '')) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map(h => h.trim().toLowerCase());
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}
