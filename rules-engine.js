/* Pure rules, shared by the browser and Node regression tests. */
(function (root) {
  'use strict';
  const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
  const HEROES = {
    general:{name:'将军',skill:'推进 / 军号',desc:'推动相邻敌人一格。周围八格的己方士兵共享此能力与冷却。被推动者下一回合不能反推。'},
    strategist:{name:'军师',skill:'设陷',desc:'同一横排或纵列、恰好两格外的敌人不能移动和攻击；跳跃不受限制。'},
    vanguard:{name:'先锋',skill:'陷阵 / 斩将',desc:'跳过一个相邻单位。开局可用；击破英雄后也能连击，并可连续攻击英雄。'},
    assassin:{name:'刺客',skill:'瞬移 / 短兵',desc:'跳跃到任意空格。攻击距离固定为一格。'},
    ranger:{name:'游侠',skill:'瞬闪 / 游击',desc:'被攻击前可闪避一格，原攻击者到达攻击落点后重选行动；本次重行动不能再次闪避。攻击及连击结束后可移动一格。'},
    pikeman:{name:'尖兵',skill:'武库',desc:'首次攻击可以走一格或两格；连击时必须走满两格。'},
    mage:{name:'魔术师',skill:'移形',desc:'交换自身周围 3×3 内两个相邻单位。被交换者下一回合不能再次被移形。'},
    dragon:{name:'巨龙',skill:'轰炸',desc:'本回合蓄力，下个己方回合必须横纵跳跃零至三格；摧毁落点及周围八格的其他所有单位。'},
    knight:{name:'骑士',skill:'神速 / 荣耀',desc:'移动两格，不穿越单位。周围八格的己方士兵共享此能力与冷却；开局可用。'},
    wolf:{name:'狼灭',skill:'残忍 / 斩将',desc:'可以攻击己方单位。击破英雄后也能连击，并可连续攻击英雄。'}
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
    const s={units:[],ply:0,side:first,first,phase:'normal',actor:null,combo:false,winner:null,cooldowns:{},pending:null,noDodge:false,events:[]};
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
    if(s.phase==='dodge')return id===s.pending.target&&mode==='move'?paths(s,u,[1]).map(c=>({...c,kind:'dodge'})):[];
    if(u.side!==s.side||(s.actor&&id!==s.actor))return [];
    if(s.phase==='bomb')return mode==='skill'?CELLS.filter(c=>(c.x===u.x||c.y===u.y)&&Math.abs(c.x-u.x)+Math.abs(c.y-u.y)<=3).map(c=>jump(u,c,'bomb')):[];
    if(s.phase==='retreat')return mode==='move'&&!trapped(s,u)?paths(s,u,[1]).map(c=>({...c,kind:'retreat'})):[];
    if(s.phase==='combo'&&mode!=='attack')return [];
    if(mode==='attack')return attacks(s,u).map(c=>({...c,kind:'attack'}));
    if(mode==='skill')return skills(s,u);
    return trapped(s,u)?[]:paths(s,u,[1]).map(c=>({...c,kind:'move'}));
  }
  function emit(s,text){s.events.push({ply:s.ply,text});}
  function win(s){
    const r=s.units.some(u=>u.alive&&u.side==='red'),b=s.units.some(u=>u.alive&&u.side==='blue');
    if(!r||!b){s.winner=r?'red':b?'blue':'draw';s.phase='over';s.actor=null;return true;}return false;
  }
  function finish(s){
    if(win(s))return;
    s.ply++;s.side=s.side==='red'?'blue':'red';s.actor=null;s.combo=false;s.pending=null;s.noDodge=false;s.phase='normal';
    const charged=s.units.find(u=>u.alive&&u.side===s.side&&u.charged);
    if(charged){s.actor=charged.id;s.phase='bomb';emit(s,`${charged.name} 蓄力完成，请选择轰炸落点`);}
  }
  function afterAttack(s,u,target){
    if(win(s))return;
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
    const u=get(s,id);
    if(opt.kind==='attack'){
      const target=get(s,opt.target);
      if(target.hero==='ranger'&&!s.noDodge&&paths(s,target,[1]).length){s.pending={actor:u.id,target:target.id,opt,phase:s.phase,combo:s.combo};s.phase='dodge';emit(s,'游侠受到攻击：由防守方选择瞬闪，或承受攻击');return {kind:'reaction',opt};}
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
    finish(s);return {kind:opt.kind,opt};
  }
  function decline(s){
    if(s.winner)return false;
    if(s.phase==='dodge'){const p=s.pending;s.pending=null;s.phase=p.phase;s.combo=p.combo;s.actor=p.actor;s.noDodge=true;capture(s,get(s,p.actor),p.opt);return true;}
    if(s.phase==='combo'){endAttack(s,get(s,s.actor));return true;}
    if(s.phase==='retreat'){finish(s);return true;}return false;
  }
  function hasActions(s){return s.units.filter(u=>u.alive&&u.side===s.side).some(u=>['move','attack','skill'].some(m=>legal(s,u.id,m).length));}
  function pass(s){if(s.phase!=='normal'||hasActions(s)||s.winner)throw Error('仍有合法行动，不能跳过');emit(s,'无合法行动，交接行动权');finish(s);}
  const api={HEROES,CELLS,DIRS,create,inside,at,get,near,trapped,legal,apply,decline,pass,hasActions,protectedOpening,ready,key};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Rules=api;
})(typeof globalThis!=='undefined'?globalThis:this);
