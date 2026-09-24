const assert=require('node:assert/strict');
const {draftGame}=require('./browser-helpers.cjs');
let pw;try{pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');}catch{pw=require('C:/Users/chen2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const url=process.env.GAME_URL||'http://127.0.0.1:4173/crystal-duel/';
(async()=>{const browser=await pw.chromium.launch({channel:'msedge',headless:true});try{
 for(const viewport of [{width:320,height:667},{width:390,height:844},{width:430,height:932},{width:844,height:390}]){
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:2});const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(url);await page.locator('#setupDialog').waitFor({state:'visible'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await draftGame(page);
  await page.locator('[data-unit="red-s0"]').tap();
  await page.locator('#touchActions').waitFor({state:'visible'});
  const button=page.locator('#touchActions [data-command="move"]');assert.ok((await button.boundingBox()).height>=44);await button.tap();
  await page.locator('#scene').scrollIntoViewIfNeeded();
  const point=await page.evaluate(()=>GameView.project(2,0));await page.touchscreen.tap(point.x,point.y);
  await page.waitForFunction(()=>!GameView.locked&&GameView.state.ply===1);
  assert.equal((await page.evaluate(()=>GameView.state)).units.find(u=>u.id==='red-s0').x,2);
  const cdp=await context.newCDPSession(page),box=await page.locator('#scene').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  const projectedWidth=()=>page.evaluate(()=>{const a=GameView.project(1,1),b=GameView.project(4,1);return Math.hypot(a.x-b.x,a.y-b.y);});const before=await projectedWidth();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-25,y,id:1},{x:x+25,y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-45,y,id:1},{x:x+45,y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok((await projectedWidth())>before*1.1,'pinch must zoom');assert.equal((await page.evaluate(()=>GameView.state)).ply,1,'pinch must not move a unit');
  await page.locator('#cameraBtn').tap();
  await page.screenshot({path:`artifacts/mobile-${viewport.width}x${viewport.height}.png`,fullPage:true});
  await page.locator('#rulesBtn').tap();await page.locator('#rulesDialog').waitFor({state:'visible'});await page.locator('#closeRules').tap();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await context.close();console.log(`PASS: ${viewport.width}x${viewport.height} touch draft, action buttons, legal move, pinch, rules, no overflow or asset errors`);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
