const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {draftGame}=require('./browser-helpers.cjs');
const R=require('../rules-engine.js');
let pw;try{pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');}catch{pw=require('C:/Users/chen2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const unit=(id,side,x,y,hero)=>({id,side,x,y,hero,type:hero?'hero':'soldier',name:hero?R.HEROES[hero].name:id,alive:true});
const board=(...units)=>({...R.create(),units,ply:6});
(async()=>{
 const browser=await pw.chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack));
 async function fixture(s){
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.evaluate(s=>{const create=Rules.create;Rules.create=()=>{Rules.create=create;return s;};},s);
  await draftGame(page);
  // Observe real meshes and effects at render time; no production test hooks.
  await page.evaluate(()=>{window.framesSeen=[];
   // Renderer methods are instance properties, so observe scene matrix updates instead.
   const update=THREE.Scene.prototype.updateMatrixWorld;
   THREE.Scene.prototype.updateMatrixWorld=function(...args){const snap={units:{},labels:[],effects:[],lines:0};this.traverse(o=>{if(o.userData.unitId&&!snap.units[o.userData.unitId])snap.units[o.userData.unitId]={x:o.position.x,y:o.position.y,z:o.position.z};if(o.userData.label)snap.labels.push(o.userData.label);if(o.userData.effect)snap.effects.push(o.userData.effect);if(o.isLine)snap.lines++;});framesSeen.push(snap);if(framesSeen.length>1200)framesSeen.shift();return update.apply(this,args);};
  });
 }
 async function cell(x,y){const p=await page.evaluate(([x,y])=>GameView.project(x,y),[x,y]);await page.mouse.click(p.x,p.y);}
 async function choice(kind){if(kind==='move'||kind==='attack')kind='auto';await page.locator(`[data-${kind==='auto'?'action':'skill'}="${kind}"] .sector-label`).click();}
 await fixture(board(unit('s','red',2,1),unit('g','red',1,1,'general'),unit('k','red',1,2,'knight'),unit('e','blue',3,1),unit('last','blue',4,3)));
 await page.click('[data-unit="s"]');
 assert.deepEqual(await page.locator('.action b').allTextContents(),['行动','推进','神速']);
 assert.equal(new Set(await page.locator('.action').evaluateAll(bs=>bs.map(b=>b.style.clipPath))).size,3);
 await page.waitForFunction(()=>!document.querySelector('#turnFlash').classList.contains('show'));
 await page.screenshot({path:'artifacts/multiple-skills-wheel.png'});
 await choice('speed');await cell(2,3);await page.waitForFunction(()=>!GameView.locked&&GameView.state.ply===7);
 let s=await page.evaluate(()=>GameView.state);assert.equal(s.cooldowns.k,10);assert.equal(s.cooldowns.g,undefined);
 assert.ok(await page.evaluate(()=>framesSeen.some(f=>f.labels.includes('神速'))));
 await fixture(board(unit('a','red',1,0),unit('b','blue',3,1),unit('last','blue',4,3)));
 await page.click('[data-unit="a"]');assert.equal(await page.locator('[data-action="skill"]').count(),0);
 await page.waitForFunction(()=>framesSeen.some(f=>f.labels.includes('攻击')&&f.labels.includes('落点')));
 await cell(3,1);await page.waitForFunction(()=>!GameView.locked&&GameView.state.units.find(u=>u.id==='b').alive===false);
 assert.ok(await page.evaluate(()=>framesSeen.some(f=>f.effects.includes('impact-slash'))),'capture shows impact effect');
 const frames=await page.evaluate(()=>framesSeen.filter(f=>f.units.a));
 assert.ok(frames.some(f=>f.units.a.x>1.15&&f.units.a.x<1.85),'attack travels through intermediate positions');
 assert.ok(frames.every(f=>Math.abs(f.units.a.y-.16)<.08),'attack stays on board without jumping');
 await fixture(board(unit('a','red',1,1,'knight'),unit('r','blue',3,1,'ranger'),unit('other','red',1,3),unit('last','blue',4,3)));
 await page.click('[data-unit="a"]');await choice('attack');await cell(3,1);await page.waitForFunction(()=>!GameView.locked&&GameView.state.phase==='dodge');
 assert.match(await page.locator('#actionHelp').textContent(),/骑士.*攻击游侠/);
 assert.ok(await page.evaluate(()=>framesSeen.some(f=>f.labels.includes('攻击者'))));
 await page.screenshot({path:'artifacts/ranger-threat.png'});
 await choice('move');await cell(3,2);await page.waitForFunction(()=>!GameView.locked&&GameView.state.phase!=='dodge');
 s=await page.evaluate(()=>GameView.state);assert.equal(s.actor,'a');assert.deepEqual([s.units.find(u=>u.id==='a').x,s.units.find(u=>u.id==='a').y],[3,1]);assert.equal(s.ply,6);assert.equal(s.noDodge,true);assert.ok(s.units.find(u=>u.id==='r').alive);
 assert.ok(await page.evaluate(()=>framesSeen.some(f=>f.labels.includes('瞬闪'))));
 assert.ok(await page.evaluate(()=>framesSeen.some(f=>f.units.a?.x>2.5&&f.units.r?.z>1.05)),'attacker approaches while ranger escapes');
 assert.equal(R.legal(s,'other','move').length,0);
 await choice('move');await cell(2,1);await page.waitForFunction(()=>!GameView.locked&&GameView.state.ply===7);
 assert.deepEqual(errors,[]);
 console.log('PASS: dynamic skill sectors, shared cooldown, skill burst, continuous grounded attack, ranger threat/slow-motion/dodge and original-attacker extra action.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
