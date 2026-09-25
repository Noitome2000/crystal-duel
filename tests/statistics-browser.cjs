const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
let playwright;try{playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');}catch{playwright=require('C:/Users/chen2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=require('node:http').createServer(async(req,res)=>{
    try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
      if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
      const body=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(body);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await playwright.chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.GAME_URL||`http://127.0.0.1:${server.address().port}/training.html`);
    await page.waitForFunction(()=>!document.querySelector('#startTraining').disabled);
    assert.equal(await page.locator('#combinationResults tr').count(),45);assert.match(await page.locator('#statisticsSummary').innerText(),/0 局/);
    const imported=await page.evaluate(async()=>{
      const rosters={red:['mage','knight'],blue:['dragon','ranger']};
      const results=[{rosters,first:'red',winner:'red'},{rosters:{red:[...rosters.red].reverse(),blue:rosters.blue},first:'blue',winner:'blue'},
        {rosters:{red:rosters.red,blue:[...rosters.red].reverse()},first:'red',winner:'red'},{rosters,first:'blue',winner:'draw'},{rosters,first:'red',winner:null}];
      const games=results.map((g,i)=>({...g,id:`stats-${i}`,schema:1,createdAt:100+i,ruleVersion:'endgame-20-ply-v1',purpose:'self-play',index:i+1}));
      games.push({...games[0],id:'validation-fixture',purpose:'validation'},{...games[0],id:'old-rule-fixture',ruleVersion:'old'});
      const dataset={schema:1,games,models:[],runs:[],meta:[]};
      await TrainingStore.importDataset(dataset);await TrainingStore.importDataset(dataset);
      return {count:await TrainingStore.count(),report:await TrainingStore.statistics()};
    });
    assert.equal(imported.count,7);assert.equal(imported.report.completed,5);assert.equal(imported.report.excluded,2);
    const key='knight+mage',c=imported.report.combinations[key];
    assert.deepEqual([c.appearances,c.wins,c.losses,c.draws,c.unfinished,c.score],[6,2,2,1,1,50]);
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#startTraining').disabled);
    assert.match(await page.locator('#statisticsSummary').innerText(),/5 局.*2 \/ 45/);
    assert.match(await page.locator('#statisticsSummary').innerText(),/排除 2 局/);
    assert.match(await page.locator('#heroStatisticsSummary').innerText(),/历史累计 · 5 局.*20 次.*排除 2 局/);
    const heroRow=page.locator('#heroResults tr[data-hero="mage"]');
    assert.deepEqual(await heroRow.locator('td').allTextContents(),['魔术师','50.0','6','2','2','1','1','100.0% / 2','0.0% / 2','样本偏少']);
    await page.selectOption('#heroStatisticsScope','current');
    assert.match(await page.locator('#heroStatisticsSummary').innerText(),/本轮模拟 · 0 局/);
    assert.equal(await heroRow.locator('td').nth(2).innerText(),'0');assert.ok(await page.locator('#exportHeroStatistics').isDisabled());
    assert.deepEqual((await heroRow.locator('td').allTextContents()).slice(7,9),['— / 0','— / 0']);
    assert.equal(await page.locator('#statisticsScope').inputValue(),'history');
    await page.selectOption('#heroStatisticsScope','history');
    const heroDownloading=page.waitForEvent('download');await page.click('#exportHeroStatistics');
    const heroDownload=await heroDownloading,heroExport=JSON.parse(await fs.readFile(await heroDownload.path(),'utf8'));
    assert.equal(heroExport.scope,'history');assert.equal(heroExport.completed,5);assert.equal(heroExport.heroes.mage.appearances,6);assert.equal(heroExport.excluded,2);
    assert.equal(heroExport.heroes.mage.first.score,100);assert.equal(heroExport.heroes.mage.second.score,0);
    const row=page.locator(`#combinationResults tr[data-combination="${key}"]`);
    assert.deepEqual(await row.locator('td').allTextContents(),['骑士 + 魔术师','50.0','6','2','2','1','1','100.0% / 2','0.0% / 2','样本偏少']);
    await page.selectOption('#combinationSort','appearances');assert.equal(await page.locator('#combinationResults tr').first().getAttribute('data-combination'),key);
    await page.selectOption('#combinationHero','mage');assert.equal(await page.locator('#combinationResults tr').count(),9);
    await page.locator('.matchup-details summary').click();assert.equal(await page.locator('#matchupResults tr[data-matchup]').count(),2);
    await page.selectOption('#combinationHero','assassin');assert.match(await page.locator('#matchupResults').innerText(),/暂无/);
    await page.selectOption('#combinationHero','all');
    await page.selectOption('#statisticsScope','current');assert.match(await page.locator('#statisticsSummary').innerText(),/本轮模拟 · 0 局/);assert.ok(await page.locator('#exportStatistics').isDisabled());
    await page.selectOption('#statisticsScope','history');
    const downloading=page.waitForEvent('download');await page.click('#exportStatistics');const download=await downloading;
    const exported=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.equal(exported.completed,5);assert.equal(exported.scope,'history');assert.equal(exported.combinations[key].score,50);
    const dataset=await page.evaluate(()=>TrainingStore.exportDataset());assert.equal(dataset.statistics.completed,5);assert.equal(dataset.games.length,7);
    // Mock only the directory picker/file boundary; exercise real IndexedDB, JSON and import logic.
    const folder=await page.evaluate(async()=>{
      let fileText=JSON.stringify({schema:1,games:[],models:[],runs:[],meta:[]});
      const handle={name:'statistics-test',queryPermission:async()=> 'granted',getFileHandle:async()=>({
        getFile:async()=>new Blob([fileText]),createWritable:async()=>({write:async text=>{fileText=text;},close:async()=>{}})
      })};
      const put=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(value,...args){return put.call(this,this.name==='meta'&&value.key==='directoryHandle'?{key:'directoryHandle',testMarker:'local-only'}:value,...args);};
      window.showDirectoryPicker=async()=>handle;
      await TrainingStore.connectFolder();
      const file=JSON.parse(fileText);IDBObjectStore.prototype.put=put;
      await TrainingStore.importDataset({...file,meta:[...file.meta,{key:'directoryHandle',handle:{}}]});
      const db=await TrainingStore.open(),saved=await new Promise((resolve,reject)=>{const request=db.transaction('meta').objectStore('meta').get('directoryHandle');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      await new Promise((resolve,reject)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').delete('directoryHandle');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
      return {fileStats:file.statistics.completed,hasExportedHandle:file.meta.some(m=>m.key==='directoryHandle'),retained:saved.testMarker==='local-only'};
    });
    assert.deepEqual(folder,{fileStats:5,hasExportedHandle:false,retained:true});
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#startTraining').disabled);
    assert.ok(!(await page.locator('#formError').isVisible()),await page.locator('#formError').innerText());
    assert.match(await page.locator('#statisticsSummary').innerText(),/5 局/);
    // Run two short batches through the real UI, with deterministic legal moves to bound runtime.
    await page.evaluate(()=>{GameAI.choose=async state=>({action:GameAI.actions(state)[0]});});
    await page.locator('.advanced summary').click();await page.fill('#maxDecisions','20');
    await page.selectOption('#redSlot1','mage');await page.selectOption('#redSlot2','knight');
    await page.selectOption('#blueSlot1','dragon');await page.selectOption('#blueSlot2','ranger');
    for(const [games,total]of [[2,7],[1,8]]){
      await page.fill('#games',String(games));await page.click('#startTraining');
      await page.waitForFunction(()=>!document.querySelector('#startTraining').disabled);
      assert.equal(await page.locator('#formError').isVisible(),false);
      await page.selectOption('#heroStatisticsScope','current');
      assert.match(await page.locator('#heroStatisticsSummary').innerText(),new RegExp(`本轮模拟 · ${games} 局`));
      assert.equal(await heroRow.locator('td').nth(2).innerText(),String(games));
      const current=await page.evaluate(async()=>{const data=await TrainingStore.exportDataset();return data.runs.sort((a,b)=>a.startedAt.localeCompare(b.startedAt)).at(-1).heroes.mage;});
      const display=s=>s.score==null?'— / 0':`${s.score.toFixed(1)}% / ${s.wins+s.losses}`;
      assert.deepEqual((await heroRow.locator('td').allTextContents()).slice(7,9),[display(current.first),display(current.second)]);
      await page.selectOption('#heroStatisticsScope','history');
      assert.match(await page.locator('#heroStatisticsSummary').innerText(),new RegExp(`历史累计 · ${total} 局`));
      assert.equal(await heroRow.locator('td').nth(2).innerText(),String(total+1));
    }
    await page.selectOption('#heroStatisticsScope','current');
    const currentDownloading=page.waitForEvent('download');await page.click('#exportHeroStatistics');
    const currentDownload=await currentDownloading,currentExport=JSON.parse(await fs.readFile(await currentDownload.path(),'utf8'));
    assert.equal(currentExport.scope,'current');assert.equal(currentExport.completed,1);assert.equal(currentExport.heroes.mage.appearances,1);
    assert.equal(currentExport.heroes.mage.first.appearances,1);assert.equal(currentExport.heroes.mage.second.appearances,0);
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#startTraining').disabled);
    assert.match(await page.locator('#heroStatisticsSummary').innerText(),/历史累计 · 8 局/);
    await page.selectOption('#heroStatisticsScope','current');assert.match(await page.locator('#heroStatisticsSummary').innerText(),/本轮模拟 · 0 局/);
    await page.selectOption('#heroStatisticsScope','history');
    for(const width of [1440,760,390,320]){
      await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}px overflow`);
    }
    await page.locator('#heroTitle').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'artifacts/statistics-mobile.png')});
    await page.setViewportSize({width:1440,height:1100});await page.locator('#heroTitle').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'artifacts/statistics-desktop.png')});
    assert.deepEqual(errors,[]);console.log('PASS: 45 combinations, historical deduplication, mirror and initiative stats, filters, sorting, JSON export, mocked folder roundtrip with real IndexedDB, and mobile layout.');
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
