const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
let playwright;try{playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');}catch{playwright=require('C:/Users/chen2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=require('node:http').createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}const data=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data);}catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await playwright.chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const url=process.env.GAME_URL||`http://127.0.0.1:${server.address().port}/training.html`;
    const ready=()=>page.waitForFunction(()=>!document.querySelector('#startTraining').disabled);
    await page.goto(url);await ready();
    const fixture=await page.evaluate(()=>{
      const base={schema:1,ruleVersion:'endgame-20-ply-v1',runId:'batch',createdAt:1,first:'red',winner:'red',trajectory:[{features:[0],action:'unchanged'}]};
      const hit={...base,id:'hit',rosters:{red:['mage','knight'],blue:['dragon','ranger']}};
      const keep={...base,id:'keep',rosters:{red:['general','knight'],blue:['dragon','ranger']}};
      return {schema:1,games:[hit,{...hit,id:'validation',purpose:'validation'},keep],runs:[],models:[{schema:1,ruleVersion:'endgame-20-ply-v1',id:'trained',version:9,weights:Array(GameAI.FEATURE_NAMES.length).fill(1)}],meta:[{key:'champion',id:'trained'}]};
    });
    await page.locator('#datasetFile').setInputFiles({name:'before-skills.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await ready();
    const oldId=await page.locator('#librarySelect').inputValue();assert.match(await page.locator('#modelStatus').innerText(),/版本 9/);
    await page.fill('#libraryName','新技能训练');await page.click('#newLibrary');await ready();
    const newId=await page.locator('#librarySelect').inputValue();assert.notEqual(newId,oldId);
    let data=await page.evaluate(()=>TrainingStore.exportDataset());assert.equal(data.games.length,0);assert.equal(data.models.length,0);assert.equal(data.runs.length,0);assert.deepEqual(data.meta,[]);
    assert.equal(await page.evaluate(()=>TrainingStore.fileStatus().connected),false);assert.match(await page.locator('#modelStatus').innerText(),/内置/);
    await page.reload();await ready();assert.equal(await page.locator('#librarySelect').inputValue(),newId);assert.equal(await page.evaluate(()=>TrainingStore.count()),0);
    await page.selectOption('#librarySelect',oldId);await ready();assert.equal(await page.evaluate(()=>TrainingStore.count()),3);assert.match(await page.locator('#modelStatus').innerText(),/版本 9/);
    await page.locator('.library-cleanup summary').click();await page.selectOption('#cleanupHero','mage');await page.click('#previewCleanup');await ready();
    assert.match(await page.locator('#cleanupPreview').innerText(),/2 局，保留 1 局/);
    page.once('dialog',d=>d.dismiss());await page.click('#confirmCleanup');assert.equal(await page.evaluate(()=>TrainingStore.count()),3);
    page.once('dialog',d=>d.accept());await page.click('#confirmCleanup');await ready();
    data=await page.evaluate(()=>TrainingStore.exportDataset());assert.deepEqual(data.games,[fixture.games[2]]);assert.deepEqual(data.models,[]);assert.equal(data.meta.some(m=>m.key==='champion'),false);
    assert.equal(data.statistics.heroes.mage.appearances,0);assert.equal(data.statistics.completed,1);assert.match(await page.locator('#modelStatus').innerText(),/内置/);
    const cleanedId=await page.locator('#librarySelect').inputValue();assert.notEqual(cleanedId,oldId);
    await page.reload();await ready();assert.equal(await page.evaluate(()=>TrainingStore.count()),1);
    await page.selectOption('#librarySelect',oldId);await ready();assert.equal(await page.evaluate(()=>TrainingStore.count()),3);
    await page.selectOption('#librarySelect',cleanedId);await ready();
    // Another page cannot change a library during a running training session; stale writes are rejected afterward.
    const other=await context.newPage();await other.goto(url);await other.waitForFunction(()=>!document.querySelector('#startTraining').disabled);
    await page.evaluate(()=>{window.holding=TrainingStore.withSession(()=>new Promise(resolve=>{window.releaseTrainingLock=resolve;}));});
    const refused=await other.evaluate(async()=>{try{await TrainingStore.newLibrary('must not create');return false;}catch(e){return /另一个页面/.test(e.message);}});assert.equal(refused,true);
    await page.evaluate(async()=>{releaseTrainingLock();await holding;});
    await page.fill('#libraryName','并发保护测试');await page.click('#newLibrary');await ready();
    const stale=await other.evaluate(async()=>{try{await TrainingStore.saveGame('stale',{index:1});return false;}catch(e){return /刷新/.test(e.message);}});assert.equal(stale,true);await other.close();
    // File boundary is mocked; transactions, serialization, backup order, and failure recovery use real code.
    const files=await page.evaluate(async fixture=>{
      const memory=new Map(),events=[];let failName=null;
      const handle={name:'fixture-folder',queryPermission:async()=> 'granted',isSameEntry:async other=>other?.name==='fixture-folder',getFileHandle:async(name,{create=false}={})=>{
        if(!create&&!memory.has(name))throw new DOMException('Missing','NotFoundError');
        return {getFile:async()=>new Blob([memory.get(name)]),createWritable:async()=>({write:async text=>{if(name===failName)throw Error('simulated disk error');memory.set(name,text);events.push(name);},close:async()=>{},abort:async()=>{}})};
      }};
      const nativePut=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(value,...args){return nativePut.call(this,this.name==='meta'&&value.key==='directoryHandle'?{key:'directoryHandle',handle:{name:handle.name}}:value,...args);};
      window.showDirectoryPicker=async()=>handle;
      await TrainingStore.connectFolder();const fresh=JSON.parse(memory.get(TrainingStore.FILE_NAME));
      // Detach the serializable marker before loading the file's library.
      const detach=async()=>{const db=await TrainingStore.open();await new Promise(resolve=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').delete('directoryHandle');tx.oncomplete=resolve;});await TrainingStore.restoreFolder();};
      await detach();memory.set(TrainingStore.FILE_NAME,JSON.stringify(fixture));
      await TrainingStore.connectFolder();const loaded=await TrainingStore.exportDataset();
      // addLibrary keeps the real selected handle after activation. Reset disk writes list before cleaning.
      events.length=0;const result=await TrainingStore.removeHero('mage');
      const cleaned=JSON.parse(memory.get(TrainingStore.FILE_NAME)),backup=JSON.parse(memory.get(result.backupName));
      await detach();
      // A failed cleaned-file write must restore the original active library.
      memory.set(TrainingStore.FILE_NAME,JSON.stringify(fixture));await TrainingStore.connectFolder();const beforeId=TrainingStore.libraryInfo().active;
      failName=TrainingStore.FILE_NAME;let rejected=false;
      try{await TrainingStore.removeHero('mage');}catch(e){rejected=/写回文件失败/.test(e.message);}
      const recovered=await TrainingStore.exportDataset();
      await detach();IDBObjectStore.prototype.put=nativePut;
      return {fresh:fresh.games.length,loaded:loaded.games.length,cleaned:cleaned.games.map(g=>g.id),backup:backup.games.length,events:events.slice(0,2),backupName:result.backupName,rejected,recovered:recovered.games.length,sameId:beforeId===TrainingStore.libraryInfo().active};
    },fixture);
    assert.equal(files.fresh,0);assert.equal(files.loaded,3);assert.deepEqual(files.cleaned,['keep']);assert.equal(files.backup,3);
    assert.deepEqual(files.events,[files.backupName,'crystal-duel-training.json']);assert.equal(files.rejected,true);assert.equal(files.recovered,3);assert.equal(files.sameId,true);
    await page.reload();await ready();
    for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
    await page.locator('#librarySelect').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'artifacts/libraries-mobile.png')});
    await page.setViewportSize({width:1440,height:1100});await page.locator('#librarySelect').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'artifacts/libraries-desktop.png')});
    assert.deepEqual(errors,[]);console.log('PASS: independent libraries, preserved originals, hero cleanup, models reset, reload, locks, stale writes, file backup and disk failure recovery.');
    // Verify the offline game and training page share the selected library too.
    if(!process.env.GAME_URL){const offline=await browser.newContext(),training=await offline.newPage();await training.goto(pathToFileURL(path.join(root,'training.html')).href);await training.waitForFunction(()=>!document.querySelector('#startTraining').disabled);await training.evaluate(()=>TrainingStore.newLibrary('offline-new'));
      const game=await offline.newPage();await game.goto(pathToFileURL(path.join(root,'index.html')).href);await game.waitForFunction(()=>window.TrainingStore&&document.querySelector('#aiModelStatus').textContent.includes('内置'));
      assert.equal(await game.evaluate(()=>TrainingStore.libraryInfo().active),await training.evaluate(()=>TrainingStore.libraryInfo().active));await offline.close();}
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
