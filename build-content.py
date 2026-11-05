"""Build attributed offline reference data. Source inputs: ../content-sources.
No invented variants or arbitrary numeric codes are generated to meet counts.
"""
from pathlib import Path
import json,csv,re,hashlib,collections,unicodedata,xml.etree.ElementTree as ET,urllib.parse,os
BASE=Path(__file__).resolve().parents[1];SRC=Path(os.environ.get('GENZ_CONTENT_INPUTS',str(BASE/'content-inputs')));OUT=BASE/'src/data';OUT.mkdir(exist_ok=True)
DATE='2026-11-02'; db={};excluded=collections.Counter()
def norm(s):return unicodedata.normalize('NFKC',s).casefold().replace('’',"'").replace('‘',"'").strip()
def source(name,url,license):return {'name':name,'url':url,'license':license,'date':DATE}
def add(t):
 key=norm(t['expression'])
 if not key:return
 t.setdefault('aliases',[]);t.setdefault('categories',[t['category']]);t['categories']=list(dict.fromkeys(t['categories']));t.setdefault('senses',[]);t.setdefault('priority',1);t.setdefault('status','Imported reference');t.setdefault('example','');t.setdefault('reply','');t.setdefault('decode',False);t.setdefault('decoderAliases',[]);t.setdefault('sensitivity','None');t.setdefault('keywords',[])
 if key in db:
  old=db[key]
  old['categories']=list(dict.fromkeys(old['categories']+t['categories']))
  if t['meaning']!=old['meaning'] and all(s['definition']!=t['meaning'] for s in old['senses']) and (len(old['senses'])<4 or all(s['category']!=t['category'] for s in old['senses'])):old['senses'].append({'definition':t['meaning'],'category':t['category'],'source':t.get('source'),'labels':[t['region']]})
  old['aliases']=list(dict.fromkeys(old['aliases']+t['aliases']))[:20]
  return
 db[key]=t
for t in json.loads((SRC/'starter.json').read_text()):
 t.update(status='Authored draft',priority=100,decode=True,source=None);add(t)
for line in (SRC/'curated.tsv').read_text().splitlines():
 r=line.split('|');r+=['']*(9-len(r));word,full,meaning,cat,example,reply,aliases,caution,url=r[:9]
 k=norm(word);old=db.pop(k,None);id=old['id'] if old else 'curated-'+hashlib.sha1(k.encode()).hexdigest()[:14]
 status='Source checked' if word in ['20','10-20','67'] else 'Authored draft'
 t={'id':id,'expression':word,'full':full,'meaning':meaning,'category':cat,'language':'Roman Urdu' if cat=='Regional' else 'English','region':'South Asia / mixed chat' if cat=='Regional' else 'Context-dependent','tone':'Context-dependent','example':example,'reply':reply,'caution':caution,'aliases':aliases.split(';') if aliases else [],'priority':150,'status':status,'decode':True,'source':source('Dictionary.com' if 'dictionary.com' in url else 'Slang.net' if 'slang.net' in url else 'CyberDefinitions' if 'cyberdefinitions.com' in url else 'Slang.org' if 'slang.org' in url else 'Wiktionary reference',url,'Reference link; original GenZ Code explanation') if url else None}
 if re.fullmatch(r'\d+',word):t['numericContext']=True
 if word in ['20','10-20']:t['decoderAliases']=t['aliases']
 if word in ['555','88','520','1314','5201314']:t['region']='Language-specific numeric code; check context'
 if word=='420':t['sensitivity']='Caution'
 if old:t['categories']=list(dict.fromkeys([cat,old['category']]))
 add(t)
# Educational explanations of common potentially rude initialisms; not attack suggestions.
for w,full,meaning in [('wtf','What the f…','A vulgar expression of surprise, confusion, or frustration.'),('stfu','An aggressive request to stop talking','A vulgar command telling someone to be quiet.'),('sybau','A hostile “shut up” insult','An insulting initialism that aggressively tells someone to stop speaking.'),('pmo','Annoys me / put me on (context)','May express annoyance, or request an introduction/recommendation in “put me on”.'),('ts','This / this stuff (context)','In some online messages this is shorthand for “this” or a vulgar “this stuff”; other communities use other expansions.')]:
 add({'id':'curated-'+w,'expression':w.upper(),'full':full,'meaning':meaning,'category':'Chat','language':'English','region':'Online / varies','tone':'Sensitive / context-dependent','caution':'May be vulgar or insulting. Explained neutrally; no abusive reply is suggested. Ask for context.','priority':140,'decode':True,'sensitivity':'Caution','status':'Authored draft','source':None})
