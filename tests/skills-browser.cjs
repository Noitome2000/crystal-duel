const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),R=require('../rules-engine.js'),{draftGame}=require('./browser-helpers.cjs');
let pw;try{pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');}catch{pw=require('C:/Users/chen2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const u=(id,side,x,y,hero)=>({id,side,x,y,hero,type:hero?'hero':'soldier',name:id,alive:true});
const board=(units,extra={})=>({...R.create(),ply:6,units,...extra});
const cases=[
 ['push',[u('a','red',2,1),u('g','red',1,1,'general'),u('b','blue',3,1),u('c','blue',4,3)],'a','skill','push',['skill:军号','skill:推进','resolve:push']],
 ['speed',[u('a','red',2,1),u('k','red',1,1,'knight'),u('b','blue',4,3)],'a','skill','speed',['skill:荣耀','skill:神速','resolve:speed']],
 ['vault',[u('a','red',1,1,'vanguard'),u('f','red',2,1),u('b','blue',4,3)],'a','skill','vault',['skill:陷阵','resolve:vault']],
 ['teleport',[u('a','red',1,1,'assassin'),u('b','blue',4,3)],'a','skill','teleport',['skill:瞬移','resolve:teleport']],
 ['swap',[u('a','red',2,1,'mage'),u('f','red',1,1),u('b','blue',1,2),u('c','blue',4,3)],'a','skill','swap',['skill:移形','resolve:swap','status:ward']],
 ['charge',[u('a','red',1,1,'dragon'),u('b','blue',4,3)],'a','skill','charge',['skill:轰炸·蓄力','resolve:charge','status:charge']],
 ['bomb',[{...u('a','red',1,1,'dragon'),charged:true},u('b','blue',4,3)],'a','skill','bomb',['skill:轰炸','resolve:bomb'],{phase:'bomb',actor:'a'}],
 ['short',[u('a','red',1,1,'assassin'),u('b','blue',2,1),u('c','blue',4,3)],'a','attack','attack',['skill:短兵']],
 ['arsenal',[u('a','red',1,1,'pikeman'),u('b','blue',2,1),u('c','blue',4,3)],'a','attack','attack',['skill:武库']],
 ['cruel',[u('a','red',1,1,'wolf'),u('b','red',3,1,'knight'),u('c','blue',4,3)],'a','attack','attack',['skill:残忍','skill:斩将']],
 ['retreat',[u('a','red',1,1,'ranger'),u('c','blue',4,3)],'a','move','retreat',['skill:游击','resolve:retreat'],{phase:'retreat',actor:'a'}],
 ['trap',[u('a','red',2,2,'strategist'),u('b','blue',3,0),u('c','blue',4,3)],'a','move','move',['skill:设陷','trap-bind','status:trap']]
];
(async()=>{const browser=await pw.chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
 for(const [name,units,id,mode,kind,effects,extra] of cases){
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.evaluate(s=>{const create=Rules.create;Rules.create=()=>{Rules.create=create;return s;};},board(units,extra));await draftGame(page);
  await page.evaluate(()=>{window.effects=new Set();const update=THREE.Scene.prototype.updateMatrixWorld;THREE.Scene.prototype.updateMatrixWorld=function(...args){this.traverse(o=>{if(o.userData.effect)effects.add(o.userData.effect);});return update.apply(this,args);};});
  await page.click(`[data-unit="${id}"]`);
  if(mode==='skill')await page.locator(`[data-skill="${kind}"] .sector-label`).click();
  const opt=R.legal(board(units,extra),id,mode).find(o=>o.kind===kind&&(name!=='trap'||o.x===3&&o.y===2)&&(name!=='teleport'||o.x===4&&o.y===2));assert.ok(opt,name);
  const eventsBefore=await page.evaluate(()=>GameView.state.events.length);
  if(kind==='swap'||kind==='charge')await page.locator('#skillChoices button').first().click();else{const p=await page.evaluate(o=>GameView.project(o.x,o.y),opt);await page.mouse.click(p.x,p.y);}
  await page.waitForFunction(n=>!GameView.locked&&GameView.state.events.length>n,eventsBefore,{timeout:12000});
  await page.waitForTimeout(60);const seen=await page.evaluate(()=>[...effects]);for(const effect of effects)assert.ok(seen.includes(effect),`${name}: missing ${effect}; saw ${seen}`);
  assert.equal(await page.locator('#toast').evaluate(e=>e.classList.contains('show')&&e.textContent.includes('恢复')),false);
  if(name==='trap')await page.screenshot({path:'artifacts/skill-trap.png'});
  console.log('PASS skill '+name);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
