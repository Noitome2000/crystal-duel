const {draftGame}=require('./browser-helpers.cjs');
let playwright;
try { playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright'); }
catch { playwright=require('C:/Users/chen2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const {chromium}=playwright;
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.locator('#setupDialog').waitFor({state:'visible'});
  await page.screenshot({path:'artifacts/hero-selection.png'});
  assert.equal(await page.locator('.hero-card').count(),10);
  await draftGame(page);
  await page.waitForTimeout(1300);
  assert.equal((await page.evaluate(()=>GameView.state)).units.length,12);
  await page.screenshot({path:'artifacts/board-desktop.png'});
  await page.click('[data-unit="red-s0"]');
  await page.locator('[data-action="auto"] .sector-label').click();
  assert.equal(await page.locator('[data-action="auto"]').isDisabled(),false);
  assert.equal(await page.evaluate(()=>Rules.legal(GameView.state,'red-s0','attack').length),0);
  let p=await page.evaluate(()=>GameView.project(2,0));
  await page.mouse.move(p.x,p.y);await page.screenshot({path:'artifacts/path-preview.png'});
  await page.mouse.click(p.x,p.y);
  await page.waitForFunction(()=>!GameView.locked&&GameView.state.ply===1);
  let state=await page.evaluate(()=>GameView.state);assert.equal(state.units.find(u=>u.id==='red-s0').x,2);
  // Dragging over a piece never selects it or spends an action.
  p=await page.evaluate(()=>GameView.project(4,0));await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+100,p.y+40,{steps:10});await page.mouse.up();
  assert.equal((await page.evaluate(()=>GameView.state)).ply,1);await page.click('#cameraBtn');
  // Exercise real UI through opening and into attack, using engine options to choose legal clicks.
  for(let i=0;i<28;i++){
    state=await page.evaluate(()=>GameView.state);if(state.winner)break;
    if(['combo','retreat','dodge'].includes(state.phase)){await page.click('#finishBtn');await page.waitForFunction(()=>!GameView.locked);continue;}
    const choice=await page.evaluate(()=>{const s=GameView.state;for(const m of ['attack','move','skill'])for(const u of s.units){const o=Rules.legal(s,u.id,m).find(o=>!['swap','charge'].includes(o.kind));if(o)return{id:u.id,mode:m,opt:o};}return null;});
    if(!choice)break;
    await page.click(`[data-unit="${choice.id}"]`);await page.locator(choice.mode==='skill'?`[data-action="skill"][data-skill="${choice.opt.kind}"] .sector-label`:'[data-action="auto"] .sector-label').click();
    const point=await page.evaluate(o=>GameView.project(o.x,o.y),choice.opt);await page.mouse.click(point.x,point.y);
    await page.waitForFunction(()=>!GameView.locked);
    const after=await page.evaluate(()=>GameView.state);assert.ok(after.ply!==state.ply||after.phase!==state.phase||after.events.length!==state.events.length,'board click must execute action');
  }
  await page.screenshot({path:'artifacts/board-midgame.png'});
  await page.click('#resetBtn');await draftGame(page);await page.waitForTimeout(1300);
  assert.equal((await page.evaluate(()=>GameView.state)).ply,0);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'artifacts/board-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log('PASS: offline file:// startup, 10 hero cards, one-click movement, attack lock, drag, 28 legal UI actions, restart, mobile width, no browser errors or network requests.');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
