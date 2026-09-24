const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../rules-engine.js'),AI=require('../ai.js');
const unit=(id,side,x,y,hero)=>({id,side,x,y,hero,type:hero?'hero':'soldier',name:id,alive:true});
function board(...units){const s=R.create();s.ply=6;s.side='blue';s.units=units;return s;}
const budget={maxDepth:3,maxNodes:2500,timeMs:2000};
test('AI enumerates only engine-approved actions and leaves the original state unchanged',async()=>{const s=R.create();s.side='blue';const before=JSON.stringify(s);const out=await AI.choose(s,budget);assert.ok(AI.actions(s).some(a=>JSON.stringify(a)===JSON.stringify(out.action)));assert.equal(JSON.stringify(s),before);assert.ok(out.stats.nodes<=2500);});
test('AI takes immediate win',async()=>{const s=board(unit('b','blue',1,1,'knight'),unit('r','red',3,1));const result=await AI.choose(s,budget);assert.equal(AI.next(s,result.action).winner,'blue');});
test('AI avoids unnecessary friendly capture by wolf',async()=>{const s=board(unit('b','blue',1,1,'wolf'),unit('friend','blue',3,1),unit('enemy','red',1,3));const {action}=await AI.choose(s,budget);assert.equal(action.opt.target,'enemy');});
test('AI recognizes that the defender controls a ranger reaction',async()=>{const s=board(unit('a','red',1,1,'knight'),unit('r','blue',3,1,'ranger'));s.side='red';R.apply(s,'a','attack',R.legal(s,'a','attack')[0]);assert.equal(s.phase,'dodge');assert.equal(AI.owner(s),'blue');const {action}=await AI.choose(s,budget);assert.equal(action.type,'act');assert.equal(action.opt.kind,'dodge');assert.equal(R.get(AI.next(s,action),'r').alive,true);});
test('human ranger response remains human even during computer attacking turn',()=>{const s=board(unit('a','blue',1,1,'knight'),unit('r','red',3,1,'ranger'));R.apply(s,'a','attack',R.legal(s,'a','attack')[0]);assert.equal(AI.owner(s),'red');});
test('AI attempts legal ranger dodge even when search predicts a losing continuation',async()=>{
 const s=board(unit('a','red',1,1,'pikeman'),unit('r','blue',3,1,'ranger'),unit('other','blue',4,3));s.side='red';
 R.apply(s,'a','attack',R.legal(s,'a','attack').find(o=>o.target==='r'));
 assert.ok(AI.actions(s).length);assert.ok(AI.actions(s).every(a=>a.opt?.kind==='dodge'));
 for(const limits of [{maxNodes:1,timeMs:1},budget]){const {action}=await AI.choose(s,limits);assert.equal(action.opt.kind,'dodge');assert.ok(R.get(AI.next(s,action),'r').alive);}
});
test('AI pursues a dodged ranger from the attack destination with the same soldier',async()=>{
 const s=board(unit('a','blue',1,0),unit('r','red',3,1,'ranger'),unit('other','blue',1,3));
 R.apply(s,'a','attack',R.legal(s,'a','attack').find(o=>o.target==='r'));
 R.apply(s,'r','move',R.legal(s,'r','move').find(o=>o.x===3&&o.y===2));
 assert.deepEqual([R.get(s,'a').x,R.get(s,'a').y],[3,1]);
 const {action}=await AI.choose(s,budget);
 assert.equal(action.id,'a');assert.equal(action.mode,'attack');assert.equal(action.opt.target,'r');
 const next=AI.next(s,action);assert.equal(next.winner,'blue');assert.equal(R.get(next,'r').alive,false);
});
test('two-step hero cannot break attack-distance rules to pursue an adjacent ranger',async()=>{
 const s=board(unit('a','blue',1,1,'knight'),unit('r','red',3,1,'ranger'));
 R.apply(s,'a','attack',R.legal(s,'a','attack')[0]);
 R.apply(s,'r','move',R.legal(s,'r','move').find(o=>o.x===3&&o.y===2));
 assert.equal(R.legal(s,'a','attack').length,0);
 const {action}=await AI.choose(s,budget);assert.equal(action.id,'a');assert.notEqual(action.mode,'attack');
});
test('AI finishes a forced dragon bomb and can land on occupied squares',async()=>{const s=board(unit('d','blue',1,1,'dragon'),unit('r','red',3,1));s.actor='d';s.phase='bomb';s.units[0].charged=true;const {action}=await AI.choose(s,budget);assert.equal(action.opt.kind,'bomb');assert.equal(AI.next(s,action).winner,'blue');});
test('AI can choose winning combo, retreat, exchange and charging actions',async()=>{
  let s=board(unit('a','blue',1,1,'vanguard'),unit('r','red',3,1,'mage'));s.phase='combo';s.actor='a';s.combo=true;let out=await AI.choose(s,budget);assert.equal(AI.next(s,out.action).winner,'blue');
  s=board(unit('r','blue',1,1,'ranger'),unit('e','red',4,3));s.phase='retreat';s.actor='r';out=await AI.choose(s,budget);assert.ok(['decline','act'].includes(out.action.type));assert.equal(AI.next(s,out.action).side,'red');
  s=board(unit('m','blue',2,1,'mage'),unit('a','blue',1,1),unit('e','red',1,2));assert.ok(AI.actions(s).some(a=>a.opt?.kind==='swap'));
  s=board(unit('d','blue',2,1,'dragon'),unit('e','red',4,3));assert.ok(AI.actions(s).some(a=>a.opt?.kind==='charge'));
});
test('budget exhaustion still returns a legal choice; cancellation returns no action',async()=>{const s=R.create();const tiny=await AI.choose(s,{maxNodes:1,timeMs:1});assert.ok(AI.actions(s).some(a=>JSON.stringify(a)===JSON.stringify(tiny.action)));assert.equal((await AI.choose(s,{cancelled:()=>true})).action,null);});
test('computer-v-computer simulations preserve bounds, occupancy and valid phases across all hero pairs',async()=>{const heroes=Object.keys(R.HEROES);for(let game=0;game<5;game++){let s=R.create({red:[heroes[game*2],heroes[game*2+1]],blue:[heroes[(game*2+4)%10],heroes[(game*2+5)%10]]});for(let i=0;i<36&&!s.winner;i++){const out=await AI.choose(s,{maxDepth:1,maxNodes:180,timeMs:300});assert.ok(out.action);s=AI.next(s,out.action);const alive=s.units.filter(u=>u.alive);assert.equal(new Set(alive.map(R.key)).size,alive.length);assert.ok(alive.every(u=>R.inside(u.x,u.y)));}}});
