const assert=require('node:assert/strict');
const {draftGame}=require('./browser-helpers.cjs');
let pw;try{pw=require('playwright');}catch{pw=require('C:/Users/chen2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
(async()=>{const browser=await pw.chromium.launch({channel:'msedge',headless:true});try{
 for(const touch of [false,true]){
  const page=await browser.newPage({viewport:touch?{width:320,height:667}:{width:1366,height:768},hasTouch:touch,isMobile:touch,reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Test fixture only: begin after opening protection without adding a production state setter.
  await page.route('**/rules-engine.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+'\nconst originalCreate=Rules.create;Rules.create=(...args)=>{const s=originalCreate(...args);s.ply=6;return s;};'});});
  await page.goto('http://127.0.0.1:4173/crystal-duel/');
  await draftGame(page,{picks:{red:['mage','dragon'],blue:['vanguard','assassin']}});
  await page.locator('[data-unit="red-mage"]').click();
  await page.locator(touch?'#touchActions [data-skill="swap"]':'.action[data-skill="swap"] .sector-label').click();
  const before=await page.evaluate(()=>GameView.state);
  const clickCell=async(x,y)=>{await page.locator('#scene').scrollIntoViewIfNeeded();const p=await page.evaluate(([x,y])=>GameView.project(x,y,.55),[x,y]);if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);};
  await clickCell(1,0);
  assert.equal((await page.evaluate(()=>GameView.state)).ply,6,'first target must not spend the action');
  const cancel=page.getByRole('button',{name:'取消选择 · 重新点选'});
  await cancel.scrollIntoViewIfNeeded();
  const box=await cancel.boundingBox();const size=page.viewportSize();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=size.width&&box.y+box.height<=size.height,'secondary button stays on screen');
  await cancel.click();await clickCell(1,0);
  await clickCell(4,0);assert.equal((await page.evaluate(()=>GameView.state)).ply,6,'invalid distant second target must not execute');
  await clickCell(1,1);
  await page.waitForFunction(()=>!GameView.locked&&GameView.state.ply===7);
  const after=await page.evaluate(()=>GameView.state);
  for(const [from,to] of [[0,1],[1,0]]){const id=before.units.find(u=>u.x===1&&u.y===from).id;assert.equal(after.units.find(u=>u.id===id).y,to);}
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS: ${touch?'touch':'desktop'} explicit entry, two-target swap, invalid target, cancel and menu bounds`);
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
