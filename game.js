/* Rendering and interaction. All legality lives in rules-engine.js. */
(() => {
  'use strict';
  const R=window.Rules,$=id=>document.getElementById(id),sideName=s=>s==='red'?'赤方':'靛方';
  let state=R.create(),selected=null,mode='auto',skillKind=null,swapFirst=null,started=false,locked=false;
  const skillNames={push:'推进',speed:'神速',vault:'陷阵',teleport:'瞬移',swap:'移形',charge:'轰炸·蓄力',bomb:'轰炸',dodge:'瞬闪',retreat:'游击'};
  let draft=GameDraft.create(),draftBusy=false,draftEpoch=0,draftTimer=null;
  let opponent='ai',aiBusy=false,aiTimer=null,aiEpoch=0,aiError=false,aiStepBusy=false,hintAction=null,hintEpoch=0,wheelOpen=true,wheelDismissed=false;
  const positionHistory=[];
  async function refreshTrainedModel(){
    try{await TrainingStore.restoreFolder();const profile=await TrainingStore.champion();GameAI.setProfile(profile||null);$('aiModelStatus').textContent=profile?`AI · 训练版本 ${profile.version}`:'AI · 内置策略';}
    catch(error){GameAI.setProfile(null);$('aiModelStatus').textContent='AI · 内置策略（训练库暂不可读）';console.warn('Training model unavailable:',error.message);}
  }
  window.addEventListener('focus',refreshTrainedModel);
  window.addEventListener('storage',event=>{if(event.key==='crystal-duel-training-libraries-v1'){GameAI.setProfile(null);refreshTrainedModel();}});

  let scene,camera,renderer,world,tileGroup,unitGroup,overlay,pathGroup,hintPathGroup,particles,statusEffects;
  const meshes=new Map(),tileMeshes=[],tweens=[];
  const touchUI=matchMedia('(pointer: coarse)');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const orbit={yaw:-.12,pitch:.96,radius:9};let drag=null,hoverKey='',toastTimer,flashTimer,shownWinner=false;
  const vec=(x,y,h=.16)=>new THREE.Vector3(x,h,y);
  const material=(color,metalness=.25)=>new THREE.MeshStandardMaterial({color,roughness:.48,metalness});
  function add(parent,geo,mat,x=0,y=0,z=0){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function dispose(object){object.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of [].concat(o.material)){m.map?.dispose();m.dispose();}}});}
  function clear(group){while(group.children.length){const c=group.children[0];group.remove(c);dispose(c);}}
  function cylinder(parent,rt,rb,h,mat,y,sides=16){return add(parent,new THREE.CylinderGeometry(rt,rb,h,sides),mat,0,y,0);}
  function label(text,color,size=.3){
    const c=document.createElement('canvas'),ratio=Math.max(1,text.length*.85);c.width=Math.ceil(128*ratio);c.height=128;
    const ctx=c.getContext('2d');ctx.font='bold 68px Microsoft YaHei';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=6;ctx.strokeStyle='#153532';ctx.strokeText(text,c.width/2,64);ctx.fillStyle=color;ctx.fillText(text,c.width/2,64);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.scale.set(size*ratio,size,1);sprite.userData.label=text;return sprite;
  }
  function makeUnit(u){
    const g=new THREE.Group(),team=u.side==='red'?0xc76f57:0x5b9cbb,body=material(team,.4),ivory=material(0xe8dec1,.28),gold=material(0xc8a56b,.65),dark=material(0x243536,.35);
    cylinder(g,.30,.34,.10,dark,.04,32);cylinder(g,.30,.30,.035,gold,.102,32);cylinder(g,.25,.29,.07,body,.14,24);
    if(u.type==='soldier'){
      cylinder(g,.12,.20,.26,body,.30,8);add(g,new THREE.SphereGeometry(.115,12,8),ivory,0,.51);const helm=add(g,new THREE.SphereGeometry(.13,12,8,0,Math.PI*2,0,Math.PI/2),body,0,.53);helm.scale.y=.8;
      add(g,new THREE.BoxGeometry(.17,.24,.04),gold,0,.32,.14);add(g,new THREE.CylinderGeometry(.018,.018,.46,6),gold,.20,.36,0);
    }else{
      cylinder(g,.13,.23,.32,body,.34,8);
      const h=u.hero;
      if(h==='general'){add(g,new THREE.SphereGeometry(.14,12,8),ivory,0,.61);cylinder(g,.19,.15,.12,gold,.74,8);for(let i=-1;i<=1;i++)add(g,new THREE.ConeGeometry(.045,.14,4),gold,i*.12,.86,0);add(g,new THREE.BoxGeometry(.36,.055,.12),gold,0,.46,0);}
      if(h==='strategist'){add(g,new THREE.SphereGeometry(.13,12,8),ivory,0,.61);cylinder(g,.18,.12,.12,dark,.74,4);const fan=add(g,new THREE.CylinderGeometry(.24,.12,.045,7,1,false,0,Math.PI),gold,0,.42,.20);fan.rotation.x=Math.PI/2;}
      if(h==='vanguard'){add(g,new THREE.BoxGeometry(.23,.24,.22),ivory,0,.62);add(g,new THREE.BoxGeometry(.045,.15,.25),body,0,.80,0);add(g,new THREE.BoxGeometry(.05,.67,.06),gold,.24,.51,0);add(g,new THREE.ConeGeometry(.08,.20,4),ivory,.24,.94,0);}
      if(h==='assassin'){add(g,new THREE.ConeGeometry(.20,.38,6),dark,0,.67,0);add(g,new THREE.BoxGeometry(.12,.035,.04),ivory,0,.64,.14);for(const x of [-.23,.23]){const blade=add(g,new THREE.ConeGeometry(.05,.34,4),gold,x,.44,.08);blade.rotation.z=x>0?-.55:.55;}}
      if(h==='ranger'){add(g,new THREE.SphereGeometry(.13,12,8),ivory,0,.60);add(g,new THREE.ConeGeometry(.21,.18,6),body,0,.77,0);const bow=add(g,new THREE.TorusGeometry(.26,.027,6,20,Math.PI),gold,.22,.48,0);bow.rotation.y=Math.PI/2;add(g,new THREE.CylinderGeometry(.008,.008,.52,4),ivory,.22,.48,0);}
      if(h==='pikeman'){add(g,new THREE.SphereGeometry(.14,12,8),ivory,0,.60);add(g,new THREE.ConeGeometry(.16,.18,6),body,0,.75,0);add(g,new THREE.CylinderGeometry(.022,.022,.82,6),gold,.24,.52,0);add(g,new THREE.ConeGeometry(.10,.20,4),ivory,.24,1,0);}
      if(h==='mage'){add(g,new THREE.SphereGeometry(.12,12,8),ivory,0,.59);add(g,new THREE.ConeGeometry(.22,.36,8),body,0,.82,0);add(g,new THREE.CylinderGeometry(.021,.021,.64,6),gold,.25,.46,0);add(g,new THREE.IcosahedronGeometry(.12),new THREE.MeshStandardMaterial({color:0xb6dcca,emissive:0x6ba99d,emissiveIntensity:.55}),.25,.85,0);}
      if(h==='dragon'){const neck=add(g,new THREE.ConeGeometry(.18,.43,6),body,0,.62,0);neck.rotation.z=-.3;add(g,new THREE.BoxGeometry(.19,.15,.30),ivory,.04,.82,.08);for(const sign of [-1,1]){const wing=add(g,new THREE.ConeGeometry(.28,.46,3),body,sign*.29,.49,-.04);wing.rotation.z=sign*1.15;wing.scale.z=.25;add(g,new THREE.ConeGeometry(.05,.17,4),gold,sign*.085,.97,0);}}
      if(h==='knight'){const head=add(g,new THREE.BoxGeometry(.23,.32,.23),ivory,0,.66,0);head.rotation.x=-.35;add(g,new THREE.BoxGeometry(.22,.16,.27),ivory,0,.74,.17);add(g,new THREE.BoxGeometry(.10,.33,.08),body,0,.69,-.13);for(const x of [-.075,.075])add(g,new THREE.ConeGeometry(.045,.14,4),gold,x,.93,0);}
      if(h==='wolf'){add(g,new THREE.IcosahedronGeometry(.20,0),ivory,0,.64,0);const snout=add(g,new THREE.ConeGeometry(.13,.25,4),ivory,0,.62,.17);snout.rotation.x=Math.PI/2;for(const x of [-.12,.12])add(g,new THREE.ConeGeometry(.085,.22,3),body,x,.84,-.04);}
      const name=label(R.HEROES[h].name,'#f4e8c8',.22);name.position.set(0,1.15,0);g.add(name);
    }
    g.position.copy(vec(u.x,u.y));g.userData.unitId=u.id;g.rotation.y=u.side==='red'?.35:-.35;return g;
  }
  function makeBoard(){
    for(const c of R.CELLS){
      const hero=c.x===0||c.x===5,soldier=c.x===1||c.x===4;
      add(tileGroup,new THREE.BoxGeometry(.96,.18,.96),material(0x182e2d,.45),c.x,-.12,c.y);
      const tile=add(tileGroup,new THREE.BoxGeometry(.91,.12,.91),material(hero?0x508a99:soldier?0x718969:((c.x+c.y)%2?0x829184:0x9aa48e),.15),c.x,.01,c.y);tile.userData.cell=c;tileMeshes.push(tile);
      const rim=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.91,.12,.91)),new THREE.LineBasicMaterial({color:hero?0x96d3cf:0xc2bc92,transparent:true,opacity:.32}));rim.position.copy(tile.position);tileGroup.add(rim);
      for(const [dx,dy] of [[1,0],[0,1]])if(R.inside(c.x+dx,c.y+dy))add(tileGroup,new THREE.BoxGeometry(dx?.13:.13,.05,dy?.13:.13),material(0xb59f75,.65),c.x+dx*.5,-.03,c.y+dy*.5);
    }
    const floor=add(world,new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.20}),2.5,-.25,1.5);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
    for(let x=1;x<=4;x++){const l=label(String.fromCharCode(65+x),'#93aaa0',.17);l.position.set(x,-.10,3.65);world.add(l);}
    for(let y=0;y<4;y++){const l=label(String(y+1),'#93aaa0',.17);l.position.set(.38,-.10,y);if(y===1||y===2)l.position.x=-.65;world.add(l);}
  }
  function boot(){
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(36,1,.1,100);
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;$('scene').appendChild(renderer.domElement);
    world=new THREE.Group();scene.add(world);[tileGroup,unitGroup,overlay,pathGroup,particles,statusEffects]=Array.from({length:6},()=>{const g=new THREE.Group();world.add(g);return g;});hintPathGroup=new THREE.Group();world.add(hintPathGroup);
    scene.add(new THREE.HemisphereLight(0xd7eee1,0x33463a,2));
    const sun=new THREE.DirectionalLight(0xffe0ad,3.4);sun.position.set(-2,9,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-8;sun.shadow.camera.right=8;sun.shadow.camera.top=8;sun.shadow.camera.bottom=-8;sun.shadow.normalBias=.025;scene.add(sun);
    const fill=new THREE.DirectionalLight(0x87c7dd,1.5);fill.position.set(5,4,-4);scene.add(fill);makeBoard();syncUnits();
    const canvas=renderer.domElement,pointers=new Map();let pinch=null;
    const distance=()=>{const [a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);
      if(pointers.size>1){pinch={distance:Math.max(1,distance()),radius:orbit.radius};if(drag)drag.moved=true;return;}
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};
    });
    canvas.addEventListener('pointermove',e=>{
      if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pointers.size>1&&pinch){orbit.radius=THREE.MathUtils.clamp(pinch.radius*pinch.distance/Math.max(1,distance()),7,17);updateCamera();return;}
      if(drag&&drag.id===e.pointerId){const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6)drag.moved=true;if(drag.moved){orbit.yaw-=dx*.007;orbit.pitch=THREE.MathUtils.clamp(orbit.pitch+dy*.006,.40,1.42);updateCamera();}drag.lastX=e.clientX;drag.lastY=e.clientY;}else if(e.pointerType!=='touch')preview(e);
    });
    const release=(e,cancel=false)=>{
      const tap=!cancel&&!pinch&&drag?.id===e.pointerId&&!drag.moved;pointers.delete(e.pointerId);
      if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
      if(pointers.size){const [id,p]=pointers.entries().next().value;drag={id,x:p.x,y:p.y,lastX:p.x,lastY:p.y,moved:true};}else{drag=null;pinch=null;}
      if(tap)pick(e);
    };
    canvas.addEventListener('pointerup',e=>release(e));canvas.addEventListener('pointercancel',e=>release(e,true));canvas.addEventListener('pointerleave',()=>{if(!drag)clearPath();});
    canvas.addEventListener('wheel',e=>{e.preventDefault();orbit.radius=THREE.MathUtils.clamp(orbit.radius+e.deltaY*.006,7,17);updateCamera();},{passive:false});canvas.addEventListener('dblclick',resetCamera);
    new ResizeObserver(resize).observe($('scene'));resize();requestAnimationFrame(frame);
  }
  function resize(){const el=$('scene');renderer.setSize(el.clientWidth,el.clientHeight,false);camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();updateCamera();}
  function updateCamera(){const t=vec(2.5,1.5,.05),r=orbit.radius*Math.max(1,1.25/camera.aspect);camera.position.set(t.x+r*Math.sin(orbit.yaw)*Math.cos(orbit.pitch),r*Math.sin(orbit.pitch),t.z+r*Math.cos(orbit.yaw)*Math.cos(orbit.pitch));camera.lookAt(t);camera.updateMatrixWorld(true);}
  function resetCamera(){Object.assign(orbit,{yaw:-.12,pitch:.96,radius:9});updateCamera();}
  function syncUnits(){for(const [id,g] of meshes)if(!R.get(state,id)?.alive){unitGroup.remove(g);dispose(g);meshes.delete(id);}for(const u of state.units.filter(u=>u.alive)){if(!meshes.has(u.id)){const m=makeUnit(u);meshes.set(u.id,m);unitGroup.add(m);}const g=meshes.get(u.id);g.position.copy(vec(u.x,u.y));g.scale.setScalar(1);}}
  function frame(now){requestAnimationFrame(frame);for(let i=tweens.length-1;i>=0;i--){const t=tweens[i],p=Math.max(0,Math.min(1,(now-t.start)/t.duration));try{t.step(p);}catch(error){tweens.splice(i,1);t.fail(error);continue;}if(p===1){tweens.splice(i,1);t.done();}}overlay.children.forEach(o=>{if(o.userData.pulse)o.material.opacity=.60+(reduced?0:Math.sin(now*.004)*.10);});animateStatuses(now);renderer.render(scene,camera);positionWheel();}
  function tween(duration,step){return new Promise((done,fail)=>tweens.push({start:performance.now(),duration:reduced?1:duration,step,done,fail}));}
  function legalMode(id,m){return m==='auto'?[...R.legal(state,id,'move'),...R.legal(state,id,'attack')]:R.legal(state,id,m);}
  function options(){return selected?legalMode(selected,mode).filter(o=>mode!=='skill'||!skillKind||o.kind===skillKind):[];}
  function highlight(){clear(overlay);clearPath();if(hintPathGroup)clear(hintPathGroup);const u=R.get(state,selected);if(u?.alive){const ring=add(overlay,new THREE.TorusGeometry(.40,.018,6,48),new THREE.MeshBasicMaterial({color:0xf3d291}),u.x,.13,u.y);ring.rotation.x=Math.PI/2;}
    if(state.phase==='dodge'&&state.pending){const a=R.get(state,state.pending.actor);const marker=add(overlay,new THREE.TorusGeometry(.46,.045,8,48),new THREE.MeshBasicMaterial({color:0xff6644,depthTest:false}),a.x,.18,a.y);marker.rotation.x=Math.PI/2;const text=label('攻击者','#ffb090',.26);text.position.copy(vec(a.x,a.y,1.48));overlay.add(text);}
    if(swapFirst){const first=R.get(state,swapFirst);effectRing(overlay,first.x,first.y,0xc19bff,.48);}
    const seen=new Set();for(const o of options()){const cells=o.kind==='swap'?(swapFirst?(o.a===swapFirst||o.b===swapFirst?[R.get(state,o.a===swapFirst?o.b:o.a)]:[]):[R.get(state,o.a),R.get(state,o.b)]):[o];for(const c of cells){
      const k=R.key(c);if(seen.has(k))continue;seen.add(k);
      const color=o.kind==='attack'?0xff533b:mode==='skill'?0xffd35c:0x3dffb6;
      const fill=add(overlay,new THREE.BoxGeometry(.83,.012,.83),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.6,depthWrite:false}),c.x,.105,c.y);fill.userData.pulse=true;
      // A bright square frame stays legible against every tile and around occupied targets.
      for(const [x,z,w,d] of [[-.43,0,.035,.89],[.43,0,.035,.89],[0,-.43,.89,.035],[0,.43,.89,.035]])add(overlay,new THREE.BoxGeometry(w,.018,d),new THREE.MeshBasicMaterial({color,depthWrite:false}),c.x+x,.13,c.y+z);
      const mark=label(o.kind==='attack'?'攻击':mode==='skill'?'技能':'落点',o.kind==='attack'?'#ffdbcf':'#d9ffef',.16);mark.position.copy(vec(c.x,c.y+.30,.19));overlay.add(mark);
    }}
    if(hintAction?.type==='act'&&hintAction.opt){const opt=hintAction.opt,target=opt.x!=null?opt:R.get(state,opt.target),src=R.get(state,hintAction.id);if(target){if(src)effectRing(overlay,src.x,src.y,0xd7bc83,.42);effectRing(overlay,target.x,target.y,0xd7bc83,.48);if(opt.path?.length)drawHintPath(opt);const g=meshes.get(src?.id);if(g){const copy=g.clone(true);copy.traverse(o=>{if(o.isSprite)o.visible=false;if(o.material){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.38;o.material.depthWrite=false;}});copy.position.copy(vec(target.x,target.y,.20));copy.scale.setScalar(.92);overlay.add(copy);}}}
  }

  function clearPath(){if(locked)return;if(pathGroup)clear(pathGroup);hoverKey='';if(state.phase==='dodge'&&state.pending)drawPath(state.pending.opt);}
  function showPath(opt){if(pathGroup)clear(pathGroup);hoverKey='';if(state.phase==='dodge'&&state.pending)drawPath(state.pending.opt);if(opt!==state.pending?.opt)drawPath(opt);}
  function drawPath(opt){if(!opt?.path?.length)return;const points=opt.path.map(c=>vec(c.x,c.y,.125));const curve=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xffdd99,depthTest:false,transparent:true,opacity:.9}));pathGroup.add(curve);points.forEach((p,i)=>{const l=label(String(i),'#fff2c6',.18);l.position.copy(p).add(new THREE.Vector3(0,.09,0));pathGroup.add(l);});if(opt.kind==='bomb')for(const c of R.CELLS.filter(c=>Math.abs(c.x-opt.x)<=1&&Math.abs(c.y-opt.y)<=1))add(pathGroup,new THREE.BoxGeometry(.84,.015,.84),new THREE.MeshBasicMaterial({color:0xf08a65,transparent:true,opacity:.4,depthWrite:false}),c.x,.115,c.y);}
  function drawHintPath(opt){if(!hintPathGroup||!opt?.path?.length)return;const points=opt.path.map(c=>vec(c.x,c.y,.19));const geometry=new THREE.BufferGeometry().setFromPoints(points);const line=new THREE.Line(geometry,new THREE.LineDashedMaterial({color:0xd7bc83,dashSize:.12,gapSize:.08,transparent:true,opacity:.9,depthTest:false}));line.computeLineDistances();hintPathGroup.add(line);}
  function hit(e){const r=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);const hits=ray.intersectObjects([...meshes.values(),...tileMeshes],true);for(const h of hits){let obj=h.object;while(obj&&!obj.userData.unitId&&!obj.userData.cell)obj=obj.parent;if(obj?.userData.unitId){const u=R.get(state,obj.userData.unitId);if(!u?.alive)continue;return {x:u.x,y:u.y,unit:u};}if(obj?.userData.cell){const c=obj.userData.cell;return {...c,unit:R.at(state,c.x,c.y)};}}return null;}
  function preview(e){if(locked||!started||isAITurn()||anyDialog())return;const h=hit(e),k=h?R.key(h):'';if(k===hoverKey)return;const o=h&&options().find(o=>o.x===h.x&&o.y===h.y);showPath(o);hoverKey=k;renderer.domElement.style.cursor=o||h?.unit?'pointer':'grab';}
  function pick(e){if(locked||!started||state.winner||isAITurn())return;const h=hit(e);if(!h){dismissWheel();return;}if(pickSwap(h.unit?.id))return;const o=options().find(o=>o.x===h.x&&o.y===h.y&&o.kind!=='swap');if(o){perform(o);return;}if(h.unit)select(h.unit.id);else dismissWheel();}
  function pickSwap(id){
    if(mode!=='skill'||skillKind!=='swap')return false;
    const pairs=options();
    if(id===swapFirst){swapFirst=null;renderUI();return true;}
    if(swapFirst){
      const pair=pairs.find(o=>o.a===swapFirst&&o.b===id||o.b===swapFirst&&o.a===id);
      if(pair){perform(pair);return true;}
      toast('请选择与已选棋子相邻的高亮棋子，或取消重选');return true;
    }
    if(pairs.some(o=>o.a===id||o.b===id)){swapFirst=id;renderUI();}
    else toast('请选择高亮棋子作为移形的第一个目标');
    return true;
  }
  function select(id){if(locked||!started||state.winner||isAITurn())return;const u=R.get(state,id);if(!u?.alive)return;if(state.phase==='dodge'){if(id!==state.pending.target)return toast('由防守方为游侠选择瞬闪，或承受攻击');}else if(u.side!==state.side)return toast(`现在轮到${sideName(state.side)}`);else if(state.actor&&id!==state.actor)return toast('请先完成当前单位的后续行动');selected=id;skillKind=null;swapFirst=null;wheelOpen=true;wheelDismissed=false;mode=state.phase==='bomb'?'skill':'auto';renderUI();}
  function ghost(g,opacity=.32){
    const copy=g.clone(true);copy.traverse(o=>{if(o.isSprite)o.visible=false;if(o.geometry)o.geometry=o.geometry.clone();if(o.material){o.material=o.material.clone();o.material.map=null;o.material.transparent=true;o.material.opacity=opacity;o.material.depthWrite=false;}});particles.add(copy);return copy;
  }
  const skillColors={推进:0xffc478,军号:0xffd783,设陷:0xb993ff,陷阵:0xffb16e,斩将:0xff715e,瞬移:0xbda1ff,短兵:0xd2b9ff,瞬闪:0x76edda,游击:0x76edda,武库:0xe4cf92,移形:0xc19bff,轰炸:0xff8652,'轰炸·蓄力':0xffb85c,神速:0x8ee5ff,荣耀:0x9feaff,残忍:0xff6b73};
  function effectRing(group,x,y,color,radius=.4){const m=add(group,new THREE.TorusGeometry(radius,.018,6,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,depthWrite:false}),x,.15,y);m.rotation.x=Math.PI/2;return m;}
  async function skillBurst(id,name){
    const g=meshes.get(id);if(!g||!name)return;
    // Every cast owns its resources, including concurrent dodge / attacker animations.
    const fx=new THREE.Group();world.add(fx);fx.userData.effect='skill:'+name;
    const color=skillColors[name]||0xffd783,echoes=[];
    for(let i=0;i<(reduced?0:4);i++){const copy=ghost(g,.3);particles.remove(copy);fx.add(copy);echoes.push(copy);}
    const ring=effectRing(fx,g.position.x,g.position.z,color),outer=effectRing(fx,g.position.x,g.position.z,color,.55);
    const title=label(name,'#'+color.toString(16).padStart(6,'0'),.30);title.position.copy(g.position).add(new THREE.Vector3(0,1.25,0));fx.add(title);
    const motes=[];for(let i=0;i<(reduced?0:10);i++)motes.push(add(fx,new THREE.OctahedronGeometry(.035),new THREE.MeshBasicMaterial({color,transparent:true,depthWrite:false}),g.position.x,.2,g.position.z));
    try{await tween(380,t=>{
      echoes.forEach((e,i)=>{const angle=i*Math.PI/2;e.position.copy(g.position).add(new THREE.Vector3(Math.cos(angle)*t*.35,t*.08,Math.sin(angle)*t*.35));e.traverse(o=>{if(o.material)o.material.opacity=(1-t)*.3;});});
      ring.scale.setScalar(1+t*.8);outer.scale.setScalar(1+t*.5);ring.material.opacity=outer.material.opacity=(1-t)*.8;title.position.y=g.position.y+1.25+t*.15;
      motes.forEach((m,i)=>{const angle=i*Math.PI/5+t*2,r=.28+t*.25;m.position.set(g.position.x+Math.cos(angle)*r,.2+Math.sin(Math.PI*t)*.65,g.position.z+Math.sin(angle)*r);m.material.opacity=1-t;});
    });}finally{world.remove(fx);dispose(fx);}
  }
  async function skillResolution(before,result,actor){
    const kind=result.kind,opt=result.opt,color=skillColors[skillNames[kind]]||0xffd783;
    if(!['push','speed','vault','teleport','swap','charge','bomb','retreat'].includes(kind))return;
    const fx=new THREE.Group();world.add(fx);fx.userData.effect='resolve:'+kind;
    const atBefore=id=>before.find(u=>u.id===id),atAfter=id=>R.get(state,id),rings=[],links=[];
    const ringAt=u=>{if(u)rings.push(effectRing(fx,u.x,u.y,color,kind==='bomb'?.5:.32));};
    const link=(a,b)=>{if(!a||!b)return;const curve=new THREE.QuadraticBezierCurve3(vec(a.x,a.y,.22),vec((a.x+b.x)/2,(a.y+b.y)/2,.9),vec(b.x,b.y,.22));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(28)),new THREE.LineBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false}));fx.add(line);links.push(line);};
    if(kind==='swap'){for(const id of [opt.a,opt.b]){ringAt(atBefore(id));link(atBefore(id),atAfter(id));}}
    else if(kind==='push'){ringAt(atAfter(opt.target));link(atBefore(opt.target),atAfter(opt.target));}
    else{ringAt(actor);ringAt(atAfter(actor?.id));link(actor,atAfter(actor?.id));}
    if(kind==='bomb')for(const c of R.CELLS.filter(c=>Math.abs(c.x-opt.x)<=1&&Math.abs(c.y-opt.y)<=1))ringAt(c);
    if(opt.source&&opt.source!==actor?.id)link(atBefore(opt.source),actor);
    try{await tween(kind==='bomb'?430:250,t=>{rings.forEach((r,i)=>{r.scale.setScalar(1+t*(kind==='bomb'?1.6:.6));r.material.opacity=(1-t)*.9;r.rotation.z=t*(i%2?1:-1);});links.forEach(l=>l.material.opacity=1-t);});}finally{world.remove(fx);dispose(fx);}
  }
  function statusSnapshot(s){
    const out=[];if(s.winner)return out;
    for(const u of s.units.filter(u=>u.alive)){
      if(R.trapped(s,u)){const source=s.units.find(e=>e.alive&&e.side!==u.side&&e.hero==='strategist'&&((e.x===u.x&&Math.abs(e.y-u.y)===2)||(e.y===u.y&&Math.abs(e.x-u.x)===2)));out.push({key:'trap:'+u.id,kind:'trap',unit:u,source,name:'设陷',color:0xb993ff});}
      if(u.type==='soldier'&&u.id===selected){for(const h of ['general','knight']){const source=s.units.find(e=>e.alive&&e.side===u.side&&e.hero===h&&R.near(e,u)&&R.ready(s,e));if(source&&(h==='knight'||!R.protectedOpening(s)))out.push({key:h+':'+u.id,kind:'support',unit:u,source,name:h==='knight'?'神速共享':'推进共享',color:h==='knight'?0x8ee5ff:0xffd783});}}
      if(u.charged)out.push({key:'charge:'+u.id,kind:'charge',unit:u,name:'蓄力',color:0xffaa55});
      if((u.swapImmuneUntil||0)>s.ply)out.push({key:'ward:'+u.id,kind:'ward',unit:u,name:'移形保护',color:0xc19bff});
      if((u.pushImmuneUntil||0)>s.ply)out.push({key:'push:'+u.id,kind:'ward',unit:u,name:'禁止反推',color:0xffc478});
    }return out;
  }
  function refreshStatuses(){
    if(!statusEffects)return;clear(statusEffects);
    for(const effect of statusSnapshot(state)){
      const g=new THREE.Group();g.userData={effect:'status:'+effect.kind,id:effect.unit.id};statusEffects.add(g);
      const ring=effectRing(g,0,0,effect.color,effect.kind==='charge'?.40:.35);ring.userData.rotate=true;
      if(effect.kind==='trap')for(let i=0;i<4;i++){const a=i*Math.PI/2;add(g,new THREE.BoxGeometry(.025,.40,.025),new THREE.MeshBasicMaterial({color:effect.color,transparent:true,opacity:.5}),Math.cos(a)*.31,.3,Math.sin(a)*.31);}
      if(effect.kind==='charge'){const core=add(g,new THREE.OctahedronGeometry(.085),new THREE.MeshBasicMaterial({color:effect.color,transparent:true,opacity:.8}),0,1.35,0);core.userData.rotate=true;}
      const tag=label(effect.name,'#'+effect.color.toString(16),.15);const row=statusEffects.children.filter(e=>e.userData.id===effect.unit.id).length-1;tag.position.set(0,.2+row*.17,.42);g.add(tag);
    }animateStatuses(performance.now());
  }
  function animateStatuses(now){if(!statusEffects)return;for(const g of statusEffects.children){const mesh=meshes.get(g.userData.id);if(!mesh){g.visible=false;continue;}g.visible=true;g.position.set(mesh.position.x,0,mesh.position.z);for(const m of g.children)if(m.userData.rotate&&!reduced)m.rotation.z=now*.0007;}}
  async function statusTransitions(previous){
    const old=new Set(statusSnapshot(previous).map(e=>e.key));
    for(const effect of statusSnapshot(state).filter(e=>!old.has(e.key)&&e.kind==='trap')){await skillBurst(effect.source.id,'设陷');const fx=new THREE.Group();world.add(fx);fx.userData.effect='trap-bind';const ring=effectRing(fx,effect.unit.x,effect.unit.y,effect.color,.7);try{await tween(270,t=>{ring.scale.setScalar(1-t*.5);ring.material.opacity=.3+t*.6;});}finally{world.remove(fx);dispose(fx);}}
    refreshStatuses();
  }
  function follow(g,path,t){const d=Math.max(0,Math.min(1,t))*(path.length-1),i=Math.min(Math.floor(d),path.length-2);g.position.lerpVectors(vec(path[i].x,path[i].y),vec(path[i+1].x,path[i+1].y),d-i);}
  async function animateDodge(before,result){
    const p=result.pending,a=meshes.get(p.actor),r=meshes.get(p.target),path=p.opt.path;
    showPath(p.opt);
    await tween(520,t=>follow(a,path,t*.82));
    // The attacker creeps towards impact while the defender bursts out of the square.
    await Promise.all([tween(430,t=>follow(a,path,.82+t*.06)),skillBurst(p.target,'瞬闪')]);
    const from=before.find(u=>u.id===p.target),to=R.get(state,p.target),echoes=[];let last=-1;
    await tween(300,t=>{follow(a,path,.88+t*.04);r.position.lerpVectors(vec(from.x,from.y),vec(to.x,to.y),1-Math.pow(1-t,3));if(!reduced&&Math.floor(t*8)!==last){last=Math.floor(t*8);echoes.push(ghost(r));}echoes.forEach(e=>e.traverse(o=>{if(o.material)o.material.opacity*=.88;}));});
    await tween(160,t=>follow(a,path,.92+t*.08));
    clear(particles);syncUnits();
  }
  async function captureImpact(actor,target,opt){
    const attacker=meshes.get(actor.id),victim=meshes.get(target.id),path=opt.path;
    const last=path[path.length-1],previous=path[path.length-2],dx=last.x-previous.x,dz=last.y-previous.y;
    await tween(85,t=>follow(attacker,path,.90+.07*t*t));
    const slash=add(particles,new THREE.BoxGeometry(.055,1.2,.035),new THREE.MeshBasicMaterial({color:0xffedbc,transparent:true,depthTest:false}),target.x,.65,target.y);
    slash.rotation.z=-.8;slash.rotation.y=orbit.yaw;slash.userData.effect='impact-slash';
    const ring=add(particles,new THREE.TorusGeometry(.35,.028,6,40),new THREE.MeshBasicMaterial({color:0xffaa68,transparent:true}),target.x,.20,target.y);ring.rotation.x=Math.PI/2;
    const colors=[];victim.traverse(o=>{if(o.material?.emissive){colors.push([o.material,o.material.emissive.clone(),o.material.emissiveIntensity]);o.material.emissive.setHex(0xffb27a);o.material.emissiveIntensity=.9;}});
    victim.scale.set(1.18,.72,1.18);
    // Hold the contact pose before the cut completes: weight, then release.
    await tween(115,t=>{if(!reduced)world.position.set(Math.sin(t*35)*.035*(1-t),0,Math.cos(t*29)*.025*(1-t));});
    for(const [m,c,intensity] of colors){m.emissive.copy(c);m.emissiveIntensity=intensity;}
    const shards=[];for(let i=0;i<(reduced?0:18);i++){
      const shard=add(particles,new THREE.BoxGeometry(.04+Math.random()*.06,.045,.13),new THREE.MeshBasicMaterial({color:i%3===0?0xffc581:target.side==='red'?0xba6654:0x559bb8,transparent:true}),target.x,.45,target.y);
      shards.push({mesh:shard,v:new THREE.Vector3(dx*(.4+Math.random()*.65)+(Math.random()-.5)*.7,.3+Math.random()*.45,dz*(.4+Math.random()*.65)+(Math.random()-.5)*.7)});
    }
    await tween(300,t=>{
      follow(attacker,path,.97+.03*t);victim.position.copy(vec(target.x+dx*t*.35,target.y+dz*t*.35));victim.scale.set(Math.max(.001,(1-t)*1.18),Math.max(.001,(1-t)*.72),Math.max(.001,1-t));victim.rotation.x=dz*t*.7;victim.rotation.z=-dx*t*.7;
      slash.scale.set(1+t*2,1+t*.5,1);slash.material.opacity=1-t;ring.scale.setScalar(1+t*1.8);ring.material.opacity=1-t;
      for(const {mesh,v} of shards){mesh.position.set(target.x+v.x*t,.45+v.y*t-t*t*.65,target.y+v.z*t);mesh.rotation.x=t*7;mesh.rotation.z=t*5;mesh.material.opacity=1-t;}
      if(!reduced)world.position.set(Math.sin(t*45)*.018*(1-t),0,Math.cos(t*38)*.015*(1-t));
    });world.position.set(0,0,0);clear(particles);
  }
  async function dragonImpact(opt,dead){
    const fx=new THREE.Group();world.add(fx);fx.userData.effect='dragon-impact';
    const glow=add(fx,new THREE.SphereGeometry(.24,16,12),new THREE.MeshBasicMaterial({color:0xffe8ad,transparent:true,opacity:.95,depthWrite:false}),opt.x,.35,opt.y);
    const rings=[.35,.50,.65].map(r=>effectRing(fx,opt.x,opt.y,0xffab59,r));
    const light=new THREE.PointLight(0xffa24a,0,7);light.position.set(opt.x,1.5,opt.y);fx.add(light);
    const sparks=[];for(let i=0;i<(reduced?0:touchUI.matches?28:48);i++){
      const angle=i*2.39996,speed=.7+Math.random()*1.2;
      const mesh=add(fx,new THREE.OctahedronGeometry(.035+Math.random()*.04),new THREE.MeshBasicMaterial({color:i%3?0xffb355:0xffeece,transparent:true,depthWrite:false}),opt.x,.3,opt.y);
      sparks.push({mesh,angle,speed,lift:.4+Math.random()*1.4});
    }
    try{
      // A brief compression beat makes the expanding shock wave read as a heavy impact.
      await tween(110,t=>{glow.scale.setScalar(1+t*2);light.intensity=t*5;if(!reduced)world.position.y=-Math.sin(Math.PI*t)*.065;});
      await tween(780,t=>{
        const fade=1-t;glow.scale.setScalar(3+t*6);glow.material.opacity=fade*fade*.65;light.intensity=fade*5;
        rings.forEach((r,i)=>{const p=Math.max(0,(t-i*.09)/(1-i*.09));r.scale.setScalar(1+p*(7-i));r.material.opacity=(1-p)*.85;});
        for(const {mesh,angle,speed,lift} of sparks){mesh.position.set(opt.x+Math.cos(angle)*speed*t,.3+lift*Math.sin(Math.PI*t)-t*.15,opt.y+Math.sin(angle)*speed*t);mesh.rotation.set(t*5,angle,t*7);mesh.material.opacity=fade;}
        for(const u of dead){const m=meshes.get(u.id);if(!m)continue;const dx=u.x-opt.x,dz=u.y-opt.y;m.position.copy(vec(u.x+dx*t*.24,u.y+dz*t*.24,.16+Math.sin(Math.PI*t)*.28));m.scale.setScalar(Math.max(.001,1-t*1.3));m.rotation.z=-dx*t*.7;m.rotation.x=dz*t*.7;}
        if(!reduced){const strength=fade*fade*.10;world.position.set(Math.sin(t*83)*strength,Math.sin(t*67)*strength*.4,Math.cos(t*71)*strength*.7);}
      });
    }finally{world.position.set(0,0,0);world.remove(fx);dispose(fx);}
  }
  async function animateResult(before,result){
    if(result.kind==='reaction'){showPath(result.opt);return;}
    if(result.kind==='dodge'){await animateDodge(before,result);return;}
    const actor=before.find(u=>u.alive&&u.id===(result.actor||selected));
    if(result.kind!=='attack'){if(result.opt?.source&&result.opt.source!==selected)await skillBurst(result.opt.source,result.kind==='push'?'军号':'荣耀');await skillBurst(selected,skillNames[result.kind]);}
    else if(actor){const target=before.find(u=>u.id===result.opt.target);const passive=actor.hero==='assassin'?'短兵':actor.hero==='pikeman'?'武库':actor.hero==='wolf'&&target?.side===actor.side?'残忍':null;if(passive)await skillBurst(actor.id,passive);if(['wolf','vanguard'].includes(actor.hero)&&target?.type==='hero')await skillBurst(actor.id,'斩将');}
    const moving=state.units.filter(u=>u.alive&&before.some(b=>b.id===u.id&&(b.x!==u.x||b.y!==u.y))),dead=before.filter(b=>b.alive&&!R.get(state,b.id).alive);
    const jump=['vault','teleport','bomb','swap','dodge'].includes(result.kind),opt=result.opt;
    if(opt?.path?.length)showPath(opt);
    if(result.kind==='attack')await tween(280,()=>{});
    const duration=result.kind==='bomb'?850:Math.max(480,(opt?.path?.length||2)*230);
    let trailTick=-1;
    await tween(duration,t=>{if(['attack','speed','retreat','vault','teleport'].includes(result.kind)&&!reduced&&Math.floor(t*16)!==trailTick){trailTick=Math.floor(t*16);for(const u of moving){const g=meshes.get(u.id);if(g)ghost(g,.16);}}const eased=result.kind==='attack'?.90*(t*t*(3-2*t)):t*t*(3-2*t);for(const u of moving){const g=meshes.get(u.id),b=before.find(b=>b.id===u.id);if(!g)continue;const p=opt?.path?.length&&opt.path[0].x===b.x&&opt.path[0].y===b.y?opt.path:[b,u];if(result.kind==='teleport'){const fade=t<.5?1-t*2:(t-.5)*2;g.position.copy(t<.5?vec(b.x,b.y):vec(u.x,u.y));g.scale.setScalar(Math.max(.02,fade));}else if(result.kind==='swap'){g.position.lerpVectors(vec(b.x,b.y),vec(u.x,u.y),eased);const sign=u.id===opt.a?1:-1;g.position.x+=Math.sin(Math.PI*t)*.18*sign;g.position.y+=Math.sin(Math.PI*t)*.4;}else if(jump){g.position.lerpVectors(vec(b.x,b.y),vec(u.x,u.y),eased);g.position.y+=Math.sin(Math.PI*t)*(result.kind==='bomb'?1.6:.75);}else{const d=eased*(p.length-1),i=Math.min(Math.floor(d),p.length-2);g.position.lerpVectors(vec(p[i].x,p[i].y),vec(p[i+1].x,p[i+1].y),d-i);g.position.y+=Math.sin(t*Math.PI)*.07;}}});
    clear(particles);
    if(result.kind==='bomb')await dragonImpact(opt,dead);
    else if(result.kind==='attack'&&dead.length)await captureImpact(actor,dead[0],opt);
    else if(dead.length||result.kind==='bomb'){
      const bursts=dead.map(u=>({x:u.x,y:u.y}));if(!bursts.length&&opt)bursts.push(opt);
      for(const c of bursts)for(let i=0;i<(reduced?0:12);i++){const m=add(particles,new THREE.IcosahedronGeometry(.045),new THREE.MeshBasicMaterial({color:0xe7c987,transparent:true}),c.x,.4,c.y);m.userData={origin:m.position.clone(),angle:i*Math.PI/6,speed:.35+Math.random()*.4};}
      await tween(330,t=>{for(const b of dead){const g=meshes.get(b.id);if(g)g.scale.setScalar(Math.max(.001,1-t));}particles.children.forEach(p=>{const d=p.userData;p.position.copy(d.origin).add(new THREE.Vector3(Math.cos(d.angle)*t*d.speed,Math.sin(t*Math.PI)*.45,Math.sin(d.angle)*t*d.speed));p.material.opacity=1-t;});});clear(particles);
    }
    await skillResolution(before,result,actor);
    if(pathGroup)clear(pathGroup);syncUnits();
  }
  async function perform(opt,byAI=false){if(locked||(!byAI&&(isAITurn()||aiStepBusy)))return;const previous={...state,units:state.units.map(u=>({...u}))},before=previous.units,oldPly=state.ply;locked=true;setDisabled();try{const result=R.apply(state,selected,mode==='auto'?(opt.kind==='attack'?'attack':'move'):mode,opt);await animateResult(before,result);if(result.kind!=='reaction')await statusTransitions(previous);adoptPhase();}catch(e){console.error(e);clear(particles);clear(pathGroup);world.position.set(0,0,0);syncUnits();adoptPhase();toast('已恢复对局，请继续行动。');}finally{locked=false;hintAction=null;hintEpoch++;renderUI();if(state.ply!==oldPly)flashTurn();showWin();rememberPosition();scheduleAI();}}
  function adoptPhase(){skillKind=null;swapFirst=null;wheelOpen=true;wheelDismissed=false;if(state.phase==='dodge'){selected=state.pending.target;mode='auto';}else if(state.actor){selected=state.actor;mode=state.phase==='bomb'?'skill':'auto';}else{selected=null;mode='auto';}}
  async function finishChoice(byAI=false){if(locked||(!byAI&&isAITurn()))return;const previous={...state,units:state.units.map(u=>({...u}))},before=previous.units,oldPly=state.ply,p=state.pending;locked=true;setDisabled();try{if(state.phase==='normal')R.pass(state);else R.decline(state);if(p)await animateResult(before,{kind:'attack',opt:p.opt,actor:p.actor});await statusTransitions(previous);adoptPhase();}catch(e){console.error(e);clear(particles);clear(pathGroup);world.position.set(0,0,0);syncUnits();adoptPhase();toast('已恢复对局，请继续行动。');}finally{locked=false;renderUI();if(state.ply!==oldPly)flashTurn();showWin();rememberPosition();scheduleAI();}}
  function setDisabled(){document.querySelectorAll('.action,.touch-action').forEach(b=>{const m=b.dataset.action||b.dataset.command;b.disabled=locked||isAITurn()||!started||!selected||!!state.winner||!legalMode(selected,m).some(o=>!b.dataset.skill||o.kind===b.dataset.skill);b.title=b.disabled?(R.protectedOpening(state)&&m==='attack'?'开局保护中，暂不能攻击':'当前没有合法的'+({auto:'移动或攻击',move:'移动',attack:'攻击',skill:'技能'}[m])+'目标'):({auto:'点击绿格移动，红色目标攻击',move:'移动',attack:'攻击',skill:'技能'}[m]);if(b.dataset.skill)b.title=skillNames[b.dataset.skill]+(b.disabled?' · 当前不可用':'');b.classList.toggle('active',m===mode&&(m!=='skill'||b.dataset.skill===skillKind));});$('finishBtn').disabled=locked||isAITurn();$('resetBtn').disabled=locked;document.querySelectorAll('.skill-choices button,.touch-skill-choices button,.unit-row').forEach(b=>b.disabled=locked||isAITurn());positionWheel();}
  function renderUI(){
    refreshStatuses();buildWheel();
    document.body.dataset.side=state.side;$('turnNumber').textContent=String(Math.floor(state.ply/2)+1).padStart(2,'0');$('turnSide').textContent=state.winner?'对局结束':sideName(state.side)+'行动';
    $('phaseLabel').textContent=state.winner?'胜负已定':R.endgameInfo(state).active?`残局检定 · ${R.endgameInfo(state).steps} / 20 步`:R.protectedOpening(state)?`开局保护 · ${Math.floor(state.ply/2)+1} / 3`:'正式交锋';
    const phases={combo:'连击机会 · 继续攻击或结束',dodge:`${sideName(R.get(state,state.pending?.target)?.side)}防守 · 游侠瞬闪`,retreat:'游击 · 可追加移动一格',bomb:'蓄力完成 · 选择轰炸落点'};
    $('boardStatus').textContent=state.winner?'对局结束':phases[state.phase]||`${sideName(state.side)}行动 · ${R.protectedOpening(state)?'开局保护':'自由交锋'}`;
    for(const side of ['red','blue']){
      const roster=$(side+'Roster');roster.innerHTML='';for(const u of state.units.filter(u=>u.side===side)){
        const b=document.createElement('button');b.className='unit-row'+(!u.alive?' dead':'')+(u.id===selected?' selected':'');b.dataset.unit=u.id;const def=R.HEROES[u.hero];b.innerHTML=`<span class="unit-icon ${side}">${def?heroPortrait(u.hero):'兵'}</span><span class="unit-name">${u.name}<span class="unit-type">${def?.skill||'移动一格 · 攻击三格'}</span></span><span class="status-tag">${!u.alive?'退场':u.charged?'蓄力':R.trapped(state,u)?'受困':!R.ready(state,u)?'冷却':''}</span>`;b.onclick=()=>{if(locked||isAITurn())return;if(pickSwap(u.id))return;const o=options().find(o=>o.x===u.x&&o.y===u.y&&o.kind!=='swap');if(o)perform(o);else select(u.id);};roster.appendChild(b);
      }$(side+'Count').textContent=`${state.units.filter(u=>u.alive&&u.side===side).length} / 6`;
    }
    const u=R.get(state,selected);$('selectedCard').innerHTML=u?`<div class="selected-name">${u.name} <small>· ${String.fromCharCode(65+u.x)}${u.y+1}</small></div><div class="selected-desc">${R.HEROES[u.hero]?.desc||'移动一格；攻击恰好三格，可转弯，不穿越单位或重复经过格子。'}${R.trapped(state,u)?'<br>受到设陷：移动与攻击被封锁，跳跃仍可用。':''}</div>`:`<div class="empty-selection">点击己方棋子选择单位。<br>${touchUI.matches?'直接点绿格移动，点红色目标攻击；其他技能在棋盘下方选择。':'悬停高亮落点，预览行进路径。'}</div>`;
    const help={combo:'点红色目标继续连击，或结束行动。',dodge:`${state.pending?describe(R.get(state,state.pending.actor)):''} 正在攻击游侠（橙色圆环与路径）。请选择绿色落点瞬闪，或承受攻击；之后原攻击棋子在攻击落点继续行动。`,retreat:'游侠完成攻击，可移动一格，或点击“结束行动”。',bomb:'巨龙必须完成轰炸：点击横纵零至三格内的落点，包括自己所在格。'};
    $('actionHelp').textContent=state.winner?'对局已结束，可查看棋盘或重新部署。':help[state.phase]||(!u?'选择己方单位，绿格可移动，红色目标可攻击。':mode==='attack'?(touchUI.matches?'攻击必须走满距离。点红色高亮目标完成攻击。':'攻击必须走满距离。悬停目标预览路径，点击目标完成攻击。'):mode==='skill'?(skillKind==='swap'?(swapFirst?'已选'+describe(R.get(state,swapFirst))+'，请点击与其相邻的高亮棋子；再次点击已选棋子可重选。':'移形：先点击一枚高亮棋子，再点击与它相邻的另一枚高亮棋子。'):'选择高亮格发动技能。'):`${u.name}：点击绿色空格移动，点击红色目标攻击。${R.protectedOpening(state)?'开局只能移动，陷阵与神速例外。':''}`);
    $('skillChoices').innerHTML='';$('touchSkillChoices').innerHTML='';$('touchSkillChoices').hidden=!touchUI.matches||mode!=='skill';if(mode==='skill')for(const o of options().filter(o=>o.kind==='charge')){const b=document.createElement('button');b.textContent='蓄力，准备轰炸';b.onclick=()=>perform(o);(touchUI.matches?$('touchSkillChoices'):$('skillChoices')).appendChild(b);}
    if(mode==='skill'&&skillKind==='swap'&&swapFirst){const b=document.createElement('button');b.textContent='取消选择 · 重新点选';b.onclick=()=>{swapFirst=null;renderUI();};(touchUI.matches?$('touchSkillChoices'):$('skillChoices')).appendChild(b);}
    $('skillChoices').hidden=touchUI.matches||!selected||mode!=='skill';
    const optional=['combo','dodge','retreat'].includes(state.phase),noAction=!state.winner&&state.phase==='normal'&&!R.hasActions(state);$('finishBtn').hidden=!optional&&!noAction;$('finishBtn').textContent=state.phase==='dodge'?'承受攻击':state.phase==='combo'?'结束连击':noAction?'无行动 · 交接回合':'结束行动';
    $('log').innerHTML=state.events.slice(-25).reverse().map(e=>`<div class="log-entry"><span>${String(Math.floor(e.ply/2)+1).padStart(2,'0')}</span>${e.text}</div>`).join('');
    const assistVisible=started&&!state.winner&&!anyDialog();
    const assistEnabled=assistVisible&&!locked&&!aiStepBusy&&!isAITurn();
    $('aiHintBtn').hidden=!assistVisible;$('aiStepBtn').hidden=!assistVisible;
    $('aiHintBtn').disabled=!assistEnabled;$('aiStepBtn').disabled=!assistEnabled;
    setDisabled();highlight();updateWheel();if(isAITurn()&&!state.winner){$('boardStatus').textContent=aiError?'电脑暂未完成行动，请重新部署重试':'靛方 · 正在思考';$('actionHelp').textContent=state.phase==='dodge'?'电脑正在为游侠选择防守方式。':'电脑正在权衡行动。你可以拖动棋盘查看局面。';}$('boardStatus').classList.toggle('ai-thinking',isAITurn()&&!aiError);
  }
  function dismissWheel(){
    if(locked||anyDialog()||isAITurn())return;
    wheelDismissed=true;wheelOpen=false;swapFirst=null;if(skillKind==='swap'){mode='auto';skillKind=null;}
    if(state.phase==='normal'&&!state.actor)selected=null;
    clearPath();renderUI();
  }
  function buildWheel(){
    const entries=[{mode:'auto',name:state.phase==='dodge'?'瞬闪':state.phase==='retreat'?'游击':state.phase==='combo'?'连击':'行动',icon:'↟'}];
    const kinds=[...new Set(selected?R.legal(state,selected,'skill').map(o=>o.kind):[])];
    if(mode==='skill'&&!kinds.includes(skillKind))skillKind=kinds[0]||null;
    for(const kind of kinds)entries.push({mode:'skill',kind,name:kind==='charge'?'轰炸':skillNames[kind],icon:'✦'});
    document.querySelectorAll('.action').forEach(b=>b.remove());$('touchActions').replaceChildren();
    entries.forEach((entry,i)=>{
      const button=document.createElement('button');button.className='action';button.dataset.action=entry.mode;if(entry.kind)button.dataset.skill=entry.kind;
      button.setAttribute('aria-label',entry.name);button.innerHTML=`<span class="sector-label"><i>${entry.icon}</i><b>${entry.name}</b><small>${i+1}</small></span>`;
      button.onclick=()=>{if(locked||button.disabled||isAITurn())return;mode=entry.mode;skillKind=entry.kind||null;swapFirst=null;wheelOpen=false;renderUI();};
      $('wheelToggle').before(button);
      const touchButton=document.createElement('button');touchButton.className='touch-action';touchButton.dataset.command=entry.mode;if(entry.kind)touchButton.dataset.skill=entry.kind;touchButton.textContent=entry.name;touchButton.onclick=button.onclick;$('touchActions').appendChild(touchButton);
      button.dataset.index=i;button.dataset.count=entries.length;
    });
  }
  function updateWheel(){
    const u=R.get(state,selected);$('actionWheel').classList.toggle('collapsed',!wheelOpen);
    $('wheelUnit').textContent=u?.type==='hero'?R.HEROES[u.hero].name:'士兵';
    $('wheelMode').textContent=wheelOpen?'选择行动':{auto:'移动 / 攻击',move:'移动 ↗',attack:'攻击 ↗',skill:(skillNames[skillKind]||'选择落点')+' ↗'}[mode];
    $('wheelToggle').setAttribute('aria-expanded',String(wheelOpen));
    positionWheel();
  }
  function positionWheel(){
    const el=$('actionWheel'),u=R.get(state,selected);
    const hidden=wheelDismissed||!started||locked||isAITurn()||!u?.alive||!!state.winner||anyDialog();
    $('touchActions').hidden=hidden||!touchUI.matches;
    if(el.hidden!==hidden)el.hidden=hidden;
    if(el.hidden||!camera)return;
    // Project the ring on the board plane, centred on the actual base, not the head.
    const box=$('scene'),project=(x,y)=>{const p=vec(x,y,.12).project(camera);return {x:(p.x+1)*box.clientWidth/2,y:(1-p.y)*box.clientHeight/2};};
    const center=project(u.x,u.y),edge=project(u.x+Math.cos(orbit.yaw),u.y-Math.sin(orbit.yaw));
    const scale=THREE.MathUtils.clamp(74/Math.hypot(edge.x-center.x,edge.y-center.y),.60,.78);
    el.style.transform=`translate3d(${center.x-90}px,${center.y-90}px,0)`;
    const point=(radius,angle)=>{const p=project(u.x+Math.cos(angle+orbit.yaw)*radius*scale,u.y-Math.sin(angle+orbit.yaw)*radius*scale);return {x:90+p.x-center.x,y:90+p.y-center.y};};
    el.querySelectorAll('.action').forEach(button=>{
      const count=Number(button.dataset.count),index=Number(button.dataset.index);
      const angle=index*Math.PI*2/count+(count>2?Math.PI/4:0),span=Math.min(Math.PI*2/count-.28,1.65),points=[];
      for(let i=0;i<=24;i++){const p=point(1,angle-span/2+span*i/24);points.push(`${p.x}px ${p.y}px`);}
      for(let i=24;i>=0;i--){const p=point(.56,angle-span/2+span*i/24);points.push(`${p.x}px ${p.y}px`);}
      button.style.clipPath=`polygon(${points.join(',')})`;
      const p=point(.79,angle),label=button.querySelector('.sector-label');label.style.left=`${p.x}px`;label.style.top=`${p.y}px`;
    });

  }
  function anyDialog(){return !!document.querySelector('dialog[open]');}
  function isAITurn(){return started&&(aiStepBusy||(opponent==='ai'&&!state.winner&&GameAI.owner(state)==='blue'));}
  function rememberPosition(){const k=GameAI.key(state);if(positionHistory.at(-1)!==k)positionHistory.push(k);if(positionHistory.length>16)positionHistory.shift();}
  function pauseAI(){aiEpoch++;hintEpoch++;clearTimeout(aiTimer);aiTimer=null;aiBusy=false;aiStepBusy=false;hintAction=null;}
  async function showAIHint(){
    if(!started||state.winner||locked||aiStepBusy||isAITurn()||anyDialog())return;
    if(hintAction){hintAction=null;hintEpoch++;renderUI();return;}
    const epoch=++hintEpoch;const result=await GameAI.choose(state,{side:GameAI.owner(state),history:positionHistory,cancelled:()=>epoch!==hintEpoch});
    if(epoch!==hintEpoch||!result.action)return;hintAction=result.action;renderUI();
  }
  async function runAIStep(){
    if(!started||state.winner||locked||aiStepBusy||isAITurn()||anyDialog())return;
    const epoch=++aiEpoch;aiStepBusy=true;renderUI();
    try{
      const side=GameAI.owner(state),result=await GameAI.choose(state,{side,history:positionHistory,cancelled:()=>epoch!==aiEpoch});
      if(epoch!==aiEpoch||!result.action||state.winner)return;
      const a=result.action;
      if(a.type==='act'){selected=a.id;mode=a.mode;skillKind=a.mode==='skill'?a.opt.kind:null;renderUI();}
      await new Promise(resolve=>setTimeout(resolve,reduced?30:220));
      if(epoch!==aiEpoch||anyDialog())return;
      if(a.type==='act')await perform(a.opt,true);else await finishChoice(true);
    }catch(e){if(epoch===aiEpoch){console.error(e);toast('AI代走未完成，请重试。');}}
    finally{if(epoch===aiEpoch){aiStepBusy=false;renderUI();}}
  }
  function scheduleAI(){
    if(!isAITurn()||locked||aiBusy||aiTimer||anyDialog()||aiError)return;
    const epoch=aiEpoch;
    aiTimer=setTimeout(async()=>{
      aiTimer=null;if(epoch!==aiEpoch||!isAITurn()||anyDialog())return;
      aiBusy=true;renderUI();
      try{
        const result=await GameAI.choose(state,{side:'blue',history:positionHistory,cancelled:()=>epoch!==aiEpoch});
        if(epoch!==aiEpoch||!result.action||!isAITurn())return;
        const a=result.action;
        if(a.type==='act'){selected=a.id;mode=a.mode;skillKind=a.mode==='skill'?a.opt.kind:null;renderUI();}
        await new Promise(resolve=>setTimeout(resolve,reduced?30:260));
        if(epoch!==aiEpoch||anyDialog())return;
        aiBusy=false;
        if(a.type==='act')await perform(a.opt,true);else await finishChoice(true);
      }catch(e){if(epoch===aiEpoch){aiError=true;console.error(e);toast('电脑行动未完成，可以重新部署再试。');}}
      finally{if(epoch===aiEpoch){aiBusy=false;renderUI();scheduleAI();}}
    },reduced?30:380);
  }
  function describe(u){return `${sideName(u.side)}${u.name} (${String.fromCharCode(65+u.x)}${u.y+1})`;}
  function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2500);}
  function flashTurn(){if(state.winner)return;clearTimeout(flashTimer);$('turnFlash').textContent=`${sideName(state.side)} · 第 ${Math.floor(state.ply/2)+1} 回合`;$('turnFlash').classList.add('show');flashTimer=setTimeout(()=>$('turnFlash').classList.remove('show'),1100);}
  function showWin(){if(!state.winner||shownWinner)return;shownWinner=true;$('winTitle').textContent=state.winner==='draw'?'同归于尽':`${sideName(state.winner)}获胜`;$('winDetail').textContent=({material:'残局 20 步检定：棋子数量较多的一方获胜。',hero:'残局 20 步检定：双方各剩一子，英雄战胜士兵。',second:'残局 20 步检定：双方各剩一子且种类相同，后手获胜。'}[state.victoryReason]||'消灭对方全部棋子。')+` 对局结束于第 ${Math.floor(state.ply/2)+1} 回合。`;$('winDialog').showModal();}
  const heroRoles={general:'推进支援',strategist:'区域控制',vanguard:'突破连击',assassin:'灵活突袭',ranger:'闪避游击',pikeman:'近身压制',mage:'阵形调度',dragon:'蓄力轰炸',knight:'机动支援',wolf:'无差别斩将'};
  const heroArt={
    general:'<path d="M14 24 20 44H44L50 24 39 32 32 16 25 32Z"/><path d="M21 50H43M26 39H38"/>',
    strategist:'<path d="M12 34Q32 8 52 34L34 51H30Z"/><path d="M32 48V24M32 48 22 27M32 48 42 27M32 48 15 34M32 48 49 34"/>',
    vanguard:'<path d="M32 11 42 25 37 28V53H27V28L22 25Z"/><path d="M14 39 20 46 24 41M50 39 44 46 40 41"/>',
    assassin:'<path d="M15 43 26 15 38 15 49 43 41 52H23Z"/><path d="M23 35 28 38M41 35 36 38M27 46H37"/>',
    ranger:'<path d="M23 12Q55 32 23 52L23 12M15 32H50M43 26 50 32 43 38"/>',
    pikeman:'<path d="M32 10 40 23 32 30 24 23Z M32 30V54M20 23V34H44V23"/>',
    mage:'<path d="M18 46 32 12 43 46ZM13 50H51M44 15V25M39 20H49"/><circle cx="32" cy="37" r="3"/>',
    dragon:'<path d="M31 46 20 33 9 40 16 17 30 30 36 14 49 18 41 28 49 42 38 37 37 49 26 53"/><circle cx="41" cy="20" r="1"/>',
    knight:'<path d="M19 51 24 39 24 29 19 26 31 12 40 15 44 25 40 34 46 51ZM22 55H46"/><path d="M30 14V24L24 29M35 23H38"/>',
    wolf:'<path d="M14 14 26 22H38L50 14 46 42 32 54 18 42Z"/><path d="M22 31 27 34M42 31 37 34M28 42H36L32 46Z"/>'
  };
  function heroPortrait(id){return `<svg class="hero-portrait" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${heroArt[id]||''}</svg>`;}
  let inspectedHero='general',touchDraftCandidate=null;
  function inspectHero(id){
    inspectedHero=id;const h=R.HEROES[id];
    const turn=GameDraft.current(draft),allowed=turn&&!draftBusy&&!(turn.side==='blue'&&$('opponent').value==='ai')&&!draft.picks[turn.side].includes(id);
    $('confirmHero').hidden=!touchUI.matches||draft.stage!=='draft';$('confirmHero').disabled=!allowed;$('confirmHero').textContent='选择'+h.name+'入阵';
    document.querySelectorAll('.hero-card').forEach(b=>b.classList.toggle('inspecting',touchUI.matches&&b.dataset.hero===id));
    $('heroDetail').innerHTML=`<div class="detail-portrait">${heroPortrait(id)}</div><div><strong>${h.name}<small>${h.skill}</small></strong><p>${h.desc}</p></div>`;
  }
  function resetDraft(){draftEpoch++;clearTimeout(draftTimer);draftTimer=null;draft=GameDraft.create();draftBusy=false;inspectedHero='general';renderDraft();}
  function renderDraft(){
    touchDraftCandidate=null;
    const turn=GameDraft.current(draft),computer=turn?.side==='blue'&&$('opponent').value==='ai';
    $('opponent').disabled=draft.stage!=='coin'||draftBusy;
    $('tossBtn').hidden=draft.stage!=='coin';$('tossBtn').disabled=draftBusy;
    $('draftCoin').classList.toggle('tossing',draftBusy&&draft.stage==='coin');$('draftCoin').dataset.side=draft.first||'';
    $('draftCoin').querySelector('span').textContent=draft.first?sideName(draft.first).slice(0,1):'◇';
    $('coinResult').textContent=draft.first?`${sideName(draft.first)}获得先手`:draftBusy?'硬币已抛出…':'命运未定';
    $('coinHelp').textContent=draft.first?'先手优先选将，并在部署完成后率先行动。':'赤面：赤方先手 · 靛面：靛方先手';
    $('draftOrder').innerHTML=Array.from({length:4},(_,i)=>{const side=draft.first?(i%2===0?draft.first:draft.first==='red'?'blue':'red'):null;const done=i<draft.index,active=i===draft.index&&draft.stage==='draft';return `<li class="${done?'done':active?'current':''}"><small>${done?'✓':String(i+1).padStart(2,'0')}</small><span>${side?sideName(side):(i%2===0?'先手':'后手')} · ${Math.floor(i/2)+1} 号位</span></li>`;}).join('');
    for(const side of ['red','blue']){
      const list=draft.picks[side];
      $(side+'Picks').innerHTML=[0,1].map(i=>{
        const id=list[i],active=turn?.side===side&&turn.slot===i+1;
        return `<div class="draft-slot ${id?'filled':active?'awaiting':''}" data-slot="${i+1}"><span class="slot-portrait">${id?heroPortrait(id):'<span class="empty-sigil">◇</span>'}</span><div class="slot-copy"><small>${i+1} 号位 · ${i===0?'上方':'下方'}</small><strong>${id?R.HEROES[id].name:active?'正在选择':'等待入阵'}</strong><span>${id?heroRoles[id]:active?'轮到此席位':'尚未选择英雄'}</span></div>${id?'<i class="slot-check">✓</i>':''}</div>`;
      }).join('');
      document.querySelector(`[data-draft="${side}"]`).classList.toggle('active',turn?.side===side);
    }
    $('heroGrid').innerHTML='';
    for(const [id,h] of Object.entries(R.HEROES)){
      const b=document.createElement('button'),chosen=turn?draft.picks[turn.side].includes(id):false;
      b.className='hero-card'+(chosen?' chosen':'');b.dataset.hero=id;b.disabled=!turn||draftBusy||computer||chosen;
      const picked=draft.history.filter(p=>p.hero===id);
      b.setAttribute('aria-label',`${h.name}，${h.skill}${chosen?'，己方已选':''}`);
      b.innerHTML=`<span class="hero-art">${heroPortrait(id)}</span><strong>${h.name}</strong><small>${heroRoles[id]}</small><span class="picked-tags">${picked.map(p=>`<span class="picked-tag ${p.side}">${sideName(p.side)} ${p.slot}</span>`).join('')}</span>`;
      b.onmouseenter=()=>inspectHero(id);b.onfocus=()=>inspectHero(id);b.onclick=()=>{if(!touchUI.matches){inspectHero(id);pickDraft(id);return;}if(touchDraftCandidate===id){touchDraftCandidate=null;pickDraft(id);return;}touchDraftCandidate=id;inspectHero(id);$('heroDetail').scrollIntoView({block:'nearest',behavior:reduced?'instant':'smooth'});};$('heroGrid').appendChild(b);
    }
    inspectHero(inspectedHero);
    $('draftHint').textContent=draft.stage==='ready'?`部署完成，${sideName(draft.first)}先手，请点击按钮进入战场。`:turn?`${computer?'电脑正在选择': '请选择'} ${sideName(turn.side)} ${turn.slot} 号位英雄`:'投币后按顺序选将，1 号位在上，2 号位在下。';
    $('startBtn').disabled=draft.stage!=='ready';$('startBtn').hidden=draft.stage!=='ready';$('startBtn').textContent='部署完成 · 进入战场 →';
  }
  async function tossCoin(){
    if(draft.stage!=='coin'||draftBusy)return;const epoch=draftEpoch;
    const bit=crypto.getRandomValues(new Uint32Array(1))[0]&1;draftBusy=true;renderDraft();
    await new Promise(r=>setTimeout(r,reduced?60:1050));if(epoch!==draftEpoch||!$('setupDialog').open)return;
    GameDraft.toss(draft,bit);draftBusy=false;renderDraft();scheduleDraft();
  }
  function pickDraft(hero,byAI=false){
    const turn=GameDraft.current(draft);if(!turn||draftBusy||(!byAI&&turn.side==='blue'&&$('opponent').value==='ai'))return;
    try{GameDraft.choose(draft,turn.side,hero);}catch(e){toast(e.message);return;}
    draftBusy=true;renderDraft();const epoch=draftEpoch;
    draftTimer=setTimeout(()=>{draftTimer=null;if(epoch!==draftEpoch||!$('setupDialog').open)return;draftBusy=false;renderDraft();if(draft.stage==='ready')$('startBtn').scrollIntoView({block:'nearest'});else scheduleDraft();},reduced?60:400);
  }
  function scheduleDraft(){
    const turn=GameDraft.current(draft);if(!turn||turn.side!=='blue'||$('opponent').value!=='ai')return;
    const epoch=draftEpoch;draftTimer=setTimeout(()=>{draftTimer=null;if(epoch!==draftEpoch||!$('setupDialog').open)return;pickDraft(GameAI.chooseHero(draft.picks,'blue'),true);},reduced?80:650);
  }
  function openSetup(){if(locked)return;pauseAI();resetDraft();$('cancelSetup').hidden=!started;$('setupDialog').showModal();}
  function start(){
    if(!renderer||draft.stage!=='ready')return;pauseAI();draftEpoch++;clearTimeout(draftTimer);draftTimer=null;
    refreshTrainedModel();
    opponent=$('opponent').value;aiError=false;positionHistory.length=0;
    for(const g of meshes.values()){unitGroup.remove(g);dispose(g);}meshes.clear();
    state=R.create(draft.picks,draft.first);state.events.push({ply:0,text:`投币：${sideName(draft.first)}先手。`});
    for(const pick of draft.history)state.events.push({ply:0,text:`${sideName(pick.side)} ${pick.slot} 号位选择${R.HEROES[pick.hero].name}`});
    state.events.push({ply:0,text:'双方部署完成。前 3 回合保护生效。'});
    selected=null;mode='auto';skillKind=null;swapFirst=null;wheelDismissed=false;started=true;shownWinner=false;syncUnits();$('setupDialog').close();resetCamera();renderUI();flashTurn();
    $('opponentStatus').textContent=opponent==='ai'?'电脑对战 · 你执赤方':'同屏双人';rememberPosition();scheduleAI();
  }
  document.addEventListener('contextmenu',e=>{if(touchUI.matches)e.preventDefault();});
  $('confirmHero').onclick=()=>pickDraft(inspectedHero);
  $('tossBtn').onclick=tossCoin;$('opponent').onchange=renderDraft;$('aiHintBtn').onclick=showAIHint;$('aiStepBtn').onclick=runAIStep;
  $('startBtn').onclick=start;$('cancelSetup').onclick=()=>{draftEpoch++;clearTimeout(draftTimer);$('setupDialog').close();};$('setupDialog').addEventListener('cancel',e=>{if(!started)e.preventDefault();else{draftEpoch++;clearTimeout(draftTimer);}});$('resetBtn').onclick=openSetup;$('finishBtn').onclick=()=>{if(!aiStepBusy)finishChoice();};$('cameraBtn').onclick=resetCamera;$('rulesBtn').onclick=()=>{pauseAI();$('rulesDialog').showModal();};$('closeRules').onclick=()=>$('rulesDialog').close();$('againBtn').onclick=()=>{$('winDialog').close();openSetup();};$('reviewBtn').onclick=()=>$('winDialog').close();
  $('heroManual').innerHTML=Object.values(R.HEROES).map(h=>`<div><strong>${h.name} · ${h.skill}</strong>${h.desc}</div>`).join('');
  buildWheel();$('wheelToggle').onclick=()=>{wheelOpen=!wheelOpen;updateWheel();};
  for(const id of ['setupDialog','rulesDialog'])$(id).addEventListener('close',scheduleAI);
  document.addEventListener('keydown',e=>{if(anyDialog()||locked||isAITurn()||e.ctrlKey||e.altKey||e.metaKey)return;const button=/^[1-9]$/.test(e.key)&&document.querySelectorAll('.action')[Number(e.key)<=2?0:Number(e.key)-2];if(button){button.click();e.preventDefault();}if(e.key==='Escape')dismissWheel();});
  document.addEventListener('click',e=>{if(!e.target.closest('.board-wrap,button,select,dialog,.unit-list'))dismissWheel();});
  refreshTrainedModel();
  try{boot();renderUI();openSetup();}catch(e){console.error(e);$('bootError').hidden=false;$('bootError').textContent='三维场景无法启动。请使用启用硬件加速的 Edge / Chrome 浏览器，并保留 vendor 文件夹。';}
  // Read-only geometry helpers for automated click tests; no gameplay backdoor.
  window.GameView={get state(){return JSON.parse(JSON.stringify(state));},get locked(){return locked;},get aiBusy(){return aiBusy||!!aiTimer;},get opponent(){return opponent;},project(x,y,height=.25){const p=vec(x,y,height).project(camera),r=renderer.domElement.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}};
})();
