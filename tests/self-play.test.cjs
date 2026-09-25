const {test}=require('node:test'),assert=require('node:assert/strict');
const SP=require('../self-play.js'),AI=require('../ai.js'),R=require('../rules-engine.js');
const firstLegal=async state=>({action:AI.actions(state)[0]});
test('hero initiative stats follow each side, handle shared heroes and rebuild historical records',()=>{
  const rosters={red:['mage','knight'],blue:['mage','dragon']};
  const games=[['red','red'],['blue','blue'],['red','draw'],['blue',null]].map(([first,winner])=>({ruleVersion:'endgame-20-ply-v1',rosters,first,winner}));
  const report=SP.createReport(SP.normalize());for(const game of games)SP.record(report,game);
  const mage=report.heroes.mage;
  assert.deepEqual([mage.appearances,mage.wins,mage.losses,mage.draws,mage.unfinished,mage.score],[8,2,2,2,2,50]);
  assert.deepEqual([mage.first.appearances,mage.first.wins,mage.first.losses,mage.first.draws,mage.first.unfinished,mage.first.score],[4,2,0,1,1,100]);
  assert.deepEqual([mage.second.appearances,mage.second.wins,mage.second.losses,mage.second.draws,mage.second.unfinished,mage.second.score],[4,0,2,1,1,0]);
  assert.equal(report.heroes.knight.first.score,100);assert.equal(report.heroes.knight.second.score,0);
  assert.equal(report.heroes.dragon.first.score,100);assert.equal(report.heroes.dragon.second.score,0);
  assert.equal(report.heroes.ranger.first.score,null);assert.equal(report.heroes.ranger.second.score,null);
  assert.deepEqual(SP.summarize([...games,{...games[0],purpose:'validation'}]).heroes,report.heroes);
});
test('all 45 unordered pairs start without fabricated scores',()=>{
  const report=SP.createReport(SP.normalize());assert.equal(Object.keys(report.combinations).length,45);
  for(const c of Object.values(report.combinations)){assert.equal(c.appearances,0);assert.equal(c.score,null);assert.equal(c.first.score,null);assert.equal(c.second.score,null);}
  assert.equal(SP.comboKey(['mage','knight']),SP.comboKey(['knight','mage']));
});
test('combination scores merge seats, split initiative, and distinguish opponent colors',()=>{
  const report=SP.createReport(SP.normalize()),red=['mage','knight'],blue=['dragon','ranger'],a=SP.comboKey(red),b=SP.comboKey(blue);
  SP.record(report,{rosters:{red,blue},first:'red',winner:'red'});
  SP.record(report,{rosters:{red:[...red].reverse(),blue},first:'blue',winner:'blue'});
  SP.record(report,{rosters:{red,blue},first:'red',winner:'draw'});
  SP.record(report,{rosters:{red,blue},first:'blue',winner:null});
  const c=report.combinations[a];assert.deepEqual([c.appearances,c.wins,c.losses,c.draws,c.unfinished,c.score],[4,1,1,1,1,50]);
  assert.deepEqual([c.first.appearances,c.first.wins,c.first.draws,c.first.score],[2,1,1,100]);
  assert.deepEqual([c.second.appearances,c.second.losses,c.second.unfinished,c.second.score],[2,1,1,0]);
  const matchup=report.matchups[`${a}__vs__${b}`];assert.deepEqual([matchup.appearances,matchup.redWins,matchup.blueWins,matchup.firstWins,matchup.secondWins,matchup.score],[4,1,1,2,0,50]);
  SP.record(report,{rosters:{red:blue,blue:red},first:'red',winner:'blue'});
  assert.equal(Object.keys(report.matchups).length,2);assert.equal(report.matchups[`${b}__vs__${a}`].secondWins,1);
  assert.equal(Object.values(report.combinations).reduce((n,c)=>n+c.appearances,0),2*report.completed);
});
test('mirror combinations count both sides, but their matchup counts one game',()=>{
  const report=SP.createReport(SP.normalize()),red=['mage','knight'],blue=['knight','mage'],key=SP.comboKey(red);
  for(const winner of ['red','draw',null])SP.record(report,{rosters:{red,blue},first:'blue',winner});
  const c=report.combinations[key];assert.deepEqual([c.appearances,c.wins,c.losses,c.draws,c.unfinished,c.score],[6,1,1,2,2,50]);
  assert.equal(c.first.score,0);assert.equal(c.second.score,100);assert.equal(c.first.appearances,3);assert.equal(c.second.appearances,3);
  const m=Object.values(report.matchups)[0];assert.equal(m.appearances,3);assert.equal(m.redWins,1);assert.equal(m.blueWins,0);
});
test('historical aggregation rebuilds old games and excludes validation, incompatible rules and malformed rosters',()=>{
  const game={ruleVersion:'endgame-20-ply-v1',rosters:{red:['mage','knight'],blue:['dragon','ranger']},first:'red',winner:'red',trajectory:[{large:'not retained'}]};
  const report=SP.summarize([game,{...game,purpose:'self-play',winner:null},{...game,purpose:'validation'},{...game,ruleVersion:'old'},
    {...game,rosters:{red:['mage','mage'],blue:['dragon','ranger']}},{...game,first:'invalid'},{...game,winner:'invalid'},null]);
  assert.equal(report.completed,2);assert.equal(report.excluded,6);assert.equal(report.results.length,0);assert.equal(report.config,null);
  assert.equal(report.combinations[SP.comboKey(game.rosters.red)].unfinished,1);assert.equal(report.firstScore,100);
});
test('rejects invalid settings and duplicate fixed picks',()=>{for(const options of [{games:0},{games:1.5},{games:Infinity},{seed:-1},{difficulty:'bad'},{slots:{red:['mage','mage']}}])assert.throws(()=>SP.normalize(options));});
test('random picks reserve later fixed seats for both uniform and AI drafting',()=>{for(const randomMode of ['uniform','ai'])for(const first of ['red','blue']){const config=SP.normalize({randomMode,slots:{red:['random','knight'],blue:['knight','random']}}),random=SP.seededRandom(42);for(let i=0;i<100;i++){const p=SP.draftRoster(config,first,random);assert.equal(p.red[1],'knight');assert.notEqual(p.red[0],'knight');assert.equal(p.blue[0],'knight');assert.notEqual(p.blue[1],'knight');}}});
test('uniform slots reach all heroes with deterministic seeds',()=>{const config=SP.normalize(),one=SP.seededRandom(8),two=SP.seededRandom(8),seen=new Set();for(let i=0;i<100;i++){const a=SP.draftRoster(config,'red',one),b=SP.draftRoster(config,'red',two);assert.deepEqual(a,b);assert.equal(new Set(a.red).size,2);for(const h of a.red)seen.add(h);}assert.equal(seen.size,10);});
test('scores account for both sides sharing a hero and exclude unfinished/draws',()=>{const report=SP.createReport(SP.normalize()),rosters={red:['knight','mage'],blue:['knight','dragon']};SP.record(report,{rosters,first:'red',winner:'red',reason:'material'});assert.equal(report.heroes.knight.score,50);assert.equal(report.heroes.knight.appearances,2);assert.equal(report.heroes.mage.score,100);assert.equal(report.heroes.dragon.score,0);assert.equal(report.heroes.ranger.score,null);SP.record(report,{rosters,first:'red',winner:null});SP.record(report,{rosters,first:'red',winner:'draw'});assert.equal(report.heroes.knight.score,50);assert.equal(report.heroes.knight.unfinished,2);assert.equal(report.heroes.knight.draws,2);assert.equal(report.firstScore,100);assert.equal(report.adjudications,1);});
test('paired simulation preserves slots, switches first player, and records replayable games',async()=>{const report=await SP.run({games:2,maxDecisions:30,slots:{red:['mage','random'],blue:['random','dragon']}},{choose:firstLegal});assert.equal(report.status,'complete');assert.equal(report.completed,2);assert.deepEqual(report.results[0].rosters,report.results[1].rosters);assert.deepEqual(report.results.map(r=>r.first),['red','blue']);for(const result of report.results){let state=R.create(result.rosters,result.first);assert.equal(result.trajectory.length,result.decisions);for(const step of result.trajectory){assert.equal(step.features.length,AI.FEATURE_NAMES.length);assert.equal(AI.owner(state),step.side);state=AI.next(state,step.action);}assert.equal(state.ply,result.plies);assert.equal(state.winner,result.winner);}assert.equal(Object.values(report.heroes).reduce((n,h)=>n+h.appearances,0),8);});
test('stopping during a decision preserves the interrupted game as unfinished',async()=>{let stop=false;const saved=[];const report=await SP.run({games:10},{cancelled:()=>stop,choose:async state=>{stop=true;return firstLegal(state);},onGame:async game=>saved.push(game)});assert.equal(report.status,'stopped');assert.equal(report.completed,1);assert.equal(report.unfinished,1);assert.equal(report.results[0].reason,'cancelled');assert.equal(saved.length,1);assert.equal(report.firstScore,null);});
test('small-army adjudication runs to completion even past the simulation safety cap',async()=>{const state=R.create();state.ply=6;state.units=[{id:'r',side:'red',type:'soldier',x:1,y:0,alive:true},{id:'b',side:'blue',type:'soldier',x:4,y:3,alive:true}];const choose=async s=>({action:AI.actions(s).find(a=>a.mode==='move')});const result=await SP.playGame({red:['mage','dragon'],blue:['knight','general']},'red',{...SP.normalize(),maxDecisions:1},{choose,initialState:state});assert.equal(result.decisions,20);assert.equal(result.winner,'blue');assert.equal(result.reason,'second');});
