import {chromium} from 'playwright';
const OUT=process.env.OUT ?? 'tests-e2e/shots';
const browser=await chromium.launch();
const page=await (await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2})).newPage();
await page.clock.install();
await page.goto('http://localhost:8090/');
await page.getByText('Start decoding').click();
await page.getByRole('tab',{name:/Play/}).click();
await page.getByRole('button',{name:/Chat starter/}).click();
for(let q=0;q<5;q++){await page.getByText(`QUESTION ${q+1} OF 5`).waitFor();await page.getByRole('button').filter({has:page.getByText('B',{exact:true})}).first().click();await page.waitForTimeout(120);await page.getByText(q===4?'See my result':'Next question').click();}
await page.getByText('Back to levels').click();
await page.clock.fastForward('00:11:00');
const scrollTo=async(marker,y)=>page.evaluate(([m,y])=>{const el=[...document.querySelectorAll('div')].find(d=>d.scrollHeight>d.clientHeight+50&&d.offsetParent&&getComputedStyle(d).overflowY!=='visible'&&d.innerText.includes(m));if(el)el.scrollTop=y;},[marker,y]);
for(const [tab,marker,y] of [['Decode','What did they mean?',0],['Play','THE CODE CLUB',300],['You','YOUR CODE PROFILE',420]]){
  await page.getByRole('tab',{name:new RegExp(tab)}).click();await page.waitForTimeout(400);
  await scrollTo(marker,y);await page.waitForTimeout(300);
  await page.screenshot({path:`${OUT}/full-${tab}.png`});
}
// Overlap check: badge box vs icon box in the Play tab
const boxes=await page.evaluate(()=>{const tab=[...document.querySelectorAll('[role="tab"]')].find(t=>t.getAttribute('aria-label')?.startsWith('Play'));const badge=[...tab.querySelectorAll('div')].find(d=>/^\d+$/.test(d.innerText)&&d.children.length===1);const icon=tab.querySelector('div[dir], [class*="Icon"], svg')||tab.querySelector('div');return {tab:tab.getBoundingClientRect().toJSON(),badge:badge?.getBoundingClientRect().toJSON()};});
console.log(JSON.stringify(boxes));
await browser.close();
