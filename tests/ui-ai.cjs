const {draftGame}=require('./browser-helpers.cjs');
let pw;try{pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');}catch{pw=require('C:/Users/chen2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),path=require('node:path');
const R=require('../rules-engine.js');
const unit=(id,side,x,y,hero)=>({id,side,x,y,hero,type:hero?'hero':'soldier',name:id,alive:true});
function board(...units){const s=R.create();s.units=units;s.ply=6;s.side='blue';return s;}
(async()=>{
 const browser=await pw.chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack));
 await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
 await draftGame(page,{mode:'ai'});await page.click('[data-unit="red-s0"]');
 await page.locator('#actionWheel').waitFor({state:'visible'});
 await page.screenshot({path:'artifacts/action-wheel.png'});
 let box=await page.locator('#actionWheel').boundingBox();assert.ok(Math.abs(box.width-180)<.01);
 const initialBox=box;
 const scene=await page.locator('#scene').boundingBox();await page.mouse.move(scene.x+scene.width-40,scene.y+scene.height-80);await page.mouse.down();await page.mouse.move(scene.x+scene.width-150,scene.y+scene.height-100,{steps:8});await page.mouse.up();
 box=await page.locator('#actionWheel').boundingBox();assert.ok(Math.abs(box.x-initialBox.x)>5||Math.abs(box.y-initialBox.y)>5,'wheel follows camera');await page.click('#cameraBtn');
 await page.locator('[data-action="auto"] .sector-label').click();assert.ok(await page.locator('#actionWheel').evaluate(e=>e.classList.contains('collapsed')));
 const dest=await page.evaluate(()=>GameView.project(2,0));await page.mouse.click(dest.x,dest.y);
 await page.waitForFunction(()=>GameView.state.ply===1&&!GameView.locked);
 assert.equal(await page.locator('#actionWheel').isVisible(),false);
 assert.equal(await page.locator('[data-unit="blue-s0"]').isDisabled(),true);
 await page.waitForFunction(()=>GameView.state.ply===2&&!GameView.locked,{},{timeout:10000});
 assert.equal((await page.evaluate(()=>GameView.state)).side,'red');
 // New match cancels the pending computer turn and old decisions cannot alter it.
 await page.click('#resetBtn');await draftGame(page,{mode:'ai',first:'blue'});await page.click('#resetBtn');
 await draftGame(page);await page.waitForTimeout(1000);
 assert.equal((await page.evaluate(()=>GameView.state)).ply,0);
 // Test-only fixture installation: actual UI still executes all rules and animations.
 async function fixture(s){await page.click('#resetBtn');await page.selectOption('#opponent','ai');await page.evaluate(s=>{const create=Rules.create;Rules.create=()=>{Rules.create=create;return s;};},s);await draftGame(page,{mode:'ai'});}
 // Computer attacks human ranger, then must stop for the HUMAN response.
 let s=board(unit('b','blue',1,1,'knight'),unit('r','red',3,1,'ranger'));
 R.apply(s,'b','attack',R.legal(s,'b','attack')[0]);await fixture(s);
 await page.waitForTimeout(800);assert.equal((await page.evaluate(()=>GameView.state)).phase,'dodge');
 assert.equal(await page.locator('#finishBtn').isDisabled(),false);
 // Pick ranger explicitly (fixtures begin with no selection), then dodge using the wheel.
 await page.click('[data-unit="r"]');await page.locator('[data-action="auto"] .sector-label').click();
 const target=await page.evaluate(()=>Rules.legal(GameView.state,'r','move')[0]);const p=await page.evaluate(o=>GameView.project(o.x,o.y),target);await page.mouse.click(p.x,p.y);
 await page.waitForFunction(()=>!GameView.locked&&GameView.state.phase!=='dodge');
 await page.waitForFunction(()=>!GameView.locked&&(GameView.state.side==='red'||GameView.state.winner),{},{timeout:10000});
 // Computer is defender despite state.side still being red.
 s=board(unit('r','red',1,1,'knight'),unit('b','blue',3,1,'ranger'));s.side='red';R.apply(s,'r','attack',R.legal(s,'r','attack')[0]);
 if(await page.locator('#winDialog').isVisible())await page.click('#reviewBtn');await fixture(s);
 await page.waitForFunction(()=>!GameView.locked&&GameView.state.phase!=='dodge',{},{timeout:10000});
 assert.equal((await page.evaluate(()=>GameView.state)).noDodge,true);assert.equal((await page.evaluate(()=>GameView.state)).side,'red');
 // A computer soldier must pursue from the landing square after the human dodges.
 s=board(unit('b','blue',1,0),unit('r','red',3,1,'ranger'));R.apply(s,'b','attack',R.legal(s,'b','attack')[0]);await fixture(s);
 await page.click('[data-unit="r"]');await page.locator('[data-action="auto"] .sector-label').click();
 const dodgePoint=await page.evaluate(()=>GameView.project(3,2));await page.mouse.click(dodgePoint.x,dodgePoint.y);
 await page.waitForFunction(()=>!GameView.locked&&GameView.state.winner==='blue',{},{timeout:15000});
 assert.equal((await page.evaluate(()=>GameView.state)).units.find(u=>u.id==='r').alive,false);
 await page.locator('#winDialog').waitFor({state:'visible'});await page.click('#reviewBtn');
 // Forced dragon bombing completes automatically, including terminal state.
 s=board(unit('d','blue',1,1,'dragon'),unit('r','red',3,1));s.phase='bomb';s.actor='d';s.units[0].charged=true;await fixture(s);
 await page.locator('#winDialog').waitFor({state:'visible'});assert.equal((await page.evaluate(()=>GameView.state)).winner,'blue');await page.click('#reviewBtn');
 await page.click('#resetBtn');await draftGame(page);
 await page.setViewportSize({width:390,height:844});await page.click('[data-unit="red-s0"]');
 await page.screenshot({path:'artifacts/action-wheel-mobile.png',fullPage:true});box=await page.locator('#actionWheel').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.keyboard.press('1');assert.ok(await page.locator('#actionWheel').evaluate(e=>e.classList.contains('collapsed')));
 assert.deepEqual(errors,[]);console.log('PASS: wheel anchoring/collapse/keyboard/mobile, automatic AI reply and input lock, cancelled stale turn, human/AI ranger reactions, forced dragon win.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
