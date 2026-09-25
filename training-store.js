/* IndexedDB cache plus an optional, user-selected durable local JSON file. */
(function(root){
  'use strict';
  const RULE_VERSION='endgame-20-ply-v1',FILE_NAME='crystal-duel-training.json';let opening,directoryHandle=null,folderError='',writeTimer=null,writeQueue=Promise.resolve();
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
  function queueFileWrite(){if(!directoryHandle)return;clearTimeout(writeTimer);writeTimer=setTimeout(()=>{flushFile().catch(error=>{folderError=error.message;});},1500);}
  async function hasPermission(handle,request=false){if(!handle)return false;let state=await handle.queryPermission({mode:'readwrite'});if(state!=='granted'&&request)state=await handle.requestPermission({mode:'readwrite'});return state==='granted';}
  function fileStatus(){return {supported:typeof root.showDirectoryPicker==='function',connected:!!directoryHandle,name:directoryHandle?.name||'',error:folderError,fileName:FILE_NAME};}
  async function datasetFromFile(handle){
    const fileHandle=await handle.getFileHandle(FILE_NAME);const file=await fileHandle.getFile();
    if(file.size>250*1024*1024)throw Error('本地训练文件超过 250 MB，拒绝自动载入');
    const dataset=JSON.parse(await file.text());if(dataset.schema!==1||!Array.isArray(dataset.games)||!Array.isArray(dataset.models)||!Array.isArray(dataset.runs)||!Array.isArray(dataset.meta))throw Error('本地训练文件格式不正确');return dataset;
  }
  async function mergeDataset(dataset){
    const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['games','models','runs','meta'],'readwrite');
      for(const [store,items]of [['games',dataset.games],['models',dataset.models],['runs',dataset.runs],['meta',dataset.meta]])for(const item of items)tx.objectStore(store).put(item);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('合并本地训练文件失败'));
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
  async function exportDataset(){const [games,models,runs,meta]=await Promise.all([all('games'),all('models'),all('runs'),all('meta')]);return {schema:1,ruleVersion:RULE_VERSION,exportedAt:new Date().toISOString(),games,models,runs,meta};}
  async function flushFile(){
    if(!directoryHandle)return false;clearTimeout(writeTimer);writeTimer=null;
    const run=writeQueue.then(async()=>{if(!await hasPermission(directoryHandle))throw Error('请重新授权训练文件夹');const data=await exportDataset(),handle=await directoryHandle.getFileHandle(FILE_NAME,{create:true}),writer=await handle.createWritable();await writer.write(JSON.stringify(data));await writer.close();folderError='';return true;});
    writeQueue=run.catch(()=>{});return run;
  }
  async function connectFolder(){
    if(typeof root.showDirectoryPicker!=='function')throw Error('此浏览器不支持直接写入文件夹，请使用导出 / 导入训练数据文件');
    if(!directoryHandle){directoryHandle=await root.showDirectoryPicker({id:'crystal-duel-training',mode:'readwrite'});await put('meta',{key:'directoryHandle',handle:directoryHandle});}
    if(!await hasPermission(directoryHandle,true))throw Error('未获得训练文件夹读写权限');
    try{await mergeDataset(await datasetFromFile(directoryHandle));}catch(error){if(error.name!=='NotFoundError')throw error;}
    await flushFile();return fileStatus();
  }
  async function restoreFolder(){
    const saved=await get('meta','directoryHandle');directoryHandle=saved?.handle||null;if(!directoryHandle)return fileStatus();
    if(!await hasPermission(directoryHandle)){folderError='已记住训练文件夹；点击“连接 / 选择文件夹”恢复访问权限';return fileStatus();}
    try{await mergeDataset(await datasetFromFile(directoryHandle));}catch(error){if(error.name!=='NotFoundError')folderError=error.message;}
    if(!folderError)await flushFile();return fileStatus();
  }
  async function importDataset(dataset){if(!dataset||dataset.schema!==1||!Array.isArray(dataset.games)||!Array.isArray(dataset.models)||!Array.isArray(dataset.runs)||!Array.isArray(dataset.meta))throw Error('训练数据文件格式不兼容');await mergeDataset(dataset);if(directoryHandle)await flushFile();return count();}
  async function saveModel(profile){await put('models',profile);queueFileWrite();return profile;}
  root.TrainingStore={open,count,saveGame,recentGames,champion,promote,saveRun,saveModel,exportDataset,importDataset,restoreFolder,connectFolder,flushFile,fileStatus,FILE_NAME};
})(typeof globalThis!=='undefined'?globalThis:this);
