from pathlib import Path
import sqlite3,json
root=Path(__file__).resolve().parents[1];path=root/'data/genz_code_dictionary.sqlite';path.parent.mkdir(exist_ok=True)
if path.exists():path.unlink()
c=sqlite3.connect(path)
c.executescript('''CREATE TABLE expressions(id TEXT PRIMARY KEY,expression TEXT NOT NULL,full_form TEXT NOT NULL,definition TEXT NOT NULL,language TEXT NOT NULL,region TEXT,status TEXT,source_url TEXT,license TEXT,payload_json TEXT NOT NULL);
CREATE TABLE expression_categories(expression_id TEXT REFERENCES expressions(id),category TEXT,PRIMARY KEY(expression_id,category));
CREATE TABLE aliases(expression_id TEXT REFERENCES expressions(id),alias TEXT,PRIMARY KEY(expression_id,alias));
CREATE VIRTUAL TABLE expression_search USING fts5(expression,full_form,definition,aliases,expression_id UNINDEXED,tokenize='unicode61');
CREATE INDEX category_index ON expression_categories(category);''')
records=json.loads((root/'src/data/library.json').read_text())
for t in records:
 src=t.get('source') or {}
 c.execute('INSERT INTO expressions VALUES(?,?,?,?,?,?,?,?,?,?)',(t['id'],t['expression'],t['full'],t['meaning'],t['language'],t['region'],t['status'],src.get('url'),src.get('license'),json.dumps(t,ensure_ascii=False)))
 c.executemany('INSERT INTO expression_categories VALUES(?,?)',[(t['id'],v) for v in t['categories']])
 c.executemany('INSERT OR IGNORE INTO aliases VALUES(?,?)',[(t['id'],v) for v in t['aliases']])
 c.execute('INSERT INTO expression_search VALUES(?,?,?,?,?)',(t['expression'],t['full'],t['meaning'],' '.join(t['aliases']),t['id']))
c.commit();assert c.execute('SELECT COUNT(*) FROM expressions').fetchone()[0]==len(records)
print('SQLite integrity:',c.execute('PRAGMA integrity_check').fetchone()[0]);print('Rows:',len(records));print('Lookup 20:',c.execute("SELECT expression,definition FROM expressions WHERE expression='20'").fetchone());c.close()
