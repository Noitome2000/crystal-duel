/* Headless self-play. The browser and regression tests use this same runner. */
(function(root){
  'use strict';
  const node=typeof module!=='undefined'&&module.exports;
  const R=node?require('./rules-engine.js'):root.Rules;
  const AI=node?require('./ai.js'):root.GameAI;
  const D=node?require('./draft.js'):root.GameDraft;
  const HEROES=Object.keys(R.HEROES);
  const PRESETS={fast:{maxDepth:2,maxNodes:350,timeMs:750},standard:{maxDepth:4,maxNodes:4500,timeMs:750}};
  const yieldUI=()=>new Promise(resolve=>setTimeout(resolve,0));
  function integer(value,min,max,label){
    if(value===''||!Number.isInteger(Number(value))||Number(value)<min||Number(value)>max)throw Error(`${label}须为 ${min}～${max} 的整数`);
    return Number(value);
  }
  function normalize(options={}){
    const c={games:integer(options.games??100,1,10000,'模拟局数'),seed:integer(options.seed??20260925,0,4294967295,'随机种子'),
      maxDecisions:integer(options.maxDecisions??600,20,10000,'每局决策上限'),difficulty:options.difficulty??'fast',
      first:options.first??'alternate',randomMode:options.randomMode??'uniform',mode:options.mode??'classic',slots:{}};
    if(!['classic','battle'].includes(c.mode))throw Error('请选择有效的战场模式');
    const slotCount=c.mode==='battle'?3:2;
    if(!Object.hasOwn(PRESETS,c.difficulty))throw Error('请选择有效的搜索强度');
    if(!['alternate','random','red','blue'].includes(c.first))throw Error('请选择有效的先手安排');
    if(!['uniform','ai'].includes(c.randomMode))throw Error('请选择有效的随机选将方式');
    for(const side of ['red','blue']){
      const picks=options.slots?.[side]??Array(slotCount).fill('random');
      if(!Array.isArray(picks)||picks.length!==slotCount||picks.some(h=>h!=='random'&&!HEROES.includes(h)))throw Error(`${side==='red'?'赤方':'靛方'}必须设置${slotCount}个有效的英雄位置`);
      if(new Set(picks.filter(h=>h!=='random')).size!==picks.filter(h=>h!=='random').length)throw Error(`${side==='red'?'赤方':'靛方'}不能指定重复英雄`);
      c.slots[side]=picks.slice();
    }
    return c;
  }
  function seededRandom(seed){let value=seed>>>0;return ()=>((value=(Math.imul(value,1664525)+1013904223)>>>0)/4294967296);}
  function draftRoster(config,first,random){
    const draft=D.create(config.mode);D.toss(draft,first==='red'?0:1);
    while(D.current(draft)){
      const {side,slot}=D.current(draft);let hero=config.slots[side][slot-1];
      if(hero==='random'){
        // Reserve the other fixed seat even when it has not been drafted yet.
        const exclude=config.slots[side].filter(h=>h!=='random');
        const candidates=HEROES.filter(h=>!draft.picks[side].includes(h)&&!exclude.includes(h));
        hero=config.randomMode==='ai'?AI.chooseHero(draft.picks,side,{random,exclude}):candidates[Math.floor(random()*candidates.length)];
      }
      D.choose(draft,side,hero);
    }
    return {red:draft.picks.red.slice(),blue:draft.picks.blue.slice()};
  }
  function createReport(config){
    return {version:2,ruleVersion:'endgame-20-ply-v1',config,search:{...PRESETS[config.difficulty]},status:'running',startedAt:new Date().toISOString(),elapsedMs:0,
      completed:0,firstWins:0,secondWins:0,redWins:0,blueWins:0,draws:0,unfinished:0,adjudications:0,firstScore:null,
      scoreDefinition:'英雄所在阵容胜场 /（胜场 + 负场）× 100；平局、未完成不计入分母；双方同英雄分别记一次出场。',
      combinationDefinition:'同一方英雄阵容为一个组合，不区分位置；镜像阵容分别记两次出场。对阵按赤方组合与靛方组合分别统计。胜率仅以胜负局为分母。',
      heroes:Object.fromEntries(HEROES.map(id=>[id,{id,name:R.HEROES[id].name,...emptyStats(),first:emptyStats(),second:emptyStats()}])),
      combinations:Object.fromEntries(HEROES.flatMap((id,i)=>HEROES.slice(i+1).map(other=>{const key=comboKey([id,other]);return [key,{key,name:comboName(key),...emptyStats(),first:emptyStats(),second:emptyStats()}];}))),matchups:{},results:[]};
  }
  function emptyStats(){return {appearances:0,wins:0,losses:0,draws:0,unfinished:0,score:null};}
  function comboKey(picks){return picks.slice().sort().join('+');}
  function comboName(key){return key.split('+').map(id=>R.HEROES[id]?.name||id).join(' + ');}
  function ensureStats(map,key,name){return map[key]??={key,name,...emptyStats(),first:emptyStats(),second:emptyStats()};}
  function updateStats(stats,result,win){
    stats.appearances++;
    stats[!result.winner?'unfinished':result.winner==='draw'?'draws':win?'wins':'losses']++;
    stats.score=stats.wins+stats.losses?100*stats.wins/(stats.wins+stats.losses):null;
  }
  function record(report,result,{retainResults=true}={}){
    if(retainResults)report.results.push(result);report.completed++;
    if(result.winner==='red'||result.winner==='blue'){
      report[result.winner+'Wins']++;report[result.winner===result.first?'firstWins':'secondWins']++;
      if(['material','hero','second'].includes(result.reason))report.adjudications++;
    }else if(result.winner==='draw')report.draws++;else report.unfinished++;
    for(const side of ['red','blue'])for(const id of result.rosters[side]){
      const h=report.heroes[id];updateStats(h,result,result.winner===side);
      updateStats(h[result.first===side?'first':'second'],result,result.winner===side);
    }
    const redKey=comboKey(result.rosters.red),blueKey=comboKey(result.rosters.blue),redCombo=ensureStats(report.combinations,redKey,comboName(redKey)),blueCombo=ensureStats(report.combinations,blueKey,comboName(blueKey));
    updateStats(redCombo,result,result.winner==='red');updateStats(blueCombo,result,result.winner==='blue');
    updateStats(redCombo[result.first==='red'?'first':'second'],result,result.winner==='red');
    updateStats(blueCombo[result.first==='blue'?'first':'second'],result,result.winner==='blue');
    const matchupKey=`${redKey}__vs__${blueKey}`,matchup=ensureStats(report.matchups,matchupKey,`${redCombo.name}  vs  ${blueCombo.name}`);
    matchup.redKey=redKey;matchup.blueKey=blueKey;
    updateStats(matchup,result,result.winner==='red');matchup.redWins=(matchup.redWins||0)+(result.winner==='red'?1:0);matchup.blueWins=(matchup.blueWins||0)+(result.winner==='blue'?1:0);
    matchup.firstWins=(matchup.firstWins||0)+(['red','blue'].includes(result.winner)&&result.winner===result.first?1:0);
    matchup.secondWins=(matchup.secondWins||0)+(['red','blue'].includes(result.winner)&&result.winner!==result.first?1:0);
    report.firstScore=report.firstWins+report.secondWins?100*report.firstWins/(report.firstWins+report.secondWins):null;
  }
  function historicalGame(game){
    return !!game&&game.ruleVersion==='endgame-20-ply-v1'&&(!game.purpose||game.purpose==='self-play')&&
      ['red','blue'].includes(game.first)&&[null,undefined,'red','blue','draw'].includes(game.winner)&&
      ['red','blue'].every(side=>Array.isArray(game.rosters?.[side])&&((game.mode==='battle'&&game.rosters[side].length===3)||(game.mode!=='battle'&&game.rosters[side].length===2))&&
        new Set(game.rosters[side]).size===game.rosters[side].length&&game.rosters[side].every(id=>HEROES.includes(id)));
  }
  function createHistory(){return {...createReport(normalize()),config:null,search:null,status:'history',scope:'history',excluded:0};}
  function recordHistory(report,game){if(historicalGame(game))record(report,game,{retainResults:false});else report.excluded++;}
  function summarize(games){const report=createHistory();for(const game of games)recordHistory(report,game);return report;}
  async function playGame(rosters,first,config,{cancelled=()=>false,onStep=()=>{},choose=AI.choose,initialState}={}){
    let state=initialState?JSON.parse(JSON.stringify(initialState)):R.create(rosters,first,config.mode),decisions=0,reason=null;
    const trajectory=[];
    const history=[],seen=new Map();
    while(!state.winner){
      if(cancelled()){reason='cancelled';break;}
      // The safety cap is only for simulation. It never overrides the 20-turn rule.
      if(decisions>=config.maxDecisions&&state.units.filter(u=>u.alive).length>3){reason='decision-limit';break;}
      const out=await choose(state,{...PRESETS[config.difficulty],history:history.slice(-16),cancelled});
      if(cancelled()){reason='cancelled';break;}
      if(!out.action)throw Error('AI 未返回合法行动');
      const side=AI.owner(state);
      trajectory.push({side,ply:state.ply,phase:state.phase,features:AI.features(state,side),base:AI.evaluate(state,side,null),action:JSON.parse(JSON.stringify(out.action))});
      state=AI.next(state,out.action);decisions++;
      const key=AI.key(state);history.push(key);if(history.length>16)history.shift();seen.set(key,(seen.get(key)||0)+1);
      if(!state.winner&&state.units.filter(u=>u.alive).length>3&&seen.get(key)>=6){reason='repetition';break;}
      if(decisions%8===0){onStep({decisions,plies:state.ply,endgame:R.endgameInfo(state)});await yieldUI();}
    }
    return {mode:config.mode,first,rosters:{red:rosters.red.slice(),blue:rosters.blue.slice()},winner:state.winner||null,reason:state.winner?state.victoryReason:reason,plies:state.ply,decisions,trajectory};
  }
  async function run(options,{cancelled=()=>false,onProgress=()=>{},onGame=async()=>{},choose=AI.choose}={}){
    const config=normalize(options),random=seededRandom(config.seed),report=createReport(config),started=Date.now();
    let pairRoster;
    const update=current=>{report.elapsedMs=Date.now()-started;onProgress({report,current});};
    try{
      for(let index=0;index<config.games;index++){
        if(cancelled())break;
        const first=config.first==='alternate'?(index%2?'blue':'red'):config.first==='random'?(random()<.5?'red':'blue'):config.first;
        const rosters=config.first==='alternate'&&index%2?pairRoster:draftRoster(config,first,random);
        if(config.first==='alternate'&&index%2===0)pairRoster=rosters;
        update({index:index+1,first,rosters,decisions:0,plies:0});
        const result=await playGame(rosters,first,config,{cancelled,choose,onStep:step=>update({index:index+1,first,rosters,...step})});
        const recorded={index:index+1,...result};record(report,recorded);await onGame(recorded);update(null);await yieldUI();
      }
      report.status=cancelled()?'stopped':'complete';update(null);return report;
    }catch(error){report.status='error';report.error=error.message;update(null);error.report=report;throw error;}
  }
  const api={PRESETS,normalize,seededRandom,draftRoster,createReport,record,comboKey,createHistory,recordHistory,summarize,playGame,run};
  if(node)module.exports=api;else root.SelfPlay=api;
})(typeof globalThis!=='undefined'?globalThis:this);
