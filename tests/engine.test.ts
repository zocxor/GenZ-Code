import {test} from 'node:test';
import assert from 'node:assert/strict';
import {search,decode,review} from '../src/engine';
import {terms} from '../src/content';
test('exact matches rank first; meaning and typo search work',()=>{assert.equal(search('idk')[0]?.id,'idk');assert.equal(search('suz')[0]?.id,'sus');assert.equal(search('Right now')[0]?.id,'rn');assert.equal(search('143')[0]?.id,'143');});
test('language and category filters combine',()=>{assert(search('', 'Regional','Roman Urdu').every(t=>t.language==='Roman Urdu'&&t.category==='Regional'));assert(search('idk','Emoji').every(t=>t.categories.includes('Emoji')));});
test('decoder preserves every original character',()=>{for(const m of ['bruh 😭 idk what u mean rn, ttyl','kya scene hai?','suspend useful','💀😭','Hello\n  world!'])assert.equal(decode(m).segments.map(s=>s.text).join(''),m);assert.equal(decode('suspend useful').recognized,0);assert.equal(decode('kya scene hai?').recognized,1);assert.equal(decode('💀😭').recognized,2);});
test('mastery requires spaced reviews and drops on error',()=>{let p=review(undefined,true,1000);assert.equal(p.mastery,20);assert.deepEqual(review(p,true,2000),p);p=review(p,true,p.nextReview);assert.equal(p.mastery,40);p=review(p,false,p.nextReview);assert.equal(p.mastery,20);assert.equal(p.nextReview-p.lastReviewed,600000);});
test('content ids are unique and all records have provenance status and context caution',()=>{assert.equal(new Set(terms.map(t=>t.id)).size,terms.length);assert(terms.every(t=>t.caution&&t.meaning&&t.status&&t.categories.length));});
