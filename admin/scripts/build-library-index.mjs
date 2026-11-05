// Slim, read-only copy of the bundled dictionary for the CMS (same public content as the APK).
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
const lib = JSON.parse(readFileSync(new URL('../../src/data/library.json', import.meta.url), 'utf8'));
const keep = ['id', 'expression', 'full', 'meaning', 'example', 'category', 'categories', 'language', 'region', 'tone', 'aliases', 'sensitivity', 'caution', 'status'];
const slim = lib.map(t => Object.fromEntries(keep.map(k => [k, t[k] ?? (k === 'aliases' || k === 'categories' ? [] : '')])));
mkdirSync(new URL('../public/', import.meta.url), {recursive: true});
writeFileSync(new URL('../public/library-index.json', import.meta.url), JSON.stringify(slim));
console.log(`library-index.json: ${slim.length} bundled entries`);
