/* IndexedDB: complete game actions and versioned models survive page reloads. */
(function(root){
  'use strict';
  const RULE_VERSION='endgame-20-ply-v1';let opening;
  function open(){
    if(!opening)opening=new Promise((resolve,reject)=>{
      if(!root.indexedDB){reject(Error('此浏览器不支持训练数据存储'));return;}
      const request=indexedDB.open('crystal-duel-training',1);
      request.onupgradeneeded=()=>{const db=request.result;
        const games=db.createObjectStore('games',{keyPath:'id'});games.createIndex('createdAt','createdAt');
        db.createObjectStore('models',{keyPath:'id'});db.createObjectStore('runs',{keyPath:'id'});db.createObjectStore('meta',{keyPath:'key'});
      };
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(Error('训练数据库被其他页面占用，请关闭旧版本页面后重试'));
    }).catch(error=>{opening=null;throw error;});return opening;
  }
  async function put(store,value){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error||Error('训练数据写入失败'));tx.onabort=()=>reject(tx.error||Error('训练数据写入取消'));});}
  async function get(store,key){const db=await open();return new Promise((resolve,reject)=>{const req=db.transaction(store).objectStore(store).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function all(store){const db=await open();return new Promise((resolve,reject)=>{const req=db.transaction(store).objectStore(store).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function count(){const db=await open();return new Promise((resolve,reject)=>{const req=db.transaction('games').objectStore('games').count();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function saveGame(runId,result,metadata={}){return put('games',{...result,...metadata,id:`${runId}:${metadata.purpose||'self-play'}:${result.index}`,runId,schema:1,ruleVersion:RULE_VERSION,createdAt:Date.now()});}
  async function recentGames(limit=600){
    const db=await open();return new Promise((resolve,reject)=>{const out=[],req=db.transaction('games').objectStore('games').index('createdAt').openCursor(null,'prev');
      req.onsuccess=()=>{const cursor=req.result;if(!cursor||out.length>=limit){resolve(out);return;}if(cursor.value.ruleVersion===RULE_VERSION&&(cursor.value.winner==='red'||cursor.value.winner==='blue'))out.push(cursor.value);cursor.continue();};req.onerror=()=>reject(req.error);
    });
  }
  async function champion(){const current=await get('meta','champion');return current?await get('models',current.id):null;}
  async function promote(profile,parentId){
    if(!root.GameAI.validProfile(profile))throw Error('不能启用不兼容的模型');
    const v=profile.validation;
    if(!v?.accepted||v.completed!==20||v.wins+v.losses<16||v.wins-v.losses<4||v.wins/(v.wins+v.losses)<.6)throw Error('候选模型尚未通过独立验证');
    const db=await open();return new Promise((resolve,reject)=>{
      let promoted=false;const tx=db.transaction(['models','meta'],'readwrite'),meta=tx.objectStore('meta'),req=meta.get('champion');
      req.onsuccess=()=>{if((req.result?.id??null)!==(parentId??null))return;
        tx.objectStore('models').put({...profile,status:'active'});meta.put({key:'champion',id:profile.id});promoted=true;};
      tx.oncomplete=()=>resolve(promoted);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('模型启用事务中断'));
    });
  }
  async function saveRun(id,report){const results=report.results.map(({trajectory,...result})=>result);return put('runs',{...report,results,id});}
  async function exportDataset(){const [games,models,runs,meta]=await Promise.all([all('games'),all('models'),all('runs'),all('meta')]);return {schema:1,ruleVersion:RULE_VERSION,exportedAt:new Date().toISOString(),games,models,runs,meta};}
  root.TrainingStore={open,count,saveGame,recentGames,champion,promote,saveRun,saveModel:profile=>put('models',profile),exportDataset};
})(typeof globalThis!=='undefined'?globalThis:this);
