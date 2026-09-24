let pw;try{pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');}catch{pw=require('C:/Users/chen2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),path=require('node:path');
const {draftGame}=require('./browser-helpers.cjs');
(async()=>{const browser=await pw.chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
 // Both ordinary desktops and small phones fit without a vertical scrollbar.
 for(const size of [{width:1366,height:768},{width:1280,height:720},{width:390,height:844},{width:375,height:667}]){
   await page.setViewportSize(size);
   const fit=await page.locator('#setupDialog').evaluate(e=>({h:e.scrollHeight-e.clientHeight,w:e.scrollWidth-e.clientWidth}));
   assert.ok(fit.w<=1,`${size.width}x${size.height}: draft overflow ${JSON.stringify(fit)}`);
   const initialHeight=await page.locator('#setupDialog').evaluate(e=>e.clientHeight);
   for(const hero of ['ranger','dragon','mage']){
     await page.locator(`[data-hero="${hero}"]`).hover();
     const stable=await page.locator('#setupDialog').evaluate(e=>({height:e.clientHeight,overflow:e.scrollHeight-e.clientHeight,detailOverflow:document.querySelector('#heroDetail').scrollHeight-document.querySelector('#heroDetail').clientHeight}));
     assert.ok(stable.detailOverflow<=1,'all skill text must fit');
   }
 }
 await page.setViewportSize({width:1366,height:768});await page.selectOption('#opponent','local');
 await page.evaluate(()=>{const original=crypto.getRandomValues;crypto.getRandomValues=function(a){crypto.getRandomValues=original;original.call(crypto,a);a[0]=0;return a;};});
 await page.click('#tossBtn');await page.locator('[data-hero="mage"]').click();
 assert.equal(await page.locator('#redPicks .filled .slot-copy strong').textContent(),'魔术师');
 assert.equal(await page.locator('#redPicks .filled .hero-portrait').count(),1);
 assert.equal(await page.locator('[data-hero="mage"] .picked-tag.red').textContent(),'赤方 1');
 await page.locator('[data-hero="dragon"]').click();
 assert.equal(await page.locator('#bluePicks .filled .slot-copy strong').textContent(),'巨龙');
 await page.screenshot({path:'artifacts/draft-selected-rosters.png'});
 await page.locator('[data-hero="knight"]').click();await page.locator('[data-hero="ranger"]').click();await page.locator('#startBtn').click();await page.locator('#setupDialog').waitFor({state:'hidden'});
 await page.click('[data-unit="red-mage"]');assert.equal(await page.locator('#wheelUnit').textContent(),'魔术师');
 assert.equal(await page.locator('#redRoster [data-unit="red-mage"] .unit-icon').textContent(),'');
 await page.waitForTimeout(1200);await page.screenshot({path:'artifacts/full-hero-names.png'});
 // Sample the wheel against the CURRENT rendered projection each frame during fast rotation.
 await page.evaluate(()=>{
   window.wheelSamples=[];window.samplingWheel=true;
   function sample(){if(!window.samplingWheel)return;const el=document.querySelector('#actionWheel');if(!el.hidden){
     const box=document.querySelector('#scene').getBoundingClientRect(),wheel=el.getBoundingClientRect();
     const p=GameView.project(0,1,.12),clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
     const x=p.x,y=p.y;
     wheelSamples.push(Math.hypot(wheel.x+90-x,wheel.y+90-y));
   }requestAnimationFrame(sample);}requestAnimationFrame(sample);
 });
 const scene=await page.locator('#scene').boundingBox(),sx=scene.x+scene.width-35,sy=scene.y+scene.height-55;
 await page.mouse.move(sx,sy);await page.mouse.down();
 for(let i=1;i<=35;i++)await page.mouse.move(sx-i*7,sy+Math.sin(i*.6)*40);
 await page.mouse.up();await page.waitForTimeout(200);
 const samples=await page.evaluate(()=>{window.samplingWheel=false;return wheelSamples;});
 assert.ok(samples.length>10);assert.ok(Math.max(...samples)<1,`projection error ${Math.max(...samples).toFixed(2)} px`);
 assert.equal((await page.evaluate(()=>GameView.state)).ply,0,'rotation cannot spend a turn');
 await page.click('#cameraBtn');
 await page.mouse.click(scene.x+14,scene.y+scene.height-55);assert.equal(await page.locator('#actionWheel').isVisible(),false);
 await page.click('[data-unit="red-mage"]');assert.equal(await page.locator('#actionWheel').isVisible(),true);
 await page.click('#opponentStatus');assert.equal(await page.locator('#actionWheel').isVisible(),false);
 await page.click('[data-unit="red-s0"]');await page.locator('[data-action="auto"] .sector-label').click();
 const target=await page.evaluate(()=>GameView.project(2,0));await page.mouse.click(target.x,target.y);
 await page.waitForFunction(()=>!GameView.locked&&GameView.state.ply===1);
 assert.equal((await page.evaluate(()=>GameView.state)).units.find(u=>u.id==='red-s0').x,2,'legal empty destination must still execute move');
 assert.deepEqual(errors,[]);
 console.log(`PASS: draft fits 4 viewport sizes, explicit chosen-seat portraits/names, full hero labels, ${samples.length} rotation frames <1px projection error, blank dismissal/reopen, valid moves preserved.`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
