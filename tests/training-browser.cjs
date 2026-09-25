const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{draftGame}=require('./browser-helpers.cjs');
let playwright;try{playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');}catch{playwright=require('C:/Users/chen2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await playwright.chromium.launch({channel:'msedge',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
    context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root,'training.html')).href);await page.waitForFunction(()=>!document.querySelector('#startTraining').disabled);
    assert.equal(await page.locator('[data-hero-slot]').count(),4);assert.equal(await page.locator('#redSlot1 option').count(),11);
    await page.selectOption('#redSlot2','knight');assert.equal(await page.locator('#redSlot1 option[value=knight]').evaluate(o=>o.disabled),true);
    await page.selectOption('#blueSlot1','knight');await page.fill('#games','2');await page.click('#startTraining');
    await page.waitForFunction(()=>!document.querySelector('#startTraining').disabled,{},{timeout:90000});
    let data=await page.evaluate(()=>TrainingStore.exportDataset());assert.equal(data.games.length,2);
    assert.ok(data.games.every(g=>g.rosters.red[1]==='knight'&&g.rosters.red[0]!=='knight'&&g.rosters.blue[0]==='knight'));
    assert.deepEqual(data.games[0].rosters,data.games[1].rosters);assert.equal(data.games[0].first,'red');assert.equal(data.games[1].first,'blue');
    assert.ok(data.games.every(g=>g.trajectory.length===g.decisions&&g.trajectory.length>0));
    assert.equal(data.statistics.completed,2);assert.equal(Object.values(data.statistics.combinations).reduce((n,c)=>n+c.appearances,0),4);
    assert.equal(Object.keys(data.runs[0].combinations).length,45);assert.ok(Object.keys(data.runs[0].matchups).length>0);
    await page.selectOption('#statisticsScope','current');assert.match(await page.locator('#statisticsSummary').innerText(),/本轮模拟 · 2 局/);
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#startTraining').disabled);assert.match(await page.locator('#datasetStatus').innerText(),/2 局/);
    const other=await context.newPage();await other.goto(pathToFileURL(path.join(root,'index.html')).href);
    await other.waitForFunction(()=>document.querySelector('#aiModelStatus').textContent.includes('内置'));
    assert.equal(await other.evaluate(()=>TrainingStore.count()),2,'offline index and training share the database');
    console.log('PASS: offline slots, paired rosters, complete replay records, reload persistence and cross-page database.');
    await page.fill('#games','100');await page.click('#startTraining');await page.click('#stopTraining');
    await page.waitForFunction(()=>!document.querySelector('#startTraining').disabled);assert.match(await page.locator('#runStatus').innerText(),/已停止/);
    assert.ok(await page.evaluate(async()=>(await TrainingStore.exportDataset()).games.some(g=>g.reason==='cancelled')));
    await page.fill('#games','24');await page.click('#startTraining');
    await page.waitForFunction(()=>!document.querySelector('#startTraining').disabled,{},{timeout:240000});
    assert.equal(await page.locator('#formError').isVisible(),false,await page.locator('#formError').textContent());
    data=await page.evaluate(()=>TrainingStore.exportDataset());
    const learned=data.models.find(m=>m.algorithm==='outcome-logistic-residual-v1');assert.ok(learned,'actual historical games produce a learned candidate');
    assert.ok(learned.weights.some(w=>w!==0));assert.equal(learned.validation.completed,20);
    assert.equal(data.games.filter(g=>g.purpose==='validation').length,20);
    assert.equal(data.statistics.completed,data.games.filter(g=>g.purpose==='self-play').length);assert.equal(data.statistics.excluded,20);
    console.log(JSON.stringify({actualStoredGames:data.games.length,trainingGames:learned.trainingGames,trainingSamples:learned.trainingSamples,validation:learned.validation,modelStatus:learned.status}));
    const learningStatus=await page.locator('#learningStatus').innerText();assert.match(learningStatus,/启用|未达到/);
    await page.screenshot({path:path.join(root,'artifacts/training-desktop.png'),fullPage:true});
    for(const width of [320,390,760]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}px horizontal overflow`);}
    await page.screenshot({path:path.join(root,'artifacts/training-mobile.png'),fullPage:true});
    const downloadPromise=page.waitForEvent('download');await page.click('#exportDataset');const download=await downloadPromise;assert.match(download.suggestedFilename(),/训练数据.*json/);
    // Isolated browser context: fixture promotion checks live game integration independently of training quality.
    const promoted=await page.evaluate(async()=>{const parent=await TrainingStore.champion(),weights=Array(GameAI.FEATURE_NAMES.length).fill(0);weights[0]=40;const fixture={schema:1,ruleVersion:'endgame-20-ply-v1',id:'integration-fixture',version:99,weights,validation:{accepted:true,completed:20,wins:12,losses:8}};
      let refused=false;try{await TrainingStore.promote({...fixture,validation:null},parent?.id??null);}catch{refused=true;}
      const yes=await TrainingStore.promote(fixture,parent?.id??null),stale=await TrainingStore.promote({...fixture,id:'stale-fixture'},parent?.id??null);return {yes,stale,refused};});
    assert.deepEqual(promoted,{yes:true,stale:false,refused:true});
    await other.reload();await other.waitForFunction(()=>document.querySelector('#aiModelStatus').textContent.includes('99'));assert.equal(await other.evaluate(()=>GameAI.getProfile().id),'integration-fixture');
    await other.evaluate(()=>{const create=Rules.create;Rules.create=()=>{Rules.create=create;const s=create();s.ply=25;s.endgameStartPly=6;s.units=[{id:'r',side:'red',x:1,y:0,type:'hero',hero:'general',name:'将军',alive:true},{id:'b',side:'blue',x:4,y:3,type:'hero',hero:'mage',name:'魔术师',alive:true}];return s;};});
    await draftGame(other);assert.ok((await other.locator('#phaseLabel').innerText()).includes('19 / 20'));await other.click('#aiStepBtn');
    await other.locator('#winDialog').waitFor({state:'visible',timeout:10000});assert.match(await other.locator('#winDetail').innerText(),/后手获胜/);assert.equal(await other.evaluate(()=>GameView.state.winner),'blue');
    assert.deepEqual(errors,[]);console.log('PASS: full learning and validation, durable data export, model loading, promotion guard, cancellation, mobile layout, and adjudication UI.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
