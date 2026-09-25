/* Independent IndexedDB libraries plus optional, user-selected JSON snapshots. */
(function(root){
  'use strict';
  const RULE_VERSION='endgame-20-ply-v1',FILE_NAME='crystal-duel-training.json';let opening,directoryHandle=null,folderError='',writeTimer=null,writeQueue=Promise.resolve(),bound=null,exclusive=false;
  const CATALOG='crystal-duel-training-libraries-v1',LOCK='crystal-duel-training-write',STORES=['games','models','runs','meta'];
  const uid=()=>root.crypto.randomUUID();
  function catalog(){
    const raw=localStorage.getItem(CATALOG);
    if(raw){const value=JSON.parse(raw);if(!value.libraries?.some(item=>item.id===value.active))throw Error('训练库目录损坏，请先导出备份');return value;}
    return {active:'legacy',token:'legacy',libraries:[{id:'legacy',name:'原训练库',dbName:'crystal-duel-training',createdAt:new Date().toISOString()}]};
  }
  function libraryInfo(){const c=catalog();return {active:c.active,libraries:c.libraries.map(({id,name,createdAt})=>({id,name,createdAt}))};}
  function assertCurrent(){if(bound&&bound.token!==catalog().token)throw Error('其他页面已切换训练库，请刷新本页后继续');}
  async function withSession(callback){
    if(!root.navigator?.locks)throw Error('当前浏览器不支持训练库安全锁，请使用新版 Edge / Chrome');
    if(exclusive)throw Error('当前页面正在处理训练数据，请等待完成');
    return navigator.locks.request(LOCK,{ifAvailable:true},async lock=>{
      if(!lock)throw Error('另一个页面正在训练或修改训练库，请先停止该页面的任务');
      assertCurrent();exclusive=true;try{return await callback();}finally{exclusive=false;}
    });
  }
  async function adoptActive(){
    if(!bound||bound.token===catalog().token)return;
    clearTimeout(writeTimer);writeTimer=null;await writeQueue;
    if(opening)(await opening).close();opening=null;bound=null;directoryHandle=null;folderError='';
  }
  function open(){
    assertCurrent();
    if(!opening)opening=new Promise((resolve,reject)=>{
      if(!root.indexedDB){reject(Error('此浏览器不支持训练数据存储'));return;}
      const c=catalog();bound={token:c.token,...c.libraries.find(item=>item.id===c.active)};
      const request=indexedDB.open(bound.dbName,1);
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
  async function count(){const db=await open();return new Promise((resolve,reject)=>{const req=db.transaction('games').objectStore('games').count();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  function queueFileWrite(){if(!directoryHandle)return;clearTimeout(writeTimer);writeTimer=setTimeout(()=>{flushFile().catch(error=>{folderError=error.message;});},1500);}
  async function hasPermission(handle,request=false){if(!handle)return false;let state=await handle.queryPermission({mode:'readwrite'});if(state!=='granted'&&request)state=await handle.requestPermission({mode:'readwrite'});return state==='granted';}
  function fileStatus(){return {supported:typeof root.showDirectoryPicker==='function',connected:!!directoryHandle,name:directoryHandle?.name||'',error:folderError,fileName:FILE_NAME};}
  async function datasetFromFile(handle){
    const fileHandle=await handle.getFileHandle(FILE_NAME);const file=await fileHandle.getFile();
    if(file.size>250*1024*1024)throw Error('本地训练文件超过 250 MB，拒绝自动载入');
    const dataset=JSON.parse(await file.text());if(dataset.schema!==1||!Array.isArray(dataset.games)||!Array.isArray(dataset.models)||!Array.isArray(dataset.runs)||!Array.isArray(dataset.meta))throw Error('本地训练文件格式不正确');return dataset;
  }
  async function replaceDataset(dataset,handle=null,targetDb=null){
    const db=targetDb||await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['games','models','runs','meta'],'readwrite');
      try{
      for(const store of STORES)tx.objectStore(store).clear();
      for(const [store,items]of [['games',dataset.games],['models',dataset.models],['runs',dataset.runs],['meta',dataset.meta]])for(const item of items){
        // A directory handle belongs to this browser, and cannot survive JSON serialization.
        if(store==='meta'&&item.key==='directoryHandle')continue;
        tx.objectStore(store).put(item);
      }
      if(handle)tx.objectStore('meta').put({key:'directoryHandle',handle});
      }catch(error){tx.abort();reject(error);return;}
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('载入训练文件失败'));
    });
  }
  async function saveGame(runId,result,metadata={}){const value={...result,...metadata,id:`${runId}:${metadata.purpose||'self-play'}:${result.index}`,runId,schema:1,ruleVersion:RULE_VERSION,createdAt:Date.now()};await put('games',value);queueFileWrite();return value;}
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
    }).then(value=>{if(value)queueFileWrite();return value;});
  }
  async function saveRun(id,report){const results=report.results.map(({trajectory,...result})=>result);const value={...report,results,id};await put('runs',value);queueFileWrite();return value;}
  async function statistics(){
    const report=root.SelfPlay.createHistory(),db=await open();
    return new Promise((resolve,reject)=>{const req=db.transaction('games').objectStore('games').openCursor();
      req.onsuccess=()=>{const cursor=req.result;if(!cursor){resolve(report);return;}root.SelfPlay.recordHistory(report,cursor.value);cursor.continue();};
      req.onerror=()=>reject(req.error);
    });
  }
  async function exportDataset(){
    const db=await open(),data=await new Promise((resolve,reject)=>{const tx=db.transaction(STORES),out={};
      for(const key of STORES){const req=tx.objectStore(key).getAll();req.onsuccess=()=>{out[key]=req.result;};}
      tx.oncomplete=()=>resolve(out);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    return {schema:1,ruleVersion:RULE_VERSION,library:{id:bound.id,name:bound.name},exportedAt:new Date().toISOString(),...data,meta:data.meta.filter(item=>item.key!=='directoryHandle'),...(root.SelfPlay?{statistics:root.SelfPlay.summarize(data.games)}:{})};
  }
  async function writeSnapshot(handle,data,name=FILE_NAME){
    const writer=await (await handle.getFileHandle(name,{create:true})).createWritable();
    try{await writer.write(JSON.stringify(data));await writer.close();}catch(error){try{await writer.abort();}catch{}throw error;}
  }
  async function flushFile(){
    assertCurrent();if(!directoryHandle)return false;clearTimeout(writeTimer);writeTimer=null;const handle=directoryHandle,token=bound?.token;
    const run=writeQueue.then(async()=>{assertCurrent();if(token!==bound?.token)throw Error('训练库已切换，取消旧文件写入');if(!await hasPermission(handle))throw Error('请重新授权训练文件夹');await writeSnapshot(handle,await exportDataset());folderError='';return true;});
    writeQueue=run.catch(()=>{});return run;
  }
  async function connectFolder(){
    if(typeof root.showDirectoryPicker!=='function')throw Error('此浏览器不支持直接写入文件夹，请使用导出 / 导入训练数据文件');
    const chosen=await root.showDirectoryPicker({id:'crystal-duel-training',mode:'readwrite'});
    return withSession(async()=>{
      await settle();if(!await hasPermission(chosen,true))throw Error('未获得训练文件夹读写权限');
      let existing;try{existing=await datasetFromFile(chosen);}catch(error){if(error.name!=='NotFoundError')throw error;}
      if(directoryHandle&&!(chosen.isSameEntry&&await chosen.isSameEntry(directoryHandle)))await flushFile();
      if(existing){await addLibrary(chosen.name,existing,chosen);}
      else{await writeSnapshot(chosen,await exportDataset());await put('meta',{key:'directoryHandle',handle:chosen});directoryHandle=chosen;}
      await detachOtherFolders(chosen);folderError='';return fileStatus();
    });
  }
  async function restoreFolder(){
    await adoptActive();
    const saved=await get('meta','directoryHandle');directoryHandle=saved?.handle||null;if(!directoryHandle)return fileStatus();
    if(!await hasPermission(directoryHandle)){folderError='已记住训练文件夹；点击“连接 / 选择文件夹”恢复访问权限';return fileStatus();}
    // Browser state is authoritative. Never resurrect deleted games from an older file on refresh.
    folderError='';return fileStatus();
  }
  async function reauthorizeFolder(){if(!directoryHandle)return connectFolder();const permission=hasPermission(directoryHandle,true);return withSession(async()=>{if(!await permission)throw Error('未获得文件夹权限');folderError='';await flushFile();return fileStatus();});}
  async function settle(){clearTimeout(writeTimer);writeTimer=null;await writeQueue;assertCurrent();}
  async function activateLibrary(id){
    const c=catalog();if(!c.libraries.some(item=>item.id===id))throw Error('训练库不存在');
    localStorage.setItem(CATALOG,JSON.stringify({...c,active:id,token:uid()}));await adoptActive();await open();
    directoryHandle=(await get('meta','directoryHandle'))?.handle||null;root.GameAI?.setProfile(null);return libraryInfo();
  }
  async function addLibrary(name,dataset,handle=null){
    root.TrainingLibrary.validate(dataset);name=String(name||'导入训练库').trim();if(!name||name.length>80)throw Error('训练库名称须为 1～80 个字符');
    const c=catalog(),oldId=c.active,id=uid(),entry={id,name,dbName:`crystal-duel-training-${id}`,createdAt:new Date().toISOString()};
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(entry.dbName,1);request.onupgradeneeded=()=>{const db=request.result;const games=db.createObjectStore('games',{keyPath:'id'});games.createIndex('createdAt','createdAt');for(const key of ['models','runs','meta'])db.createObjectStore(key,{keyPath:key==='meta'?'key':'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    try{await replaceDataset(dataset,handle,db);}finally{db.close();}
    localStorage.setItem(CATALOG,JSON.stringify({...c,libraries:[...c.libraries,entry]}));
    try{await activateLibrary(id);directoryHandle=handle;return libraryInfo();}
    catch(error){await activateLibrary(oldId);const now=catalog();localStorage.setItem(CATALOG,JSON.stringify({...now,libraries:now.libraries.filter(item=>item.id!==id)}));throw error;}
  }
  async function newLibrary(name){return withSession(async()=>{await settle();if(directoryHandle)await flushFile();return addLibrary(name,root.TrainingLibrary.empty());});}
  async function switchLibrary(id){return withSession(async()=>{await settle();if(directoryHandle)await flushFile();return activateLibrary(id);});}
  async function importDataset(dataset,name='导入训练库'){return withSession(async()=>{
    root.TrainingLibrary.validate(dataset);await settle();if(directoryHandle)await flushFile();await addLibrary(name,dataset);return count();
  });}
  async function previewHero(hero){return root.TrainingLibrary.preview(await exportDataset(),hero);}
  async function detachOtherFolders(handle){
    if(!handle?.isSameEntry)return;
    for(const entry of catalog().libraries){if(entry.id===bound.id)continue;
      const db=await new Promise((resolve,reject)=>{const req=indexedDB.open(entry.dbName,1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
      try{const saved=await new Promise((resolve,reject)=>{const req=db.transaction('meta').objectStore('meta').get('directoryHandle');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
        if(saved?.handle&&await handle.isSameEntry(saved.handle))await new Promise((resolve,reject)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').delete('directoryHandle');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
      }finally{db.close();}
    }
  }
  async function removeHero(hero,expected=null){return withSession(async()=>{
    await settle();const original=await exportDataset(),result=root.TrainingLibrary.cleanHero(original,hero);
    if(expected&&(result.total!==expected.total||result.removed!==expected.removed))throw Error('记录已变化，请重新预览清理范围');
    if(!result.removed)return result;
    const handle=directoryHandle,backupName=`crystal-duel-training.backup-${uid()}.json`,oldId=bound.id,oldName=bound.name;
    if(handle){if(!await hasPermission(handle))throw Error('请先重新授权训练文件夹');await writeSnapshot(handle,original,backupName);}
    await addLibrary(`${oldName.slice(0,65)} · 清理后`,result.dataset,handle);
    try{if(handle)await flushFile();}catch(error){await activateLibrary(oldId);throw Error(`写回文件失败，已恢复原训练库：${error.message}`);}
    // Detach the archived library without briefly activating its old model.
    const old=catalog().libraries.find(item=>item.id===oldId);
    const db=await new Promise((resolve,reject)=>{const req=indexedDB.open(old.dbName,1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    try{await new Promise((resolve,reject)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').delete('directoryHandle');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}
    return {...result,backupName:handle?backupName:null};
  });}
  async function saveModel(profile){await put('models',profile);queueFileWrite();return profile;}
  root.TrainingStore={open,count,saveGame,recentGames,champion,promote,saveRun,saveModel,statistics,exportDataset,importDataset,restoreFolder,connectFolder,reauthorizeFolder,flushFile,fileStatus,FILE_NAME,libraryInfo,newLibrary,switchLibrary,previewHero,removeHero,withSession};
})(typeof globalThis!=='undefined'?globalThis:this);
