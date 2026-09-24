const assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),path=require('node:path');
const {draftGame}=require('./browser-helpers.cjs'),R=require('../rules-engine.js');
let pw;try{pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');}catch{pw=require('C:/Users/chen2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const unit=(id,side,x,y,hero)=>({id,side,x,y,hero,type:hero?'hero':'soldier',name:id,alive:true});
(async()=>{const browser=await pw.chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.stack);});
 for(const injectFailure of [false,true]){
 await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
 const s=R.create();s.ply=6;s.units=[unit('first','blue',3,1),unit('second','blue',3,3),unit('third','blue',1,3),unit('a','red',1,1,'vanguard')];
 await page.evaluate(s=>{const create=Rules.create;Rules.create=()=>{Rules.create=create;return s;};},s);await draftGame(page);
 await page.click('[data-unit="a"]');await page.keyboard.press('2');
 for(const id of ['first','second','third']){
  if(injectFailure&&id==='second')await page.evaluate(()=>{const original=THREE.Vector3.prototype.lerpVectors;THREE.Vector3.prototype.lerpVectors=function(...args){if(GameView.locked){THREE.Vector3.prototype.lerpVectors=original;throw Error('test animation failure');}return original.apply(this,args);};});
  await page.click(`[data-unit="${id}"]`);
  await page.waitForFunction(id=>!GameView.locked&&!GameView.state.units.find(u=>u.id===id).alive,id,{timeout:7000});
  const state=await page.evaluate(()=>GameView.state);assert.ok(state.units.find(u=>u.id==='a').alive);
  if(id!=='third'){assert.equal(state.actor,'a');assert.equal(state.phase,'combo');}
 }
 assert.equal((await page.evaluate(()=>GameView.state)).winner,'red');assert.deepEqual(errors,[]);
 if(injectFailure)assert.match(await page.locator('#toast').textContent(),/test animation failure/);
 }
 console.log('PASS: three successive animated captures with victims preceding attacker in unit array; no freeze, input unlocks, victory completes.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