unsafe=re.compile(r'\b(?:dick\w*|piss\w*|wank\w*|bitch\w*|asshole\w*|bollock\w*|fuck\w*|shit\w*|cunt\w*|nigg\w*|fagg\w*|porn\w*|masturbat\w*|penis\w*|vagin\w*|sexual\w*|intercourse|ejaculat\w*|orgasm\w*|prostitut\w*|slut\w*|whore\w*|rape\w*|semen|genital\w*|suicid\w*|nazi\w*|cocaine|heroin|methamphetamine|incest|paedophil\w*|pedophil\w*)\b',re.I)
# Short-form data is community-imported, not automatically verified/current.
for r in csv.DictReader((SRC/'sms.csv').open()):
 word=r['Abbreviation'].strip();meaning=r['Expansion'].strip()
 if not word or len(word)>30 or len(meaning)>170 or unsafe.search(word+' '+meaning):excluded['sms-invalid-or-sensitive']+=1;continue
 if ',' in word or word in ['19','55555']:excluded['combined-or-unreviewable-row']+=1;continue
 # Ordinary single-character words should not be globally replaced.
 cat='Numbers' if any(c.isdigit() for c in word) else 'Chat'
 k=norm(word);t={'id':'sms-'+hashlib.sha1(k.encode()).hexdigest()[:14],'expression':word,'full':meaning,'meaning':meaning,'category':cat,'categories':[cat,'Chat'],'language':'English','region':'SMS / online; usage varies','tone':'Informal / context-dependent','caution':'Imported SMS reference, not independently reviewed. Some short forms are older or community-specific and have other meanings.','source':source('Will Wade — TXT/SMS abbreviations','https://huggingface.co/datasets/willwade/txt-sms-abbreviations','Apache-2.0'),'status':'Imported reference','priority':40,'decode':r.get('IsWord','').lower() not in ['true','1','yes'] and len(word)>1,'numericContext':bool(re.fullmatch(r'\d+',word)),'sensitivity':'Caution' if re.search(r'hate you|adult|sexy|hells angels',meaning,re.I) else 'None'}
 add(t)
# Wiktionary senses are available under CC BY-SA 4.0. Quotes from third-party
# publications are NOT copied. Only dictionary glosses and own examples are used.
BAD_TAGS={'offensive','derogatory','vulgar','slur','ethnic-slur','racial-slur','obsolete','archaic','dated','historical','nonstandard','eye-dialect','humorous-offensive'}
regiontags={'UK','US','Australia','Ireland','Canada','New-Zealand','India','Pakistan','Singapore','South-Africa','Nigeria','Philippines','Jamaica','Cockney','Multicultural-London-English','British','Scotland','Northern-England','Caribbean','Malaysia','New-York-City','Southern-US'}
pools=collections.defaultdict(list);urls=json.loads((SRC/'source-urls.json').read_text())
for filename in ['internet','video-games','gaming','education','business','slang']:
 for line in (SRC/(filename+'.jsonl')).open():
  r=json.loads(line);word=r.get('word','').strip()
  if not 1<len(word)<=45 or len(word.split())>6 or r.get('pos') in ['name','suffix','prefix','infix'] or unsafe.search(word):continue
  for sense in r.get('senses',[]):
   tags=set(sense.get('tags',[]));glosses=sense.get('glosses',[])
   if not glosses or tags&BAD_TAGS or sense.get('form_of') or sense.get('alt_of'):excluded['sense-filtered']+=1;continue
   meaning=re.split(r'https?://|<ref',glosses[-1])[0].strip()
   if not 5<len(meaning)<=650 or unsafe.search(meaning) or re.match(r'(?:Alternative|Obsolete|Archaic|Dated|Misspelling|Nonstandard|Eye dialect|Pronunciation) (?:form|spelling|of)',meaning,re.I):continue
   if filename=='slang':
    # Only region-labeled slang; do not import every obscure/historical slang word.
    if not tags&regiontags:continue
    cat='Regional'
   else:cat={'internet':'Social','video-games':'Gaming','gaming':'Gaming','education':'Campus','business':'Work'}[filename]
   if cat=='Work' and not re.search(r'\b(work|office|employee|team|job|career|meeting|business|client|customer|company|manager|management|market|project|contract|interview|hire|hiring|staff|salary|wage|employ|labour|labor|finance|account|trade|sales|service|communication|professional|corporate)\w*\b',meaning+' '+word,re.I):continue
   reg=', '.join(sorted(tags&regiontags)) or ('Gaming communities' if cat=='Gaming' else 'English / context-specific')
   url='https://en.wiktionary.org/wiki/'+urllib.parse.quote(word.replace(' ','_'),safe='')
   example=next((e.get('text','') for e in sense.get('examples',[]) if e.get('type')=='example' and not e.get('ref') and len(e.get('text',''))<180 and not unsafe.search(e.get('text',''))),'')
   priority=10+(10 if 'Internet' in tags else 0)+(8 if 'slang' in tags or 'informal' in tags else 0)+(6 if len(word)<12 else 0)
   if cat=='Work':priority+=15*bool(re.search(r'\b(?:office|employee|team|meeting|job|career|customer|manager|project|hiring|staff|salary|professional|corporate)\b',meaning,re.I))
   k=norm(word);t={'id':'wiki-'+hashlib.sha1(k.encode()).hexdigest()[:14],'expression':word,'full':meaning if len(meaning)<=90 else meaning[:87]+'…','meaning':meaning,'category':cat,'language':'English','region':reg,'tone':'Informal / varies' if cat in ['Social','Regional'] else 'Domain-specific','example':example,'caution':'Community dictionary reference; not individually editor-reviewed here. This is one recorded sense, not a claim of current Gen Z popularity. Context and region can change usage.','source':source('Wiktionary contributors via Kaikki/Wiktextract',url,'CC BY-SA 4.0'),'status':'Imported reference','priority':priority,'decode':cat=='Social' and len(word)>2,'keywords':list(tags|set(sense.get('topics',[])))[:20]}
   pools[cat].append(t)
