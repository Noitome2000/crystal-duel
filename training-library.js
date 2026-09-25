/* Portable dataset operations; never mutate the supplied snapshot. */
(function(root){
  'use strict';
  const node=typeof module!=='undefined'&&module.exports;
  const SP=node?require('./self-play.js'):root.SelfPlay;
  function validate(data){
    if(!data||data.schema!==1)throw Error('训练数据文件格式不兼容');
    for(const store of ['games','models','runs','meta']){
      if(!Array.isArray(data[store]))throw Error(`训练文件缺少 ${store}`);
      const key=store==='meta'?'key':'id',seen=new Set();
      for(const item of data[store]){
        if(!item||typeof item[key]!=='string'||!item[key]||seen.has(item[key]))throw Error(`训练文件 ${store} 存在无效或重复标识`);
        seen.add(item[key]);
      }
    }
    return data;
  }
  function empty(){return {schema:1,ruleVersion:'endgame-20-ply-v1',games:[],models:[],runs:[],meta:[]};}
  function involves(game,hero){return ['red','blue'].some(side=>Array.isArray(game.rosters?.[side])&&game.rosters[side].includes(hero));}
  function preview(data,hero){
    validate(data);
    if(!Object.hasOwn(SP.createHistory().heroes,hero))throw Error('请选择有效英雄');
    const removed=data.games.filter(game=>involves(game,hero)).length;
    return {hero,total:data.games.length,removed,retained:data.games.length-removed,modelsCleared:removed?data.models.length:0};
  }
  function cleanHero(data,hero){
    const counts=preview(data,hero);
    if(!counts.removed)return {dataset:data,...counts};
    const games=data.games.filter(game=>!involves(game,hero)),groups=new Map();
    for(const game of games){const id=game.runId||'legacy-import';if(!groups.has(id))groups.set(id,[]);groups.get(id).push(game);}
    const runs=[];
    for(const [id,records]of groups){const report=SP.createHistory(),results=[];
      for(const record of records){const before=report.completed;SP.recordHistory(report,record);if(report.completed>before){const {trajectory,...game}=record;results.push(game);}}
      if(report.completed)runs.push({...report,id,status:'rebuilt',results});
    }
    // Learned weights cannot be separated by hero. Refit retained games from the built-in policy.
    const dataset={...data,games,models:[],runs,meta:data.meta.filter(item=>!['champion','directoryHandle'].includes(item.key)),
      exportedAt:new Date().toISOString(),statistics:SP.summarize(games),
      lastCleanup:{hero,removed:counts.removed,modelsCleared:data.models.length,at:new Date().toISOString()}};
    return {dataset,...counts};
  }
  const api={validate,empty,involves,preview,cleanHero};if(node)module.exports=api;else root.TrainingLibrary=api;
})(typeof globalThis!=='undefined'?globalThis:this);
