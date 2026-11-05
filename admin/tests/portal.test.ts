import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeRows, buildTermIndex, findDuplicates, planImport, slugId, BundledEntry, CmsDoc} from '../src/lib/contentPure';
import {retention, versionShare} from '../src/lib/metricsPure';
import {can, PERMISSIONS, ROLES} from '../src/rbac';
import {validateEntry, parseCsv, csvCell, cleanText, ID_PATTERN} from '../../shared/contentSchema';

const bundled = JSON.parse(readFileSync(new URL('../../src/data/library.json', import.meta.url), 'utf8')).map((t: Record<string, unknown>) => ({...t})) as BundledEntry[];

test('CMS view preserves every bundled entry and overlays CMS copies by id', () => {
  const cms = [{id: bundled[0]!.id, term: 'edited', meaning: 'm', status: 'draft', version: 2, category: 'Chat', language: 'English', variations: []} as unknown as CmsDoc, {id: 'cms-new-0001', term: 'delulu', meaning: 'x', status: 'published', version: 1, category: 'Social', language: 'English', variations: []} as unknown as CmsDoc];
  const rows = mergeRows(bundled, cms);
  assert.equal(rows.length, bundled.length + 1);
  const edited = rows.find(r => r.id === bundled[0]!.id)!;
  assert.equal(edited.term, 'edited');
  assert.ok(edited.bundled, 'bundled original kept for reference');
  assert.equal(rows.filter(r => r.source === 'bundled').length, bundled.length - 1);
});

test('duplicate detection is case/quote/emoji-variation insensitive and checks variations', () => {
  const rows = mergeRows(bundled, []);
  const index = buildTermIndex(rows);
  assert.ok(findDuplicates(index, {term: 'RIZZ', variations: []}).length >= 1);
  assert.ok(findDuplicates(index, {term: '  idk ', variations: []}).length >= 1);
  assert.equal(findDuplicates(index, {term: 'zzqq-not-a-word', variations: []}).length, 0);
  const idk = findDuplicates(index, {term: 'idk', variations: []});
  assert.equal(findDuplicates(index, {term: 'idk', variations: []}, idk[0]).includes(idk[0]!), false, 'self excluded');
});

test('import planning validates, sanitises, flags existing and in-file duplicates', () => {
  const index = buildTermIndex(mergeRows(bundled, []));
  const plan = planImport([
    {term: 'brand-new-term-xyz', meaning: 'A new meaning', category: 'Chat'},
    {term: 'brand-new-term-xyz', meaning: 'Again', category: 'Chat'},
    {term: 'rizz', meaning: 'Charm', category: 'Social'},
    {term: '=HYPERLINK("http://evil")', meaning: 'x', category: 'Chat'},
    {term: '<script>alert(1)</script>', meaning: 'x', category: 'Chat'},
    {term: 'ok', meaning: 'x', category: 'NotACategory'},
    {term: 'x'.repeat(61), meaning: 'x', category: 'Chat'},
    {expression: 'alias-row-qq', aliases: 'a1;a2', meaning: 'via bundled field names', category: 'Work'},
  ], index);
  assert.equal(plan[0]!.ok && !plan[0]!.errors.length && !plan[0]!.duplicateOf.length, true);
  assert.match(plan[1]!.errors[0]!, /Duplicate of line 2/);
  assert.ok(plan[2]!.duplicateOf.length > 0);
  for (const i of [3, 4, 5, 6]) assert.equal(plan[i]!.ok, false, `row ${i} rejected`);
  assert.deepEqual(plan[7]!.entry!.variations, ['a1', 'a2']);
  assert.throws(() => planImport(new Array(5001).fill({}), index), RangeError);
});

test('content text sanitiser removes control and bidi-override characters but keeps emoji and Urdu joiners', () => {
  const rlo = String.fromCharCode(0x202e), zwj = String.fromCharCode(0x200d), zwnj = String.fromCharCode(0x200c), nul = String.fromCharCode(0);
  assert.equal(cleanText(`a${rlo}b${nul}c`, 50), 'abc');
  const family = `\u{1F468}${zwj}\u{1F469}`;
  assert.equal(cleanText(family, 50), family);
  assert.equal(cleanText(`می${zwnj}خواهم`, 50), `می${zwnj}خواهم`);
  const v = validateEntry({term: `  hi${rlo} `, meaning: 'm', category: 'Chat'});
  assert.ok(v.ok && v.entry.term === 'hi');
});

test('CSV parsing handles quotes, commas, newlines and BOM; export neutralises formulas', () => {
  const rows = parseCsv('﻿term,meaning,category\r\n"no cap","Not lying, honestly",Chat\n"multi\nline","say ""hi""",Social\n');
  assert.deepEqual(rows[0], {term: 'no cap', meaning: 'Not lying, honestly', category: 'Chat'});
  assert.equal(rows[1]!.term, 'multi\nline');
  assert.equal(rows[1]!.meaning, 'say "hi"');
  assert.throws(() => parseCsv('a\n"unterminated'), SyntaxError);
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell(['x', 'y']), 'x;y');
});

test('generated content ids are valid and collision-resistant', () => {
  const ids = new Set(Array.from({length: 500}, () => slugId('No Cap 🧢')));
  assert.ok(ids.size > 495);
  for (const id of ids) assert.ok(ID_PATTERN.test(id), id);
  assert.ok(ID_PATTERN.test(slugId('😭')));
});

test('retention counts only users old enough for each day, from real timestamps', () => {
  const day = 86400_000, now = 100 * day;
  const users = [
    {createdAt: now - 40 * day, lastActiveAt: now - 1 * day},   // retained d1,d7,d30
    {createdAt: now - 40 * day, lastActiveAt: now - 39.5 * day}, // churned day 0
    {createdAt: now - 10 * day, lastActiveAt: now - 2 * day},    // eligible d1,d7 → retained both
    {createdAt: now - 3 * day, lastActiveAt: now},               // eligible d1 only
  ];
  const r = retention(users, now, [1, 7, 30]);
  assert.deepEqual(r.map(x => [x.eligible, x.retained]), [[4, 3], [3, 2], [2, 1]]);
  assert.equal(retention([], now, [7])[0]!.rate, null);
  assert.deepEqual(versionShare(['0.8.0', '0.8.0', '', '0.7.0']), [{version: '0.8.0', count: 2}, {version: 'unknown', count: 1}, {version: '0.7.0', count: 1}]);
});

test('RBAC matrix: least privilege per role', () => {
  assert.ok(ROLES.every(r => can(r, 'dashboard.read')));
  assert.equal(can('analyst', 'users.pii'), false);
  assert.equal(can('analyst', 'content.write'), false);
  assert.equal(can('moderator', 'content.publish'), false);
  assert.equal(can('content_manager', 'users.read'), false);
  assert.equal(can('support_admin', 'content.write'), false);
  assert.ok(ROLES.filter(r => can(r, 'admins.manage')).every(r => r === 'super_admin'));
  assert.ok(ROLES.filter(r => can(r, 'audit.read')).every(r => r === 'super_admin'));
  assert.equal(new Set(PERMISSIONS.super_admin).size, PERMISSIONS.super_admin.length);
  assert.equal(can(null, 'dashboard.read'), false);
});