quotas={'Social':1800,'Gaming':850,'Campus':650,'Work':850,'Regional':950}
for cat,items in pools.items():
 # Rank useful/informal terms; number distinct canonical forms, not repeated senses.
 items.sort(key=lambda x:-x['priority']);selected=set()
 for t in items:
  k=norm(t['expression'])
  if k not in selected and len(selected)>=quotas[cat]:continue
  selected.add(k);add(t)
# Base Unicode/CLDR emoji only: don't inflate counts with skin-tone variants.
ann={};names={}
for fname in ['emoji-annotations.xml','emoji-derived.xml']:
 for a in ET.parse(SRC/fname).getroot().iter('annotation'):
  cp=a.get('cp','');value=''.join(a.itertext())
  if not cp or cp.startswith('[') or any('\U0001f3fb'<=c<='\U0001f3ff' for c in cp):continue
  if a.get('type')=='tts':names[cp]=value
  else:ann[cp]=[x.strip() for x in value.split('|')]
for emoji,name in names.items():
 if not any(ord(c)>0x2000 for c in emoji):continue
 k=norm(emoji);t={'id':'emoji-'+('-'.join(hex(ord(c))[2:] for c in emoji)),'expression':emoji,'full':name,'meaning':'Standard Unicode/CLDR name: '+name+'. This label identifies the symbol; chat intent depends on the surrounding message.','category':'Emoji','language':'Universal','region':'Unicode standard; usage varies','tone':'Context-dependent','caution':'Official name and search keywords are not a universal emotional interpretation. No secret or romantic meaning is inferred.','source':source('Unicode CLDR contributors','https://github.com/unicode-org/cldr/blob/main/common/annotations/en.xml','Unicode-3.0'),'status':'Standard reference','priority':30,'decode':True,'keywords':ann.get(emoji,[]),'aliases':[]}
 add(t)
# Contextual emoji explanations override literal names for a small authored set.
for emoji,meaning,example in [('😂','Often laughter; can also be sarcastic.','That joke 😂'),('🔥','May praise something as excellent or exciting; can also mean literal fire.','That performance was 🔥'),('🫶','May express affection, thanks, or support.','Thanks for helping 🫶'),('🫠','May express embarrassment, overwhelm, or playful resignation.','Another deadline 🫠'),('👀','May signal interest, curiosity, or noticing something.','New announcement 👀'),('🤝','May signal agreement, cooperation, or acknowledgment.','Deal 🤝'),('🧢','Can mean a lie in some chats, or simply represent a cap.','No 🧢'),('❤️','Often affection, appreciation, or support; not proof of romantic intent.','Thank you ❤️')]:
 t=db.get(norm(emoji)) or db.get(norm(emoji.replace('\ufe0f','')))
 if t:t.update(meaning=meaning,example=example,status='Authored draft',priority=120)
# A separate count reports numeric-containing expressions; aliases never count as new terms.
records=list(db.values());records.sort(key=lambda x:(-x['priority'],norm(x['expression'])))
(OUT/'library.json').write_text(json.dumps(records,ensure_ascii=False,separators=(',',':')))
counts=collections.Counter(c for t in records for c in t['categories'])
manifest={'version':'0.3.0','builtAt':DATE,'uniqueEntries':len(records),'categories':dict(counts),'numericContainingEntries':sum(bool(re.search(r'\d',t['expression'])) for t in records),'standaloneNumericEntries':sum(bool(re.fullmatch(r'\d+',t['expression'])) for t in records),'statusCounts':dict(collections.Counter(t['status'] for t in records)),'sourceFiles':{p.name:{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in SRC.glob('*') if p.suffix in ['.jsonl','.csv','.xml']},'notes':['Category counts overlap where a term fits multiple contexts.','Emoji skin-tone variants are excluded from count inflation.','Numbers are not padded to 500 with invented meanings.','Campus/Work are domain vocabulary, not all Gen Z slang.','Regional includes regional English; this is not 500 Urdu entries.','Imported definitions require independent editorial review before public release.']}
manifest['librarySha256']=hashlib.sha256((OUT/'library.json').read_bytes()).hexdigest()
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps({k:manifest[k] for k in ['uniqueEntries','categories','numericContainingEntries','standaloneNumericEntries','statusCounts']},indent=2))
