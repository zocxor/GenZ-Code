// Targeted security scan (not a penetration test). Fails (exit 1) on any finding.
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
const findings = [];
let checked = 0;
const SKIP = new Set(['node_modules', '.git', 'build', '.gradle', '.cxx', 'dist', 'dist-emu', 'dist-android', 'web-dist', '.expo', 'data']);
// Trojan-Source style bidi controls and invisible characters (emoji joiners U+200D/U+FE0F are allowed).
const BIDI = new RegExp('[\\u202A-\\u202E\\u2066-\\u2069\\u200B\\u2060\\uFEFF]');
function scan(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (SKIP.has(name)) continue;
    if (statSync(path).isDirectory()) {scan(path); continue;}
    if (!/\.(?:ts|tsx|js|mjs|cjs|json|xml|gradle|properties|rules|html)$/.test(name) || name === 'library-index.json' || name === 'package-lock.json') continue;
    const text = readFileSync(path, 'utf8');
    const rel = relative('.', path);
    checked++;
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) findings.push(rel + ': private key');
    if (/\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/.test(text)) findings.push(rel + ': possible provider secret');
    if (name.endsWith('.json')) {try {const j = JSON.parse(text); if (j.type === 'service_account' && j.private_key) findings.push(rel + ': service-account credentials');} catch {}}
    if (BIDI.test(text)) findings.push(rel + ': invisible or bidirectional control character in source');
    if (/\.(?:tsx?|m?js|html)$/.test(name)) {
      if (/dangerouslySetInnerHTML|\.innerHTML\s*=|outerHTML\s*=|document\.write\(|\beval\(|new Function\(/.test(text)) findings.push(rel + ': HTML/script injection sink');
      if (/['"]http:\/\/(?!localhost|127\.0\.0\.1|10\.0\.2\.2|schemas\.android\.com|www\.w3\.org)/.test(text)) findings.push(rel + ': cleartext http:// URL');
      if (/console\.(?:log|warn|error)\([^)]*(?:password|token|email)/i.test(text)) findings.push(rel + ': possible sensitive logging');
    }
  }
}
for (const path of ['src', 'shared', 'App.tsx', 'admin/src', 'admin/site', 'android/app/src', 'firebase']) {
  try {statSync(path).isDirectory() ? scan(path) : (checked++, BIDI.test(readFileSync(path, 'utf8')) && findings.push(path + ': invisible character'));} catch {}
}
if (process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || process.env.VITE_FIREBASE_EMULATOR_HOST) findings.push('environment: Firebase emulator host is set; never build a release with it');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
if (!/usesCleartextTraffic="false"/.test(manifest)) findings.push('AndroidManifest: cleartext traffic not disabled');
if (!/allowBackup="false"/.test(manifest)) findings.push('AndroidManifest: backups not disabled');
for (const p of ['CAMERA', 'RECORD_AUDIO', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'READ_MEDIA_IMAGES']) if (!new RegExp(`permission\\.${p}" tools:node="remove"`).test(manifest)) findings.push(`AndroidManifest: ${p} not explicitly removed`);
console.log(JSON.stringify({checked, findings, note: 'Targeted static scan only. Firebase client API key is expected public configuration; this is not a penetration test.'}, null, 2));
if (findings.length) process.exitCode = 1;
