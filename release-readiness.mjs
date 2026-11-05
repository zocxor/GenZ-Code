import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url),issues=[];
const config=JSON.parse(readFileSync(new URL('production-readiness.json',root),'utf8'));
for(const key of ['owner','contentEditorialReview','physicalAndroidQA','accessibilityQA','dependencyReview','privacyAndTerms','authentication','backendAndCMS','aiGateway','monitoring','storeSigning']){const g=config[key];if(!g||g.status!=='passed'||typeof g.evidence!=='string'||!g.evidence.startsWith('docs/release-evidence/')||g.evidence.includes('..')||!existsSync(new URL(g.evidence,root)))issues.push(`${key}: missing completion evidence`);}
if(process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST)issues.push('EXPO_PUBLIC_FIREBASE_EMULATOR_HOST is set: unset it and rebuild with a cleared Metro cache (npx expo export --clear)');
for(const key of ['GENZ_UPLOAD_STORE_FILE','GENZ_UPLOAD_STORE_PASSWORD','GENZ_UPLOAD_KEY_ALIAS','GENZ_UPLOAD_KEY_PASSWORD'])if(!process.env[key])issues.push(`${key}: not configured`);
if(issues.length){console.error('GenZ Code production release BLOCKED\n'+issues.map(x=>'• '+x).join('\n'));process.exitCode=1;}else console.log('Recorded gates passed. Independently review evidence before distribution.');
