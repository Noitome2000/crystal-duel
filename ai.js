/* Offline, bounded adversarial search; uses exactly the player's rule engine. */
(function(root){
  'use strict';
  const R=typeof module!=='undefined'&&module.exports?require('./rules-engine.js'):root.Rules;
  const owner=s=>s.phase==='dodge'?R.get(s,s.pending.target).side:s.side;
  const value=u=>u.type==='soldier'?100:180;
  function actions(s){
    if(s.winner)return [];
    const out=[];
    for(const u of s.units)for(const mode of ['attack','skill','move'])for(const opt of R.legal(s,u.id,mode))out.push({type:'act',id:u.id,mode,opt});
    // Use an available dodge rather than deliberately sacrificing the ranger.
    if(['combo','retreat'].includes(s.phase)||s.phase==='dodge'&&!out.some(a=>a.opt.kind==='dodge'))out.push({type:'decline'});
    if(!out.length&&s.phase==='normal')out.push({type:'pass'});
    return out;
  }
  function next(s,a){const n=JSON.parse(JSON.stringify(s));n.events=[];if(a.type==='act')R.apply(n,a.id,a.mode,a.opt);else if(a.type==='decline')R.decline(n);else R.pass(n);return n;}
  function key(s){return `${s.side}/${s.phase}/${s.actor}/${s.combo}/${s.noDodge}/${Math.min(s.ply,6)}/${s.pending?JSON.stringify(s.pending):''}/`+s.units.filter(u=>u.alive).map(u=>`${u.id}:${u.x},${u.y},${!!u.charged},${Math.max(0,(u.pushImmuneUntil||0)-s.ply)},${Math.max(0,(u.swapImmuneUntil||0)-s.ply)},${Math.max(0,(s.cooldowns[u.id]||0)-s.ply)}`).join(';');}
  function evaluate(s,side){
    if(s.winner)return s.winner==='draw'?0:s.winner===side?100000:-100000;
    let score=0;const threatened={red:new Set(),blue:new Set()};
    for(const team of ['red','blue']){
      // Evaluate potential next-turn movement and attack, without changing the real state.
      const view={...s,side:team,phase:'normal',actor:null,combo:false,pending:null};
      for(const u of s.units.filter(u=>u.alive&&u.side===team)){
        const sign=team===side?1:-1;
        const moves=R.legal(view,u.id,'move'),attacks=R.legal(view,u.id,'attack');
        score+=sign*(value(u)+6*(3-Math.abs(u.x-2.5)-Math.abs(u.y-1.5))+moves.length*2-(R.trapped(s,u)?18:0));
        if(u.type==='soldier'){const providers=s.units.filter(e=>e.alive&&e.side===team&&R.near(e,u)&&R.ready(s,e)&&(e.hero==='knight'||e.hero==='general'&&!R.protectedOpening(s)));score+=sign*providers.length*7;}
        if(u.hero==='ranger'&&!R.trapped(s,u))score+=sign*Math.min(3,moves.length)*4;
        for(const a of attacks)if(R.get(s,a.target).side!==team)threatened[team].add(a.target);
        if(u.charged){let best=0;for(const c of R.CELLS.filter(c=>(c.x===u.x||c.y===u.y)&&Math.abs(c.x-u.x)+Math.abs(c.y-u.y)<=3)){
          const gain=s.units.filter(e=>e.alive&&e.id!==u.id&&Math.abs(e.x-c.x)<=1&&Math.abs(e.y-c.y)<=1).reduce((sum,e)=>sum+value(e)*(e.side===team?-1:1),0);best=Math.max(best,gain);
        }score+=sign*best*(s.phase==='bomb'&&s.actor===u.id?.8:.4);}
      }
    }
    for(const team of ['red','blue'])for(const id of threatened[team])score+=(team===side?1:-1)*value(R.get(s,id))*(owner(s)===team?.38:.20);
    return score;
  }
  async function choose(s,{side=owner(s),maxDepth=4,maxNodes=4500,timeMs=750,history=[],cancelled=()=>false}={}){
    const evaluations=new Map(),rankings=new Map();let cacheHits=0;
    const start=Date.now(),deadline=start+timeMs;let nodes=0,lastYield=start,completedDepth=0;
    const all=actions(s);if(!all.length)return {action:null,stats:{nodes:0,depth:0}};
    let best=all[0],score=-Infinity;
    const stop={};
    async function checkpoint(){
      if(cancelled())throw stop;
      if(Date.now()-lastYield>=10){await new Promise(r=>setTimeout(r,0));lastYield=Date.now();}
      if(nodes>=maxNodes||Date.now()>=deadline||cancelled())throw stop;
    }
    const assess=n=>{const k=key(n);if(evaluations.has(k)){cacheHits++;return evaluations.get(k);}const v=evaluate(n,side)-(history.filter(h=>h===k).length*14);evaluations.set(k,v);return v;};
    async function ranked(n,rootNode){
      const cacheKey=key(n)+'/'+rootNode;if(rankings.has(cacheKey)){cacheHits++;return rankings.get(cacheKey).slice();}
      const list=[];
      for(const action of actions(n)){await checkpoint();const child=next(n,action);nodes++;list.push({action,child,score:assess(child)});}
      const maximizing=owner(n)===side;list.sort((a,b)=>maximizing?b.score-a.score:a.score-b.score);
      // Retain every immediate win; otherwise search a bounded set of promising choices.
      // Keep captures, forced reactions and bombing even when static scores rank them low.
      const width=rootNode?20:10,kept=list.filter((c,i)=>i<width||c.child.winner||['attack','bomb','dodge'].includes(c.action.opt?.kind));
      rankings.set(cacheKey,kept);return kept.slice();
    }
    async function search(n,depth,alpha,beta,extensions){
      await checkpoint();if(n.winner)return evaluate(n,side);
      if(depth<=0){if(extensions<=0)return assess(n);if(n.phase==='normal'&&!n.actor){
          const tactical=actions(n).filter(a=>a.opt?.kind==='attack'&&R.get(n,a.opt.target).side!==R.get(n,a.id).side);
          let value=assess(n);const maximizing=owner(n)===side;
          if(maximizing){if(value>=beta)return value;alpha=Math.max(alpha,value);}else{if(value<=alpha)return value;beta=Math.min(beta,value);}
          for(const a of tactical){await checkpoint();nodes++;const v=await search(next(n,a),0,alpha,beta,extensions-1);value=maximizing?Math.max(value,v):Math.min(value,v);if(maximizing)alpha=Math.max(alpha,value);else beta=Math.min(beta,value);if(beta<=alpha)break;}return value;
        }depth=1;extensions--;}
      const maximizing=owner(n)===side,list=await ranked(n,false);let result=maximizing?-Infinity:Infinity;
      if(!list.length)return assess(n);
      for(const c of list){const v=await search(c.child,depth-1,alpha,beta,extensions);result=maximizing?Math.max(result,v):Math.min(result,v);if(maximizing)alpha=Math.max(alpha,v);else beta=Math.min(beta,v);if(beta<=alpha)break;}
      return result;
    }
    try{
      const roots=await ranked(s,true);if(roots.length){best=roots[0].action;score=roots[0].score;}
      for(let depth=1;depth<=maxDepth;depth++){
        let roundBest=best,roundScore=-Infinity,alpha=-Infinity;
        for(const c of roots){const v=await search(c.child,depth-1,alpha,Infinity,2);if(v>roundScore){roundScore=v;roundBest=c.action;}alpha=Math.max(alpha,v);}
        best=roundBest;score=roundScore;completedDepth=depth;
        if(score>=100000)break;
        roots.sort((a,b)=>(a.action===best?-1:b.action===best?1:0));
      }
    }catch(e){if(e!==stop)throw e;}
    return {action:cancelled()?null:best,stats:{nodes,depth:completedDepth,score,cacheHits,elapsedMs:Date.now()-start}};
  }
  function chooseHero(picks,side='blue',{random=Math.random}={}){
    const allies=picks[side],enemies=picks[side==='blue'?'red':'blue'];
    const weights={general:8,strategist:9,vanguard:10,assassin:8,ranger:9,pikeman:8,mage:7,dragon:7,knight:10,wolf:7};
    const score=h=>weights[h]+(h==='knight'&&allies.includes('general')||h==='general'&&allies.includes('knight')?3:0)+(h==='assassin'&&allies.includes('strategist')||h==='strategist'&&allies.includes('assassin')?3:0)+(h==='knight'&&allies.includes('vanguard')||h==='vanguard'&&allies.includes('knight')?2:0)+(h==='strategist'&&enemies.some(e=>['knight','general'].includes(e))?2:0)+(h==='ranger'&&enemies.includes('assassin')?1:0);
    // Softmax keeps the synergy preference without forcing the same maximum every game.
    const candidates=Object.keys(R.HEROES).filter(h=>!allies.includes(h));
    const best=Math.max(...candidates.map(score)),weightsByHero=candidates.map(h=>Math.exp((score(h)-best)/3));
    let ticket=random()*weightsByHero.reduce((a,b)=>a+b,0);
    for(let i=0;i<candidates.length;i++){ticket-=weightsByHero[i];if(ticket<0)return candidates[i];}
    return candidates.at(-1);
  }
  const api={owner,actions,next,key,evaluate,choose,chooseHero};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GameAI=api;
})(typeof globalThis!=='undefined'?globalThis:this);
