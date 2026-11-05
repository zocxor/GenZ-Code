// Minimal static server that applies the headers declared in firebase.json (for CSP testing).
import http from 'node:http';import {readFileSync, existsSync, statSync} from 'node:fs';import {join, extname} from 'node:path';
const [root, port, cfgPath] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')).hosting;
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png'};
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(root, p);
  if (p.endsWith('/')) file = join(file, 'index.html');
  if (!existsSync(file) || statSync(file).isDirectory()) file = p.startsWith('/admin/') ? join(root, 'admin/index.html') : join(root, '404.html');
  for (const h of cfg.headers) if (h.source === '**' || (h.source === '/admin/**' && p.startsWith('/admin/'))) for (const {key, value} of h.headers) res.setHeader(key, value);
  if (!existsSync(file)) {res.statusCode = 404; return res.end('not found');}
  res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
}).listen(Number(port));
