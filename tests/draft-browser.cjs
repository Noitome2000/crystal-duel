let pw;try{pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');}catch{pw=require('C:/Users/chen2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),path=require('node:path');
const {draftGame}=require('./browser-helpers.cjs');
(async()=>{const browser=await pw.chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
 assert.equal(await page.locator('.hero-card:disabled').count(),10);
 const card=await page.locator('.hero-card').first().boundingBox();assert.ok(card.width>120&&card.height<260,'hero cards must not collapse into columns');
 await page.screenshot({path:'artifacts/hero-selection.png'});
 await page.selectOption('#opponent','local');
 await page.evaluate(()=>{const original=crypto.getRandomValues;crypto.getRandomValues=function(a){crypto.getRandomValues=original;original.call(crypto,a);a[0]=1;return a;};});
 await page.click('#tossBtn');await page.locator('[data-hero="vanguard"]').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('#coinResult').textContent.includes('靛方'));
 await page.screenshot({path:'artifacts/coin-draft-order.png'});
 const turns=[['靛方',1,'vanguard'],['赤方',1,'general'],['靛方',2,'assassin'],['赤方',2,'knight']];
 for(let i=0;i<4;i++){const [side,slot,hero]=turns[i];assert.match(await page.locator('#draftOrder .current').textContent(),new RegExp(side+' · '+slot+' 号位'));await page.locator(`[data-hero="${hero}"]`).click();await page.waitForFunction(i=>document.querySelectorAll('#draftOrder .done').length>i,i);}
 await page.waitForTimeout(700);assert.ok(await page.locator('#setupDialog').isVisible());await page.locator('#startBtn').click();
 await page.locator('#setupDialog').waitFor({state:'hidden'});let s=await page.evaluate(()=>GameView.state);assert.equal(s.side,'blue');assert.equal(s.ply,0);assert.equal(s.units.find(u=>u.id==='blue-vanguard').y,1);assert.equal(s.units.find(u=>u.id==='blue-assassin').y,2);
 await page.click('#resetBtn');await draftGame(page,{first:'red'});s=await page.evaluate(()=>GameView.state);assert.equal(s.side,'red');assert.equal(s.ply,0);
 await page.click('#resetBtn');await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('#setupDialog').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
 await page.screenshot({path:'artifacts/coin-draft-mobile.png'});assert.deepEqual(errors,[]);
 console.log('PASS: unselected start, fair coin branches, exact four-pick UI sequence, explicit entry with correct side/slots, readable desktop cards, mobile draft width.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
