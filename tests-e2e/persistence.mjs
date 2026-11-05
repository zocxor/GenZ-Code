// End-to-end persistence test against the exported web build (AsyncStorage → localStorage).
import {chromium} from 'playwright';
const URL = process.env.APP_URL ?? 'http://localhost:8090/';
const OUT = process.env.OUT ?? process.env.OUT ?? 'tests-e2e/shots';
const results = [];
const check = (name, ok, info = '') => {results.push({name, ok, info}); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`);};
const browser = await chromium.launch();
const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
const tap = async (text, opts = {}) => {await page.getByText(text, {exact: opts.exact ?? false}).first().click(); await page.waitForTimeout(opts.wait ?? 250);};
const role = async (name) => {await page.getByRole('button', {name}).first().click(); await page.waitForTimeout(250);};

await page.goto(URL);
await page.getByText('Start decoding').waitFor({timeout: 20000});
check('welcome screen renders', true);
await tap('Start decoding');
await page.getByText('What did they mean?').waitFor();

// Save a word from the dictionary
await page.getByRole('tab', {name: /Words/}).click();
await page.getByLabel('Search dictionary').fill('rizz');
await page.waitForTimeout(600);
await page.getByRole('button', {name: 'Open rizz'}).first().click();
await page.getByText('Save this code').waitFor();
await tap('Save this code');
await page.getByText('Saved — tap to remove').waitFor({timeout: 5000});
check('saving a word confirms in UI', true);
await role('Go back');

// Play a full level (answer each question with the first option)
await page.getByRole('tab', {name: /Play/}).click();
await page.getByRole('button', {name: /Chat starter/}).click();
for (let q = 0; q < 5; q++) {
  await page.getByText(`QUESTION ${q + 1} OF 5`).waitFor();
  await page.locator('[role="button"]').filter({hasText: /^A/}).first().click();
  await page.waitForTimeout(200);
  await tap(q === 4 ? 'See my result' : 'Next question');
}
await page.getByText('Back to levels').waitFor();
const scoreText = await page.locator('text=/Best score: \\d+%/').first().textContent();
check('quiz completes and records a best score', !!scoreText, scoreText ?? '');
await tap('Back to levels');

// Reload = close and reopen the app
const before = await page.evaluate(() => Object.keys(localStorage));
await page.reload();
await page.waitForTimeout(2500);
const welcomeAgain = await page.getByText('Start decoding').count();
check('onboarding persists after reopen', welcomeAgain === 0);
await page.getByRole('tab', {name: /You/}).click();
await page.waitForTimeout(600);
const dash = await page.locator('body').innerText();
check('saved word persists after reopen', /\n1\nSaved words/.test(dash), (dash.match(/(\d+)\nSaved words/) ?? [])[0]);
check('XP persists after reopen', /\d+ XP/.test(dash) && !/^0 XP/m.test(dash), (dash.match(/(\d+) XP/) ?? [])[0]);
check('streak recorded from answered questions', /\n1\nDay streak/.test(dash));
check('round history persists', /RECENT ROUNDS/.test(dash) && /Chat starter/.test(dash));
check('recently viewed persists', /RECENTLY VIEWED/.test(dash) && /rizz/.test(dash));
await page.screenshot({path: `${OUT}/profile-dashboard-top.png`});
await page.mouse.wheel(0, 900); await page.waitForTimeout(400);
await page.screenshot({path: `${OUT}/profile-dashboard-middle.png`});
await page.mouse.wheel(0, 1100); await page.waitForTimeout(400);
await page.screenshot({path: `${OUT}/profile-dashboard-bottom.png`});
await page.mouse.wheel(0, -3000); await page.waitForTimeout(300);
await page.screenshot({path: `${OUT}/profile-dashboard-full.png`, fullPage: true});

// Profile edit persists
await role('Edit your profile');
await page.getByLabel('Profile nickname').fill('Zara');
await page.getByRole('button', {name: 'Choose rocket avatar'}).click();
await tap('Save my profile');
await page.reload(); await page.waitForTimeout(2500);
await page.getByRole('tab', {name: /You/}).click(); await page.waitForTimeout(400);
check('profile edit persists after reopen', (await page.locator('body').innerText()).includes('Zara'));

// Threat Shield
await page.getByText('Threat Shield', {exact: true}).first().click();
await page.waitForTimeout(1200);
const shield = await page.locator('body').innerText();
check('Threat Shield shows real check summary', /\d+ of \d+ applicable checks passed/.test(shield), (shield.match(/\d+ of \d+ applicable checks passed/) ?? [])[0]);
await page.screenshot({path: `${OUT}/threat-shield.png`});
await role('Go back');

// Storage keys and envelope integrity
const keys = await page.evaluate(() => Object.keys(localStorage).sort());
check('v3 primary and backup records exist', keys.includes('genz-code-v3') && keys.includes('genz-code-v3.bak'), keys.join(','));
const env = await page.evaluate(() => JSON.parse(localStorage.getItem('genz-code-v3')));
check('stored envelope has schema v3 and checksum', env.v === 3 && /^[0-9a-f]{8}$/.test(env.sum));
check('no decoder message text or credentials stored', !JSON.stringify(await page.evaluate(() => ({...localStorage}))).match(/password|lowkey cooked/i));

// Corrupt the primary record: app must recover from backup without losing the saved word
await page.evaluate(() => localStorage.setItem('genz-code-v3', '{"v":3,"sum":"deadbeef","data":{'));
await page.reload(); await page.waitForTimeout(2500);
await page.getByRole('tab', {name: /You/}).click(); await page.waitForTimeout(400);
const afterCorrupt = await page.locator('body').innerText();
check('corrupt primary recovers from backup copy', /Zara|Code Explorer/.test(afterCorrupt) && /\n1\nSaved words/.test(afterCorrupt));
const quarantined = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('genz-code-quarantine.')).length);
check('corrupt record quarantined rather than deleted', quarantined === 1, `quarantine keys: ${quarantined}`);

// Delete local data
await page.getByText('Threat Shield', {exact: true}).first().click(); await page.waitForTimeout(800);
page.once('dialog', d => d.accept());
await page.getByRole('button', {name: 'Delete all data on this device'}).click();
await page.waitForTimeout(1200);
await page.reload(); await page.waitForTimeout(2500);
const remaining = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('genz-code')));
await page.getByRole('tab', {name: /You/}).click(); await page.waitForTimeout(400);
const afterDelete = await page.locator('body').innerText();
check('local deletion removes learning data and quarantine', /\n0\nSaved words/.test(afterDelete) && remaining.every(k => k === 'genz-code-v3' || k === 'genz-code-v3.bak' || k === 'genz-code-security-log' || k === 'genz-code-login-guard'), remaining.join(','));
check('no uncaught page errors', errors.filter(e => !/firestore|Firebase|identitytoolkit|ERR_|net::/i.test(e)).length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;
