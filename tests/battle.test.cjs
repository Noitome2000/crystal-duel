const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../rules-engine.js');
const D=require('../draft.js');
const AI=require('../ai.js');
const SP=require('../self-play.js');

const red=['general','knight','mage'],blue=['vanguard','assassin','ranger'];

test('battle map is 4x5 centre plus three raised cells above and below',()=>{
  assert.equal(R.MODES.battle.cells.length,26);
  assert.equal(R.MODES.battle.cells.filter(c=>c.y>=0&&c.y<4).length,20);
  assert.deepEqual(R.MODES.battle.cells.filter(c=>c.y<0||c.y>=4).map(c=>[c.x,c.y]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]),[[2,-1],[3,-1],[4,-1],[2,4],[3,4],[4,4]]);
});

test('battle deployment creates three heroes and five soldiers per side',()=>{
  const s=R.create({red,blue},'red','battle');
  assert.equal(s.units.length,16);
  for(const side of ['red','blue']){
    assert.equal(s.units.filter(u=>u.side===side&&u.type==='hero').length,3);
    assert.equal(s.units.filter(u=>u.side===side&&u.type==='soldier').length,5);
    const heroes=s.units.filter(u=>u.side===side&&u.type==='hero');
    const soldiers=s.units.filter(u=>u.side===side&&u.type==='soldier');
    assert.ok(heroes.every(u=>u.y===(side==='red'?-1:4)&&u.x>=2&&u.x<=4));
    assert.ok(soldiers.every(u=>u.y===(side==='red'?0:3)&&u.x>=1&&u.x<=5));
  }
  assert.ok(s.units.every(u=>R.cellsOf(s).some(c=>c.x===u.x&&c.y===u.y)));
});

test('battle draft requires six picks',()=>{
  const d=D.create('battle');D.toss(d,0);
  const order=[];for(const [side,hero] of [['red','general'],['blue','vanguard'],['red','knight'],['blue','assassin'],['red','mage'],['blue','ranger']]){order.push(D.current(d).side);D.choose(d,side,hero);}
  assert.deepEqual(order,['red','blue','red','blue','red','blue']);
  assert.equal(d.stage,'ready');assert.equal(d.picks.red.length,3);assert.equal(d.picks.blue.length,3);
});

test('battle reports only three-hero combinations',()=>{
  const report=SP.createReport(SP.normalize({mode:'battle'}));
  assert.equal(Object.keys(report.combinations).length,120);
  assert.ok(Object.keys(report.combinations).every(key=>key.split('+').length===3));
});

test('battle self-play config and AI produce a legal action',async()=>{
  const config=SP.normalize({mode:'battle',games:1,slots:{red:['random','random','random'],blue:['random','random','random']}});
  assert.equal(config.mode,'battle');assert.equal(config.slots.red.length,3);
  const s=R.create({red,blue},'red','battle');
  const result=await AI.choose(s,{side:'red',maxDepth:1,maxNodes:80,timeMs:100});
  assert.ok(result.action);
});
