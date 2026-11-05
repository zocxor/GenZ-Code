"""Optional corpus rebuild. Downloads public data files; does not scrape search engines.
Requires requests. Normal app builds use the already included JSON and need no fetch.
"""
from pathlib import Path
import concurrent.futures,json,hashlib,requests
root=Path(__file__).resolve().parents[1];inputs=root/'content-inputs';urls=json.loads((inputs/'source-urls.json').read_text());manifest=json.loads((root/'src/data/manifest.json').read_text())
def fetch(item):
 name,url=item;out=inputs/name
 if out.exists():return name,'already present'
 r=requests.get(url,timeout=180);r.raise_for_status();out.write_bytes(r.content)
 expected=manifest.get('sourceFiles',{}).get(name,{}).get('sha256');actual=hashlib.sha256(r.content).hexdigest()
 return name,'matches original snapshot' if expected==actual else 'source has changed: review before rebuilding'
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for result in pool.map(fetch,urls.items()):print(*result)
