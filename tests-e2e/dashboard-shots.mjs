// Seeds realistic learning data through the real UI flow, then captures the You tab in sections.
import {chromium} from 'playwright';
const URL = 'http://localhost:8090/', OUT = process.env.OUT ?? 'tests-e2e/shots';
const browser = await chromium.launch();
const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2});
const page = await ctx.newPage();
await page.goto(URL);
await page.getByText('Start decoding').click();
await page.waitForTimeout(400);
for (const word of ['rizz', 'idk', 'no cap']) {
  await page.getByRole('tab', {name: /Words/}).click();
  await page.getByLabel('Search dictionary').fill(word);
  await page.waitForTimeout(500);
  await page.getByRole('button', {name: new RegExp('^Open ' + word, 'i')}).first().click();
  await page.getByText('Save this code').click();
  await page.getByText('Saved — tap to remove').waitFor();
  await page.getByRole('button', {name: 'Go back'}).first().click();
  await page.waitForTimeout(250);
}
// Play two levels answering correctly by reading the explanation-free answer key via the UI
await page.getByRole('tab', {name: /Play/}).click();
for (const level of [/Chat starter/, /Emoji detective/]) {
  await page.getByRole('button', {name: level}).click();
  for (let q = 0; q < 5; q++) {
    await page.getByText(`QUESTION ${q + 1} OF 5`).waitFor();
    const options = page.getByRole('button').filter({has: page.getByText('A', {exact: true})});
    await options.first().click();
    await page.waitForTimeout(150);
    // If wrong, the correct option is revealed; we still continue (real scoring).
    await page.getByText(q === 4 ? 'See my result' : 'Next question').click();
  }
  await page.getByText('Back to levels').click();
  await page.waitForTimeout(300);
}
await page.getByRole('tab', {name: /You/}).click();
await page.waitForTimeout(700);
const scroller = async y => {await page.evaluate(y => {const els = [...document.querySelectorAll('div')].filter(d => d.scrollHeight > d.clientHeight + 50 && getComputedStyle(d).overflowY !== 'visible' && d.offsetParent); const el = els.find(e => e.innerText.includes('YOUR CODE PROFILE')); if (el) el.scrollTop = y;}, y); await page.waitForTimeout(350);};
await page.screenshot({path: `${OUT}/dash-1.png`});
await scroller(640); await page.screenshot({path: `${OUT}/dash-2.png`});
await scroller(1350); await page.screenshot({path: `${OUT}/dash-3.png`});
await scroller(5000); await page.screenshot({path: `${OUT}/dash-4.png`});
await browser.close();
console.log('done');
