// Admin portal: renders under production CSP; public pages render; access gate fails closed.
import {chromium} from 'playwright';
const OUT = process.env.OUT ?? 'tests-e2e/shots';
const results = [];
const check = (name, ok, info = '') => {results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`);};
const browser = await chromium.launch();
const ctx = await browser.newContext({viewport: {width: 1280, height: 860}});
const page = await ctx.newPage();
const csp = [], errors = [];
page.on('console', m => {if (/Content Security Policy|CSP/i.test(m.text())) csp.push(m.text());});
page.on('pageerror', e => errors.push(e.message));

await page.goto('http://localhost:8092/admin/');
await page.getByRole('heading', {name: 'Staff sign-in'}).waitFor({timeout: 15000});
check('portal sign-in renders under the production CSP', true);
check('no CSP violations on portal', csp.length === 0, csp.slice(0, 1).join(''));
await page.screenshot({path: `${OUT}/admin-signin.png`});
for (const [path, text] of [['/privacy.html', 'Privacy policy'], ['/delete-account.html', 'Delete your GenZ Code account'], ['/', 'Speak internet']]) {
  await page.goto('http://localhost:8092' + path);
  check(`public page ${path} renders`, (await page.locator('body').innerText()).includes(text));
}
check('no CSP violations on public pages', csp.length === 0, csp.slice(0, 1).join(''));
await page.goto('http://localhost:8092/delete-account.html');
await page.screenshot({path: `${OUT}/delete-account.png`, fullPage: true});
const lib = await (await page.request.get('http://localhost:8092/admin/library-index.json')).json();
check('CMS library index contains all bundled entries', lib.length === 8584, String(lib.length));

// Fail-closed gate (emulator build): a valid non-admin account must be refused and signed out.
const p2 = await ctx.newPage();
await p2.goto('http://localhost:8093/admin/');
await p2.getByLabel('Email').fill('learner@example.com');
await p2.getByLabel('Password').fill('correct horse battery');
await p2.getByRole('button', {name: 'Sign in'}).click();
await p2.waitForTimeout(6000);
const t = await p2.locator('body').innerText();
check('non-admin (or unverifiable) account is refused and signed out', /Staff sign-in/.test(t) && !/Dashboard/.test(t), (t.match(/This account is not[^.]*\.|Network unavailable[^.]*\.|Something went wrong[^.]*\./) ?? [''])[0]);
await p2.getByLabel('Email').fill('learner@example.com');
await p2.getByLabel('Password').fill('wrong-password');
await p2.getByRole('button', {name: 'Sign in'}).click();
await p2.waitForTimeout(2500);
check('wrong admin password gives a generic error', /email or password is incorrect/i.test(await p2.locator('body').innerText()));
check('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
