// Account flows against the real Firebase Auth emulator. Firestore is deliberately NOT running,
// which also exercises "backend unreachable" behaviour: local data must never be lost.
import {chromium} from 'playwright';
const URL = 'http://localhost:8091/', EMU = 'http://127.0.0.1:9099', PROJECT = 'gen-z-code-55caf';
const OUT = process.env.OUT ?? 'tests-e2e/shots';
const results = [];
const check = (name, ok, info = '') => {results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`);};
const accounts = async () => (await (await fetch(`${EMU}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {method: 'POST', headers: {Authorization: 'Bearer owner', 'Content-Type': 'application/json'}, body: '{}'})).json()).userInfo ?? [];
await fetch(`${EMU}/emulator/v1/projects/${PROJECT}/accounts`, {method: 'DELETE'});

const browser = await chromium.launch();
const page = await (await browser.newContext({viewport: {width: 390, height: 844}})).newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const body = () => page.locator('body').innerText();
await page.goto(URL);
await page.getByText('Start decoding').click();
// Guest saves a word
await page.getByRole('tab', {name: /Words/}).click();
await page.getByLabel('Search dictionary').fill('idk'); await page.waitForTimeout(500);
await page.getByRole('button', {name: /^Open IDK/}).first().click();
await page.getByText('Save this code').click(); await page.getByText('Saved — tap to remove').waitFor();
await page.getByRole('button', {name: 'Go back'}).first().click();

// Create an account
await page.getByRole('tab', {name: /You/}).click();
await page.getByText('My account', {exact: true}).click();
await page.getByText('Create an account').click();
await page.getByLabel('Account email').fill('learner@example.com');
await page.getByLabel('Account password', {exact: true}).fill('correct horse battery');
await page.getByLabel('Confirm account password').fill('correct horse battery');
await page.getByRole('button', {name: 'Create account'}).click();
await page.getByText(/Account created/).waitFor({timeout: 15000});
check('sign-up against Firebase Auth succeeds', (await accounts()).some(a => a.email === 'learner@example.com'));
await page.waitForTimeout(2500);
const t1 = await body();
check('backend unreachable → sync reports offline/paused, not success', /offline|didn’t complete|will retry|paused|Syncing/i.test(t1), (t1.match(/(You’re offline[^.]*\.|Sync didn’t complete[^.]*\.)/) ?? [])[0]);
await page.screenshot({path: `${OUT}/account-signed-in.png`});

// Sign out with the keep-data choice
await page.getByRole('button', {name: 'Sign out'}).click();
await page.getByText('Keep your learning on this device?').waitFor({timeout: 15000});
check('sign-out warns when changes are not yet synced', /haven’t synced yet/.test(await body()));
await page.getByRole('button', {name: 'Sign out, keep data on this device'}).click();
await page.getByText(/Signed out\. Your learning stays/).waitFor();
check('signed out; local learning kept', true);

// Brute-force guard: 4 wrong passwords
for (let i = 0; i < 4; i++) {
  await page.getByLabel('Account email').fill('learner@example.com');
  await page.getByLabel('Account password', {exact: true}).fill('wrong password ' + i);
  const btn = page.getByRole('button', {name: 'Sign in with email'});
  if (i === 0) {await page.screenshot({path: `${OUT}/dbg-signin.png`}); console.log('DBG', (await body()).slice(0, 600).replace(/\n+/g, ' | '));}
  if (await btn.count() === 0 || await btn.isDisabled()) break;
  await btn.click();
  await page.waitForTimeout(1200);
}
const t2 = await body();
check('wrong password shows a non-enumerating error', /email or password is incorrect/i.test(t2) || /Too many attempts/i.test(t2));
check('client throttle pauses sign-in after repeated failures', /Sign-in paused on this device/.test(t2) && await page.getByRole('button', {name: 'Sign in with email'}).isDisabled());
const guard = await page.evaluate(() => JSON.parse(localStorage.getItem('genz-code-login-guard') || '{}'));
check('throttle state persisted (survives restart)', guard.failures >= 3 && guard.lockedUntil > Date.now(), `failures=${guard.failures}`);
const log = await page.evaluate(() => JSON.parse(localStorage.getItem('genz-code-security-log') || '[]'));
check('failed sign-ins recorded locally without e-mail or password', log.filter(e => e.type === 'login_failed').length >= 3 && !JSON.stringify(log).match(/learner@|wrong password/), `${log.length} events`);
await page.screenshot({path: `${OUT}/account-throttled.png`});
await page.getByRole('button', {name: 'Go back'}).first().click();
await page.getByText('Threat Shield', {exact: true}).first().click(); await page.waitForTimeout(800);
check('Threat Shield flags repeated failed sign-ins', /failed sign-in attempts in 24 hours/.test(await body()));
await page.getByRole('button', {name: 'Go back'}).first().click();

// Reload page (simulated app restart): local data intact after all of this
await page.reload(); await page.waitForTimeout(2500);
await page.getByRole('tab', {name: /You/}).click(); await page.waitForTimeout(500);
check('saved word survived sign-up, offline sync, sign-out and restart', /\n1\nSaved words/.test(await body()));

// Account deletion must not delete the sign-in account when cloud deletion fails
await page.evaluate(() => localStorage.removeItem('genz-code-login-guard'));
await page.reload(); await page.waitForTimeout(2000);
await page.getByRole('tab', {name: /You/}).click();
await page.getByText('My account', {exact: true}).click();
await page.getByLabel('Account email').fill('learner@example.com');
await page.getByLabel('Account password', {exact: true}).fill('correct horse battery');
await page.getByRole('button', {name: 'Sign in with email'}).click();
await page.getByText(/You’re signed in/).waitFor({timeout: 15000});
check('sign-in with correct password succeeds', true);
await page.getByRole('button', {name: 'Delete account and cloud data'}).click();
await page.getByLabel('Password to confirm deletion').fill('correct horse battery');
await page.getByRole('button', {name: 'Delete my account'}).click();
await page.waitForTimeout(8000);
const t3 = await body();
check('cloud deletion failure is reported honestly', /Couldn’t delete your cloud data, so nothing was deleted/.test(t3));
check('sign-in account NOT deleted while cloud data remains', (await accounts()).some(a => a.email === 'learner@example.com'));
const wrongReauth = async () => {await page.getByLabel('Password to confirm deletion').fill('not my password'); await page.getByRole('button', {name: 'Delete my account'}).click(); await page.waitForTimeout(2500);};
await wrongReauth();
check('deletion requires re-authentication (wrong password refused)', /incorrect/i.test(await body()) && (await accounts()).length === 1);
check('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
