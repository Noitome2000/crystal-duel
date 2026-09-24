const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../draft.js'),R=require('../rules-engine.js'),AI=require('../ai.js');
for(const [bit,first] of [[0,'red'],[1,'blue']])test(`coin ${bit}: ${first} drafts first and acts first`,()=>{
 const s=D.create();assert.equal(D.current(s),null);assert.throws(()=>D.choose(s,'red','general'));
 D.toss(s,bit);assert.equal(s.first,first);assert.throws(()=>D.toss(s,bit));
 const other=first==='red'?'blue':'red',order=[[first,1,'general'],[other,1,'knight'],[first,2,'mage'],[other,2,'dragon']];
 for(const [side,slot,hero] of order){assert.deepEqual(D.current(s),{side,slot});assert.throws(()=>D.choose(s,side==='red'?'blue':'red',hero));D.choose(s,side,hero);}
 assert.equal(s.stage,'ready');assert.equal(D.current(s),null);assert.throws(()=>D.choose(s,first,'wolf'));
 const game=R.create(s.picks,s.first);assert.equal(game.side,first);for(const pick of s.history){const u=game.units.find(u=>u.side===pick.side&&u.hero===pick.hero);assert.equal(u.y,pick.slot);}
});
test('a side cannot duplicate a hero, but the opposing side may choose the same one',()=>{const s=D.create();D.toss(s,0);D.choose(s,'red','knight');D.choose(s,'blue','knight');assert.throws(()=>D.choose(s,'red','knight'));assert.equal(s.index,2);});
test('computer selects only its own current slot with no duplicate hero',()=>{for(const bit of [0,1]){const s=D.create();D.toss(s,bit);while(D.current(s)){const {side}=D.current(s);const h=side==='blue'?AI.chooseHero(s.picks,'blue'):['general','mage'][s.picks.red.length];D.choose(s,side,h);}assert.equal(s.picks.blue.length,2);assert.equal(new Set(s.picks.blue).size,2);}});
test('weighted draft produces diverse legal pairs without concentrating on knight and vanguard',()=>{
 let seed=92841;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const counts={},pairs=new Set();let repeatedPair=0;
 for(let i=0;i<2000;i++){
  const picks={red:['general','ranger'],blue:[]};
  picks.blue.push(AI.chooseHero(picks,'blue',{random}));picks.blue.push(AI.chooseHero(picks,'blue',{random}));
  assert.equal(new Set(picks.blue).size,2);
  for(const h of picks.blue)counts[h]=(counts[h]||0)+1;
  const pair=picks.blue.sort().join(',');pairs.add(pair);if(pair==='knight,vanguard')repeatedPair++;
 }
 assert.equal(Object.keys(counts).length,10);assert.equal(pairs.size,45);
 assert.ok(repeatedPair<200);assert.ok(Math.max(...Object.values(counts))<1000);
});
