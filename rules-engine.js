/* Pure rules, shared by the browser and Node regression tests. */
(function (root) {
  'use strict';
  const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
  const HEROES = {
    general:{name:'将军',skill:'推进 / 军号',desc:'推进：将横纵相邻的敌人推后一格，自己进入其原位置；后方须为空格，被推者下回合不能反推。军号：周围己方士兵共享推进，并使用将军的冷却。'},
    strategist:{name:'军师',skill:'设陷',desc:'设陷：与军师位于同一行或同一列、恰好相距两格的敌人不能移动和攻击。此效果持续生效，但不限制跳跃。'},
    vanguard:{name:'先锋',skill:'陷阵 / 斩将',desc:'陷阵：跃过横纵相邻的一个棋子，落在其后方空格，开局即可使用。斩将：击破英雄后也能继续连击，连击目标可以是士兵或英雄。'},
    assassin:{name:'刺客',skill:'瞬移 / 短兵',desc:'瞬移：跳跃至棋盘上的任意空格，不受途中棋子阻挡。短兵：每次攻击只走一格，连击时同样如此。'},
    ranger:{name:'游侠',skill:'瞬闪 / 游击',desc:'瞬闪：受击前可移至横纵相邻的空格，也可承受攻击。闪避后，原攻击者进入原落点并再行动一次，期间不能再次瞬闪。游击：本次攻击及连击结束后，可额外移动一格。'},
    pikeman:{name:'尖兵',skill:'武库',desc:'武库：首次攻击可选择走一格或两格；进入连击后，每次攻击必须走满两格。'},
    mage:{name:'魔术师',skill:'移形',desc:'移形：在以自身为中心的九宫格内，交换两个相邻棋子的位置，可包含自己或敌人。被换位者获得保护，直到其下回合结束前不能再次被移形。'},
    dragon:{name:'巨龙',skill:'轰炸',desc:'轰炸：先用一次行动蓄力，下个己方回合必须先完成轰炸。沿横纵跳至三格内的任意格，也可原地落下；摧毁落点及周围的所有其他棋子，不分敌我。'},
    knight:{name:'骑士',skill:'神速 / 荣耀',desc:'神速：连续移动两格，可转弯，途中不能穿越棋子，开局即可使用。荣耀：周围己方士兵共享神速，并使用骑士的冷却，开局同样生效。'},
    wolf:{name:'狼灭',skill:'残忍 / 斩将',desc:'残忍：攻击目标也可选择己方棋子。斩将：击破英雄后也能继续连击，连击目标可以是士兵或英雄。'}
  };
  const CELLS=[];
  for(let y=0;y<4;y++)for(let x=0;x<6;x++)if(x>0&&x<5||y===1||y===2)CELLS.push({x,y});
  const key=c=>`${c.x},${c.y}`, same=(a,b)=>a.x===b.x&&a.y===b.y;
  const inside=(x,y)=>CELLS.some(c=>c.x===x&&c.y===y);
  const at=(s,x,y)=>s.units.find(u=>u.alive&&u.x===x&&u.y===y);
  const get=(s,id)=>s.units.find(u=>u.id===id);
  const near=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))===1;
  const protectedOpening=s=>s.ply<6;
  function create(rosters={red:['general','knight'],blue:['vanguard','assassin']},first='red') {
    const s={units:[],ply:0,side:first,first,phase:'normal',actor:null,combo:false,winner:null,victoryReason:null,endgameStartPly:null,cooldowns:{},pending:null,noDodge:false,events:[]};
    for(const side of ['red','blue']){
      const picks=rosters[side];
      if(!picks||picks.length!==2||new Set(picks).size!==2||picks.some(h=>!HEROES[h]))throw Error('每方请选择两名不同英雄');
      for(let y=0;y<4;y++)s.units.push({id:`${side}-s${y}`,side,type:'soldier',name:`士兵 ${y+1}`,x:side==='red'?1:4,y,alive:true});
      picks.forEach((h,i)=>s.units.push({id:`${side}-${h}`,side,type:'hero',hero:h,name:HEROES[h].name,x:side==='red'?0:5,y:i+1,alive:true}));
    }
    return s;
  }
  function trapped(s,u){return !protectedOpening(s)&&s.units.some(e=>e.alive&&e.side!==u.side&&e.hero==='strategist'&&((e.x===u.x&&Math.abs(e.y-u.y)===2)||(e.y===u.y&&Math.abs(e.x-u.x)===2)));}
  // A path may turn, but must visit distinct squares and cannot pass through a unit.
  function paths(s,u,lengths,capture=false){
    const result=[];
    function walk(p){
      const last=p[p.length-1], n=p.length-1;
      if(n&&lengths.includes(n)){
        const target=at(s,last.x,last.y);
        if(capture?target&&target.id!==u.id&&(target.side!==u.side||u.hero==='wolf'):!target)result.push({x:last.x,y:last.y,path:p.map(c=>({...c})),target:target?.id});
      }
      if(n>=Math.max(...lengths)||(n&&at(s,last.x,last.y)))return;
      for(const [dx,dy] of DIRS){const next={x:last.x+dx,y:last.y+dy};if(inside(next.x,next.y)&&!p.some(c=>same(c,next)))walk([...p,next]);}
    }
    walk([{x:u.x,y:u.y}]);
    return result.filter((r,i,all)=>all.findIndex(a=>a.x===r.x&&a.y===r.y)===i);
  }
  function attacks(s,u){
    if(protectedOpening(s)||trapped(s,u))return [];
    const lengths=u.type==='soldier'?[3]:u.hero==='assassin'?[1]:u.hero==='pikeman'&&!s.combo?[1,2]:[2];
    return paths(s,u,lengths,true).filter(c=>!s.combo||['vanguard','wolf'].includes(u.hero)||get(s,c.target).type==='soldier');
  }
  function source(s,u,hero){return s.units.find(e=>e.alive&&e.side===u.side&&e.hero===hero&&(e.id===u.id||u.type==='soldier'&&near(e,u)));}
  const ready=(s,u)=>(s.cooldowns[u.id]??0)<=s.ply;
  const cool=(s,u)=>{s.cooldowns[u.id]=s.ply+4;};
  const jump=(u,c,kind,extra={})=>({...c,kind,path:[{x:u.x,y:u.y},{x:c.x,y:c.y}],...extra});
  function skills(s,u){
    const out=[], opening=protectedOpening(s);
    const general=source(s,u,'general'), knight=source(s,u,'knight');
    if(!opening&&general&&ready(s,general)&&!trapped(s,u)&&(u.pushImmuneUntil??0)<=s.ply){
      for(const [dx,dy] of DIRS){const enemy=at(s,u.x+dx,u.y+dy),x=u.x+dx*2,y=u.y+dy*2;
        if(enemy&&enemy.side!==u.side&&inside(x,y)&&!at(s,x,y))out.push(jump(u,enemy,'push',{x:enemy.x,y:enemy.y,source:general.id,target:enemy.id,destination:{x,y}}));
      }
    }
    if(knight&&ready(s,knight)&&!trapped(s,u))out.push(...paths(s,u,[2]).map(c=>({...c,kind:'speed',source:knight.id})));
    if(u.type!=='hero'||!ready(s,u))return out;
    if(u.hero==='vanguard')for(const [dx,dy] of DIRS){const x=u.x+2*dx,y=u.y+2*dy;if(at(s,u.x+dx,u.y+dy)&&inside(x,y)&&!at(s,x,y))out.push(jump(u,{x,y},'vault',{source:u.id}));}
    if(opening)return out;
    if(u.hero==='assassin')out.push(...CELLS.filter(c=>!at(s,c.x,c.y)).map(c=>jump(u,c,'teleport',{source:u.id})));
    if(u.hero==='mage'){
      const pool=s.units.filter(e=>e.alive&&Math.abs(e.x-u.x)<=1&&Math.abs(e.y-u.y)<=1&&(e.swapImmuneUntil??0)<=s.ply);
      pool.forEach((a,i)=>pool.slice(i+1).filter(b=>near(a,b)).forEach(b=>out.push({x:a.x,y:a.y,kind:'swap',a:a.id,b:b.id,source:u.id,path:[]})));
    }
    if(u.hero==='dragon')out.push({x:u.x,y:u.y,kind:'charge',source:u.id,path:[]});
    return out;
  }
  function legal(s,id,mode='move'){
    const u=get(s,id);if(!u?.alive||s.winner)return [];
    if(s.phase==='dodge')return id===s.pending.target&&mode==='move'&&!trapped(s,u)?paths(s,u,[1]).map(c=>({...c,kind:'dodge'})):[];
    if(u.side!==s.side||(s.actor&&id!==s.actor))return [];
    if(s.phase==='bomb')return mode==='skill'?CELLS.filter(c=>(c.x===u.x||c.y===u.y)&&Math.abs(c.x-u.x)+Math.abs(c.y-u.y)<=3).map(c=>jump(u,c,'bomb')):[];
    if(s.phase==='retreat')return mode==='move'&&!trapped(s,u)?paths(s,u,[1]).map(c=>({...c,kind:'retreat'})):[];
    if(s.phase==='combo'&&mode!=='attack')return [];
    if(mode==='attack')return attacks(s,u).map(c=>({...c,kind:'attack'}));
    if(mode==='skill')return skills(s,u);
    return trapped(s,u)?[]:paths(s,u,[1]).map(c=>({...c,kind:'move'}));
  }
  function emit(s,text){s.events.push({ply:s.ply,text});}
  // The turn that reduces the board to <=3 units starts the clock at its end.
  // Combo captures, dodge and retreat are parts of that same turn.
  function trackEndgame(s,startPly=s.ply){
    if(s.units.filter(u=>u.alive).length>3){s.endgameStartPly=null;return;}
    if(s.endgameStartPly==null)s.endgameStartPly=startPly;
  }
  function endgameInfo(s){
    const active=s.endgameStartPly!=null;
    const steps=active?Math.max(0,s.ply-s.endgameStartPly):0;
    return {active,steps,remaining:Math.max(0,20-steps)};
  }
  function end(s,winner,reason){
    s.winner=winner;s.victoryReason=reason;s.phase='over';s.actor=null;
    s.combo=false;s.pending=null;s.noDodge=false;
  }
  function adjudicate(s){
    const red=s.units.filter(u=>u.alive&&u.side==='red'),blue=s.units.filter(u=>u.alive&&u.side==='blue');
    let winner,reason,detail;
    if(red.length!==blue.length){winner=red.length>blue.length?'red':'blue';reason='material';detail=`棋子数量 ${red.length} : ${blue.length}，棋子较多的一方获胜`;}
    else if(red[0].type!==blue[0].type){winner=red[0].type==='hero'?'red':'blue';reason='hero';detail='双方各剩一子，英雄战胜士兵';}
    else{winner=s.first==='red'?'blue':'red';reason='second';detail='双方各剩一子且种类相同，后手获胜';}
    end(s,winner,reason);emit(s,`残局 20 步检定：${detail}。${winner==='red'?'赤方':'靛方'}获胜。`);
  }
  function win(s){
    const r=s.units.some(u=>u.alive&&u.side==='red'),b=s.units.some(u=>u.alive&&u.side==='blue');
    if(!r||!b){end(s,r?'red':b?'blue':'draw','elimination');return true;}return false;
  }
  function finish(s){
    if(win(s))return;
    s.ply++;trackEndgame(s);
    if(endgameInfo(s).active&&endgameInfo(s).steps>=20){adjudicate(s);return;}
    s.side=s.side==='red'?'blue':'red';s.actor=null;s.combo=false;s.pending=null;s.noDodge=false;s.phase='normal';
    const charged=s.units.find(u=>u.alive&&u.side===s.side&&u.charged);
    if(charged){s.actor=charged.id;s.phase='bomb';emit(s,`${charged.name} 蓄力完成，请选择轰炸落点`);}
  }
  function afterAttack(s,u,target){
    if(win(s))return;
    trackEndgame(s,s.ply+1);
    const slayer=['vanguard','wolf'].includes(u.hero);
    if(target.type==='soldier'||slayer){s.combo=true;s.actor=u.id;s.phase='combo';if(attacks(s,u).length)return;}
    endAttack(s,u);
  }
  function endAttack(s,u){
    s.combo=false;
    if(u.hero==='ranger'&&!trapped(s,u)&&paths(s,u,[1]).length){s.phase='retreat';s.actor=u.id;return;}
    finish(s);
  }
  function capture(s,u,opt){
    const target=get(s,opt.target);u.x=opt.x;u.y=opt.y;target.alive=false;
    emit(s,`${u.name} 击破${target.side===u.side?'己方 ':''}${target.name}`);afterAttack(s,u,target);
  }
  function apply(s,id,mode,request){
    const options=legal(s,id,mode),opt=options.find(o=>o.x===request.x&&o.y===request.y&&(!request.kind||o.kind===request.kind)&&(!request.source||o.source===request.source)&&(!request.a||o.a===request.a&&o.b===request.b));
    if(!opt)throw Error('此行动不符合规则');
    trackEndgame(s);
    const u=get(s,id);
    if(opt.kind==='attack'){
      const target=get(s,opt.target);
      if(target.hero==='ranger'&&!s.noDodge&&!trapped(s,target)&&paths(s,target,[1]).length){s.pending={actor:u.id,target:target.id,opt,phase:s.phase,combo:s.combo};s.phase='dodge';emit(s,'游侠受到攻击：由防守方选择瞬闪，或承受攻击');return {kind:'reaction',opt};}
      capture(s,u,opt);return {kind:opt.kind,opt,actor:u.id};
    }
    if(opt.kind==='dodge'){
      u.x=opt.x;u.y=opt.y;const p=s.pending,attacker=get(s,p.actor);attacker.x=p.opt.x;attacker.y=p.opt.y;s.actor=p.actor;s.pending=null;s.combo=false;s.phase='normal';s.noDodge=true;emit(s,'游侠瞬闪，原攻击单位在攻击落点重新选择一次行动');return {kind:opt.kind,opt,pending:p};
    }
    if(opt.kind==='charge'){u.charged=true;emit(s,'巨龙开始蓄力');finish(s);return {kind:opt.kind,opt};}
    if(opt.kind==='swap'){
      const a=get(s,opt.a),b=get(s,opt.b);[a.x,b.x]=[b.x,a.x];[a.y,b.y]=[b.y,a.y];a.swapImmuneUntil=b.swapImmuneUntil=s.ply+3;
      cool(s,u);emit(s,`魔术师交换 ${a.name} 与 ${b.name}`);finish(s);return {kind:opt.kind,opt};
    }
    if(opt.kind==='push'){const target=get(s,opt.target);target.x=opt.destination.x;target.y=opt.destination.y;target.pushImmuneUntil=s.ply+2;}
    u.x=opt.x;u.y=opt.y;
    if(opt.kind==='bomb'){
      u.charged=false;cool(s,u);let n=0;s.units.forEach(e=>{if(e.alive&&e.id!==id&&Math.abs(e.x-u.x)<=1&&Math.abs(e.y-u.y)<=1){e.alive=false;n++;}});emit(s,`巨龙轰炸，摧毁 ${n} 个单位`);
    }else{if(opt.source)cool(s,get(s,opt.source));emit(s,`${u.name} ${ {move:'移动',retreat:'游击',speed:'神速',vault:'陷阵',teleport:'瞬移',push:'推进'}[opt.kind]}至 ${String.fromCharCode(65+u.x)}${u.y+1}`);}
    trackEndgame(s,s.ply+1);finish(s);return {kind:opt.kind,opt};
  }
  function decline(s){
    if(s.winner)return false;
    if(['dodge','combo','retreat'].includes(s.phase))trackEndgame(s);
    if(s.phase==='dodge'){const p=s.pending;s.pending=null;s.phase=p.phase;s.combo=p.combo;s.actor=p.actor;s.noDodge=true;capture(s,get(s,p.actor),p.opt);return true;}
    if(s.phase==='combo'){endAttack(s,get(s,s.actor));return true;}
    if(s.phase==='retreat'){finish(s);return true;}return false;
  }
  function hasActions(s){return s.units.filter(u=>u.alive&&u.side===s.side).some(u=>['move','attack','skill'].some(m=>legal(s,u.id,m).length));}
  function pass(s){if(s.phase!=='normal'||hasActions(s)||s.winner)throw Error('仍有合法行动，不能跳过');trackEndgame(s);emit(s,'无合法行动，交接行动权');finish(s);}
  const api={HEROES,CELLS,DIRS,create,inside,at,get,near,trapped,legal,apply,decline,pass,hasActions,protectedOpening,ready,key,endgameInfo};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Rules=api;
})(typeof globalThis!=='undefined'?globalThis:this);
