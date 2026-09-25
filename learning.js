/* Outcome-supervised residual linear evaluation, followed by held-out self-play. */
(function(root){
  'use strict';
  const node=typeof module!=='undefined'&&module.exports;
  const AI=node?require('./ai.js'):root.GameAI,SP=node?require('./self-play.js'):root.SelfPlay;
  const RULE_VERSION='endgame-20-ply-v1',MIN_GAMES=20,VALIDATION_GAMES=20;
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  const sigmoid=x=>1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));
  function usable(game){return game.ruleVersion===RULE_VERSION&&['red','blue'].includes(game.winner)&&Array.isArray(game.trajectory)&&game.trajectory.some(sample=>validSample(sample));}
  function validSample(sample){return ['red','blue'].includes(sample.side)&&Number.isFinite(sample.base)&&Math.abs(sample.base)<100000&&Array.isArray(sample.features)&&sample.features.length===AI.FEATURE_NAMES.length&&sample.features.every(x=>Number.isFinite(x)&&Math.abs(x)<=4);}
  function samples(game){const eligible=game.trajectory.filter(validSample),step=Math.max(1,Math.ceil(eligible.length/32));return eligible.filter((_,i)=>i%step===0);}
  async function fit(games,parent,{cancelled=()=>false,onProgress=()=>{}}={}){
    const eligible=games.filter(usable);
    if(eligible.length<MIN_GAMES)return {candidate:null,games:eligible.length,needed:MIN_GAMES-eligible.length};
    if(parent&&!AI.validProfile(parent))throw Error('旧模型格式不兼容');
    const rows=eligible.map(game=>({game,rows:samples(game)}));
    const weights=parent?parent.weights.slice():Array(AI.FEATURE_NAMES.length).fill(0);let updates=0;
    for(let epoch=0;epoch<8;epoch++){
      for(let index=0;index<rows.length;index++){
        if(cancelled())return {candidate:null,cancelled:true,games:eligible.length};
        const {game,rows:batch}=rows[index],gradient=weights.map(()=>0);
        for(const sample of batch){const target=game.winner===sample.side?1:0;
          const prediction=sigmoid((sample.base+weights.reduce((sum,w,i)=>sum+w*sample.features[i],0))/240);
          for(let i=0;i<weights.length;i++)gradient[i]+=(target-prediction)*sample.features[i]/batch.length;updates++;
        }
        for(let i=0;i<weights.length;i++)weights[i]=Math.max(-180,Math.min(180,weights[i]*.9995+8*gradient[i]));
        if(index%20===0){onProgress({epoch:epoch+1,epochs:8,games:eligible.length});await pause();}
      }
    }
    const candidate={schema:1,ruleVersion:RULE_VERSION,id:`model-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,version:(parent?.version??0)+1,parentId:parent?.id??null,createdAt:new Date().toISOString(),weights,featureNames:AI.FEATURE_NAMES.slice(),trainingGames:eligible.length,trainingSamples:updates/8,algorithm:'outcome-logistic-residual-v1',status:'candidate'};
    return {candidate,games:eligible.length};
  }
  function passesGate(stats){return stats.completed===VALIDATION_GAMES&&stats.wins+stats.losses>=16&&stats.wins-stats.losses>=4&&stats.wins/(stats.wins+stats.losses)>=.6;}
  async function validate(candidate,parent,{difficulty='fast',seed=314159,cancelled=()=>false,onProgress=()=>{},onGame=async()=>{}}={}){
    const config=SP.normalize({games:VALIDATION_GAMES,difficulty,seed,maxDecisions:600,randomMode:'uniform'}),random=SP.seededRandom(seed);
    const stats={completed:0,wins:0,losses:0,draws:0,unfinished:0,accepted:false};let pair;
    for(let index=0;index<VALIDATION_GAMES;index++){
      if(cancelled())break;
      if(index%2===0)pair=SP.draftRoster(config,'red',random);
      const candidateSide=index%2?'blue':'red',rosters=index%2?{red:pair.blue,blue:pair.red}:pair;
      const result=await SP.playGame(rosters,'red',config,{cancelled,choose:(state,options)=>AI.choose(state,{...options,profile:AI.owner(state)===candidateSide?candidate:parent}),onStep:()=>onProgress({...stats,index:index+1})});
      stats.completed++;if(result.winner==='draw')stats.draws++;else if(!result.winner)stats.unfinished++;else if(result.winner===candidateSide)stats.wins++;else stats.losses++;
      await onGame({index:index+1,...result,candidateSide,candidateId:candidate.id,parentId:parent?.id??null});onProgress({...stats,index:index+1});await pause();
    }
    stats.accepted=!cancelled()&&passesGate(stats);return stats;
  }
  const api={MIN_GAMES,VALIDATION_GAMES,fit,validate,passesGate,usable};if(node)module.exports=api;else root.GameLearning=api;
})(typeof globalThis!=='undefined'?globalThis:this);
