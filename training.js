(() => {
  'use strict';
  const $=id=>document.getElementById(id),R=window.Rules,SP=window.SelfPlay,Store=window.TrainingStore,Learning=window.GameLearning,GitHub=window.GitHubSync;
  const sideName=side=>side==='red'?'赤方':'靛方';
  const reasons={elimination:'全歼获胜',material:'20 步：棋子较多',hero:'20 步：英雄优先',second:'20 步：后手获胜','decision-limit':'决策上限 · 未完成',repetition:'重复局面 · 未完成',cancelled:'手动停止 · 未完成'};
  let running=false,stopRequested=false,lastReport=null,lastRendered=-1;
  let storedGames=0,historyReport=SP.createHistory();
  function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function refreshLibrary(){
    storedGames=await Store.count();const profile=await Store.champion();
    historyReport=await Store.statistics();renderCombinations();
    if(profile&&!GameAI.validProfile(profile))throw Error('已存储的模型不兼容当前规则');
    $('modelStatus').textContent=profile?`正在使用 · 训练版本 ${profile.version}`:'正在使用 · 内置策略';
    $('datasetStatus').textContent=`本地已保存 ${storedGames} 局逐步记录。包含阵容、先后手、每次行动、学习特征及最终结果。`;$('exportDataset').disabled=!storedGames;renderFolderStatus();return profile;
  }
  function renderFolderStatus(){const status=Store.fileStatus();$('connectFolder').textContent=status.connected?'重新连接训练文件夹':'选择本地训练文件夹';$('folderStatus').textContent=status.connected?`已连接：${status.name}/${status.fileName}。训练数据和模型会自动写回此文件。${status.error?` ${status.error}`:''}`:status.supported?'未连接文件夹。连接后会自动保存训练数据和训练模型到 crystal-duel-training.json。':'当前 Edge 环境不支持直接写入文件夹，请使用导入 / 导出 JSON。';}
  async function saveGame(runId,result,metadata){
    const saved=await Store.saveGame(runId,result,metadata);storedGames++;SP.recordHistory(historyReport,saved);renderCombinations();
    $('datasetStatus').textContent=`本地已保存 ${storedGames} 局逐步记录，本轮数据正在持续写入。`;$('exportDataset').disabled=false;
  }
  async function evolve(parent,config,runId){
    $('learningStatus').textContent='正在读取历史训练数据…';
    const games=await Store.recentGames(600);
    const fitted=await Learning.fit(games,parent,{cancelled:()=>stopRequested,onProgress:p=>{$('learningStatus').textContent=`学习中 · 第 ${p.epoch} / ${p.epochs} 轮，使用最近 ${p.games} 局已分胜负的历史数据。`;}});
    if(!fitted.candidate){$('learningStatus').textContent=fitted.cancelled?'学习已停止，已保存对抗数据。':`数据已保存。当前有 ${fitted.games} 局可用于学习，还需 ${fitted.needed} 局才开始更新参数。`;return;}
    const candidate=fitted.candidate;await Store.saveModel(candidate);
    $('learningStatus').textContent='新参数已保存，开始与旧版本进行 20 局独立验证…';
    const validation=await Learning.validate(candidate,parent,{difficulty:config.difficulty,seed:(config.seed+7919)>>>0,cancelled:()=>stopRequested,
      onProgress:p=>{$('learningStatus').textContent=`新旧版本验证 · ${p.completed} / 20 局，正在第 ${p.index} 局。新版 ${p.wins} 胜 / ${p.losses} 负 / ${p.unfinished} 未完成。`;},
      onGame:result=>saveGame(runId,result,{purpose:'validation',search:{...SP.PRESETS[config.difficulty]},ruleVersion:'endgame-20-ply-v1'})});
    candidate.validation=validation;candidate.status=stopRequested?'validation-stopped':validation.accepted?'validated':'not-promoted';await Store.saveModel(candidate);
    let promoted=false;if(validation.accepted)promoted=await Store.promote(candidate,parent?.id??null);
    lastReport.learning={candidateId:candidate.id,trainingGames:fitted.games,validation,promoted};
    $('learningStatus').textContent=promoted?`已启用训练版本 ${candidate.version}。验证 ${validation.wins} 胜 / ${validation.losses} 负，正式对局返回页面或重新部署后加载。`:
      stopRequested?'验证已停止，继续使用旧版本；数据和候选参数均已保存。':validation.accepted?'另一个面板已更新当前模型，本轮候选已保存，未覆盖更新后的版本。':`验证 ${validation.wins} 胜 / ${validation.losses} 负 / ${validation.unfinished} 未完成，未达到启用门槛。继续使用旧版本，下轮会累积历史数据再次学习。`;
    await refreshLibrary();
  }
  for(const select of document.querySelectorAll('[data-hero-slot]')){
    select.add(new Option('随机英雄','random'));
    for(const [id,hero]of Object.entries(R.HEROES))select.add(new Option(hero.name,id));
    select.addEventListener('change',syncSlots);
  }
  function syncSlots(){
    for(const side of ['red','blue']){
      const selects=[$(side+'Slot1'),$(side+'Slot2')];
      selects.forEach((select,index)=>{for(const option of select.options)option.disabled=option.value!=='random'&&option.value===selects[1-index].value;});
    }
  }
  function options(){return {games:$('games').value,difficulty:$('difficulty').value,first:$('first').value,randomMode:$('randomMode').value,seed:$('seed').value,maxDecisions:$('maxDecisions').value,slots:{red:[$('redSlot1').value,$('redSlot2').value],blue:[$('blueSlot1').value,$('blueSlot2').value]}};}
  function clock(ms){const seconds=Math.floor(ms/1000);return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
  function cell(row,text,className){const td=document.createElement('td');td.textContent=text;if(className)td.className=className;row.appendChild(td);}
  function renderHeroes(report){
    const body=$('heroResults');body.replaceChildren();
    const heroes=Object.values(report.heroes).sort((a,b)=>(b.score??-1)-(a.score??-1)||b.appearances-a.appearances);
    for(const h of heroes){const tr=document.createElement('tr');tr.dataset.hero=h.id;
      cell(tr,h.name);cell(tr,h.score==null?'—':h.score.toFixed(1),'score');
      for(const key of ['appearances','wins','losses','draws','unfinished'])cell(tr,h[key]);
      cell(tr,!h.appearances?'未出场':h.wins+h.losses<20?'样本偏少':'仅供参考','low-sample');body.appendChild(tr);
    }
  }
  function selectedStatistics(){return $('statisticsScope').value==='history'?historyReport:lastReport;}
  function renderCombinations(){
    const report=selectedStatistics()||SP.createReport(SP.normalize()),hero=$('combinationHero').value,sort=$('combinationSort').value;
    const compare=(a,b)=>sort==='name'?a.name.localeCompare(b.name,'zh-CN'):
      (b[sort]??-1)-(a[sort]??-1)||b.appearances-a.appearances||a.name.localeCompare(b.name,'zh-CN');
    const combinations=Object.values(report.combinations),visible=combinations.filter(c=>hero==='all'||c.key.split('+').includes(hero)).sort(compare);
    const body=$('combinationResults');body.replaceChildren();
    const splitText=s=>s.score==null?'— / 0':`${s.score.toFixed(1)}% / ${s.wins+s.losses}`;
    for(const c of visible){const row=document.createElement('tr');row.dataset.combination=c.key;
      cell(row,c.name);cell(row,c.score==null?'—':c.score.toFixed(1),'score');
      for(const key of ['appearances','wins','losses','draws','unfinished'])cell(row,c[key]);
      cell(row,splitText(c.first));cell(row,splitText(c.second));cell(row,!c.appearances?'未出场':c.wins+c.losses<20?'样本偏少':'仅供参考','low-sample');body.appendChild(row);
    }
    const matchups=Object.values(report.matchups).filter(m=>hero==='all'||[...m.redKey.split('+'),...m.blueKey.split('+')].includes(hero)).sort(compare);
    const matchBody=$('matchupResults');matchBody.replaceChildren();
    for(const m of matchups){const row=document.createElement('tr');row.dataset.matchup=m.key;
      cell(row,report.combinations[m.redKey].name);cell(row,report.combinations[m.blueKey].name);cell(row,m.score==null?'—':m.score.toFixed(1),'score');
      for(const key of ['appearances','redWins','blueWins','draws','unfinished','firstWins','secondWins'])cell(row,m[key]);matchBody.appendChild(row);
    }
    if(!matchups.length){const row=document.createElement('tr');cell(row,'暂无符合条件的对阵记录');row.firstChild.colSpan=10;matchBody.appendChild(row);}
    $('matchupCount').textContent=`${matchups.length} 种对阵`;
    $('statisticsSummary').textContent=`${$('statisticsScope').value==='history'?'历史累计':'本轮模拟'} · ${report.completed} 局自我对抗，已覆盖 ${combinations.filter(c=>c.appearances).length} / ${combinations.length} 种组合，当前显示 ${visible.length} 种。${report.excluded?` 已排除 ${report.excluded} 局验证、旧规则或不兼容记录。`:''} 未出场不代表强度为零；少量样本请谨慎比较。`;
    $('exportStatistics').disabled=!report.completed;
  }
  for(const [id,hero]of Object.entries(R.HEROES))$('combinationHero').add(new Option(hero.name,id));
  for(const id of ['statisticsScope','combinationSort','combinationHero'])$(id).addEventListener('change',renderCombinations);
  $('exportStatistics').addEventListener('click',()=>{const report=selectedStatistics();if(!report?.completed)return;const {results,...summary}=report;download({...summary,scope:$('statisticsScope').value,exportedAt:new Date().toISOString()},`晶界-组合统计-${Date.now()}.json`);});
  function renderRecords(report){
    $('recordCount').textContent=`${report.completed} 局`;$('matchResults').replaceChildren();
    for(const result of report.results.slice(-50).reverse()){const row=document.createElement('tr');
      cell(row,result.index);cell(row,sideName(result.first));
      for(const side of ['red','blue'])cell(row,result.rosters[side].map(h=>R.HEROES[h].name).join(' / '));
      cell(row,!result.winner?'未完成':result.winner==='draw'?'平局':sideName(result.winner)+'胜');
      cell(row,reasons[result.reason]||result.reason||'—');$('matchResults').appendChild(row);
    }
  }
  function render({report,current}){
    lastReport=report;$('runProgress').max=report.config.games;$('runProgress').value=report.completed;
    $('elapsed').textContent=clock(report.elapsedMs);
    const status={running:'模拟中',stopped:'已停止',complete:'模拟完成',error:'模拟中断'};
    $('runStatus').textContent=`${status[report.status]} · ${report.completed} / ${report.config.games} 局`;
    if(current){$('currentGame').textContent=`第 ${current.index} 局 · ${sideName(current.first)}先手 · 已完成 ${current.plies} 步 / ${current.decisions} 次决策。赤方：${current.rosters.red.map(h=>R.HEROES[h].name).join(' / ')}；靛方：${current.rosters.blue.map(h=>R.HEROES[h].name).join(' / ')}${current.endgame?.active?` · 残局计数 ${current.endgame.steps} / 20`:''}`;}
    else $('currentGame').textContent=report.status==='running'?'正在准备下一局…':report.status==='complete'?'本轮已结束，可以调整设置再次模拟。':report.status==='error'?'已保留此前完成的结果，可导出报告。':'本轮已停止，当前未结束对局单独记录。';
    $('exportReport').disabled=!report.completed;
    if(report.completed!==lastRendered||report.status!=='running'){
      lastRendered=report.completed;
      for(const id of ['firstWins','secondWins','adjudications'])$(id).textContent=report[id];
      $('unfinished').textContent=`${report.unfinished} / ${report.draws}`;
      const decided=report.firstWins+report.secondWins;
      let summary=decided?`已分胜负 ${decided} 局，先手 ${report.firstScore.toFixed(1)}% : 后手 ${(100-report.firstScore).toFixed(1)}%。`:'暂未产生已分胜负的对局。';
      summary+=` 未完成 ${report.unfinished} 局、平局 ${report.draws} 局，均不计入胜率。`;
      const ranked=Object.values(report.heroes).filter(h=>h.score!=null).sort((a,b)=>b.score-a.score);
      if(ranked.length)summary+=` 本轮表现分领先：${ranked.slice(0,3).map(h=>`${h.name} ${h.score.toFixed(1)}`).join('、')}。`;
      summary+=' 分数反映本轮阵容与搜索强度，少量样本请谨慎比较。';
      $('runSummary').textContent=summary;renderHeroes(report);renderRecords(report);renderCombinations();
    }
  }
  $('trainingForm').addEventListener('submit',async event=>{
    event.preventDefault();if(running)return;$('formError').hidden=true;let config;
    try{config=SP.normalize(options());}catch(error){$('formError').textContent=error.message;$('formError').hidden=false;return;}
    running=true;stopRequested=false;lastRendered=-1;$('trainingSettings').disabled=true;$('startTraining').disabled=true;$('stopTraining').disabled=false;
    const runId=`run-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
    try{
      const parent=await refreshLibrary();$('learningStatus').textContent='正在积累对抗数据，本轮对弈固定使用当前版本。';
      await SP.run(config,{cancelled:()=>stopRequested,onProgress:render,
        choose:(state,limits)=>GameAI.choose(state,{...limits,profile:parent}),
        onGame:result=>saveGame(runId,result,{purpose:'self-play',profileId:parent?.id??null,search:{...SP.PRESETS[config.difficulty]},seed:config.seed})});
      await Store.saveRun(runId,lastReport);
      if(!stopRequested)await evolve(parent,config,runId);else $('learningStatus').textContent='已停止，已产生的对抗记录均已保存，可在后续训练中继续使用。';
      await Store.saveRun(runId,lastReport);await Store.flushFile();await refreshLibrary();
    }
    catch(error){$('formError').textContent=`运行中断：${error.message}。本轮内存报告仍可导出，已成功写入的历史记录保留。`;$('formError').hidden=false;$('learningStatus').textContent='运行发生错误，未启用未经验证的模型。';}
    finally{running=false;$('trainingSettings').disabled=false;$('startTraining').disabled=false;$('stopTraining').disabled=true;if(lastReport)$('runStatus').textContent=`${lastReport.status==='complete'?'模拟完成':lastReport.status==='stopped'?'已停止':'运行中断'} · ${lastReport.completed} / ${lastReport.config.games} 局`;syncSlots();}
  });
  $('stopTraining').addEventListener('click',()=>{if(!running)return;stopRequested=true;$('stopTraining').disabled=true;$('runStatus').textContent='正在停止并汇总…';});
  $('exportReport').addEventListener('click',()=>{
    if(!lastReport?.completed)return;
    download(lastReport,`晶界-自我对抗-${lastReport.startedAt.replace(/[:.]/g,'-')}.json`);
  });
  $('exportDataset').addEventListener('click',async()=>{try{download(await Store.exportDataset(),`晶界-训练数据-${Date.now()}.json`);}catch(error){$('formError').textContent=error.message;$('formError').hidden=false;}});
  $('connectFolder').addEventListener('click',async()=>{const button=$('connectFolder');button.disabled=true;try{await Store.connectFolder();await refreshLibrary();$('learningStatus').textContent='本地训练文件夹已连接；后续对局和模型会自动保存到文件。';}catch(error){$('formError').textContent=`连接训练文件夹失败：${error.message}`;$('formError').hidden=false;}finally{button.disabled=false;renderFolderStatus();}});
  $('importDataset').addEventListener('click',()=>$('datasetFile').click());
  $('datasetFile').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{await Store.importDataset(JSON.parse(await file.text()));await refreshLibrary();$('learningStatus').textContent='训练数据和模型已从 JSON 文件导入本地库。';}catch(error){$('formError').textContent=`导入失败：${error.message}`;$('formError').hidden=false;}finally{event.target.value='';}});
  $('githubToken').addEventListener('input',()=>{$('syncGithub').disabled=!$('githubToken').value.trim()||running;});
  $('syncGithub').addEventListener('click',async()=>{
    const button=$('syncGithub');button.disabled=true;$('githubSyncState').textContent='同步中';$('githubMessage').textContent='正在读取本地训练数据并提交到 GitHub…';
    try{GitHub.configure($('githubToken').value);const result=await GitHub.sync({owner:$('githubOwner').value,repo:$('githubRepo').value,branch:$('githubBranch').value,dataset:await Store.exportDataset(),message:`Update AI training data (${new Date().toISOString()})`});$('githubSyncState').textContent='已同步';$('githubMessage').textContent=`已提交 ${result.bytes.toLocaleString()} 字节训练数据。Commit: ${result.commit||'已更新'}。`;
    }catch(error){$('githubSyncState').textContent='失败';$('githubMessage').textContent=`同步失败：${error.message}`;}finally{button.disabled=!$('githubToken').value.trim()||running;}
  });
  window.addEventListener('beforeunload',event=>{if(running){event.preventDefault();event.returnValue='';}});
  syncSlots();renderHeroes(SP.createReport(SP.normalize()));renderCombinations();renderFolderStatus();
  $('startTraining').disabled=true;Store.restoreFolder().then(()=>refreshLibrary()).then(()=>{$('startTraining').disabled=false;}).catch(error=>{$('formError').textContent=`训练数据存储不可用：${error.message}`;$('formError').hidden=false;$('modelStatus').textContent='无法打开本地训练库';$('startTraining').disabled=false;});
})();
