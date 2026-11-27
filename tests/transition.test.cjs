const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const engine=html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const ui=html.match(/<script id="ui">([\s\S]*?)<\/script>/)[1];
const freshSave=()=>vm.runInNewContext(engine+'\nfresh()',{});
function environment({reduced=false,animate=true,seed=null,legacy=null,writeFail=false}={}){
  const elements=new Map(),events=new Map(),animations=[],frames=new Map(),writes=[];
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  const sceneNames=['terminal','stage','build','shop','codex','settings','battle','result'];
  let now=0,seq=0;
  const encode=v=>v===null?null:typeof v==='string'?v:JSON.stringify(v);
  const slots=new Map([['soul_rush_prototype_v2',encode(seed)],['soul_rush_prototype_v1',encode(legacy)]]);
  function get(id){
    if(!ids.has(id))throw Error('Missing HTML element: '+id);
    if(!elements.has(id)){
      const el={id,hidden:['game','titleScreen','sceneTransition',...sceneNames.filter(x=>x!=='terminal').map(x=>x+'Scene')].includes(id),style:{},dataset:{},textContent:'',innerHTML:'',value:'',scrollTop:0,classList:{add(){},remove(){},toggle(){}},setAttribute(){},addEventListener(){},querySelector(){return null},appendChild(){},showModal(){},close(){},remove(){},select(){}};
      if(id==='sceneTransition'&&animate)el.animate=(keyframes,options)=>{
        let resolve,reject;
        const finished=new Promise((a,b)=>{resolve=a;reject=b});
        animations.push({keyframes,options,resolve,reject});
        return {finished,cancel(){}};
      };
      elements.set(id,el);
    }
    return elements.get(id);
  }
  const document={hidden:false,getElementById:get,querySelectorAll:s=>s==='.scene'?sceneNames.map(n=>get(n+'Scene')):[],addEventListener:(name,fn,capture)=>events.set(name,{fn,capture}),createElement:()=>({style:{},remove(){}}),head:{appendChild(){}}};
  const storage={getItem:key=>slots.get(key)??null,setItem:(key,value)=>{assert.equal(key,'soul_rush_prototype_v2');if(writeFail)throw Error('write denied');slots.set(key,value);writes.push(value)}};
  const context={document,localStorage:storage,location:{protocol:'http:',hostname:'example.test'},navigator:{},performance:{now:()=>now},matchMedia:()=>({matches:reduced}),console,setTimeout:()=>++seq,clearTimeout(){},requestAnimationFrame:fn=>{const id=++seq;frames.set(id,fn);return id},cancelAnimationFrame:id=>frames.delete(id)};
  const api=vm.runInNewContext(engine+'\n'+ui+'\n({enter,goTitle,navigateScene,beginBattle,actionNext,finishBattle,transitionScene,selectStage,selectRegion,selectMission,backupJSON,persistReplacement,snapshot:()=>({scene,running,loadingBattle,transitioning,startedAt,elapsed:battle?.elapsed,stage:battle?.stage.n,clear:battle?.clear,mission:battle?.mission,protectSave,saveOK,money:state.money,state:JSON.stringify(state),overlayHidden:$("sceneTransition").hidden,gameHidden:$("game").hidden,titleHidden:$("titleScreen").hidden,timer:$("timer").textContent})})',context);
  function frame(delta=0){now+=delta;const queued=[...frames.values()];frames.clear();queued.forEach(fn=>fn(now))}
  frame();frame();
  async function step(duration,fail=false){
    const a=animations.shift();
    assert.ok(a,'expected an animation');
    assert.equal(a.options.duration,duration);
    now+=duration;
    if(fail)a.reject(Error('cancelled'));else a.resolve();
    for(let i=0;i<8;i++)await Promise.resolve();
  }
  async function white(){await step(400);await step(100);await step(500)}
  async function menu(){await step(150);await step(150)}
  async function result(){await step(250);await step(250)}
  return {api,get,events,animations,frame,step,white,menu,result,writes,raw:()=>storage.getItem('soul_rush_prototype_v2'),legacyRaw:()=>storage.getItem('soul_rush_prototype_v1'),now:()=>now};
}
test('whiteout swaps at full opacity and locks input for 1000ms',async()=>{
  const e=environment(),a=e.api,p=a.enter();
  assert.equal(a.snapshot().titleHidden,false);
  assert.equal(a.snapshot().transitioning,true);
  assert.equal(e.get('sceneTransition').style.backgroundColor,'#effff9');
  assert.equal(a.enter(),undefined);
  let prevented=0,stopped=0;
  for(const name of ['click','keydown']){
    const listener=e.events.get(name);
    assert.equal(listener.capture,true);
    listener.fn({preventDefault(){prevented++},stopImmediatePropagation(){stopped++}});
  }
  assert.equal(prevented,2);assert.equal(stopped,2);
  await e.step(400);
  assert.equal(a.snapshot().titleHidden,true);
  assert.equal(a.snapshot().scene,'terminal');
  assert.equal(a.snapshot().transitioning,true);
  await e.step(100);await e.step(500);
  assert.equal(await p,true);assert.equal(e.now(),1000);
  assert.equal(a.snapshot().overlayHidden,true);assert.equal(a.snapshot().transitioning,false);
  e.events.get('click').fn({preventDefault(){prevented++},stopImmediatePropagation(){stopped++}});
  assert.equal(prevented,2);
});
test('menu and return-to-title durations; same scene is a no-op',async()=>{
  const e=environment(),a=e.api;
  let p=a.enter();await e.white();await p;
  assert.equal(a.navigateScene('terminal'),undefined);
  p=a.navigateScene('settings');assert.equal(a.snapshot().scene,'terminal');
  assert.equal(e.get('sceneTransition').style.backgroundColor,'#0d1119');
  assert.equal(a.navigateScene('shop'),undefined);
  await e.step(150);assert.equal(a.snapshot().scene,'settings');
  await e.step(150);await p;
  p=a.goTitle();await e.white();await p;
  assert.equal(a.snapshot().titleHidden,false);assert.equal(a.snapshot().gameHidden,true);
  assert.equal(e.now(),2300);
});
test('battle clock starts after whiteout; 30-second reward is granted once before result fade',async()=>{
  const e=environment(),a=e.api;
  let p=a.enter();await e.white();await p;
  p=a.beginBattle();assert.equal(a.beginBattle(),undefined);
  await e.step(400);
  assert.equal(a.snapshot().scene,'battle');assert.equal(a.snapshot().timer,'30.00');
  assert.equal(a.snapshot().running,false);assert.equal(a.snapshot().loadingBattle,true);
  await e.step(100);await e.step(500);await p;
  assert.equal(a.snapshot().startedAt,2000);assert.equal(a.snapshot().running,true);
  assert.equal(a.snapshot().overlayHidden,true);
  e.frame(29999);assert.equal(a.snapshot().running,true);
  e.frame(1);assert.equal(a.snapshot().running,false);assert.equal(a.snapshot().elapsed,30);
  assert.equal(a.snapshot().money,75);assert.equal(JSON.parse(e.raw()).money,75);
  assert.equal(a.finishBattle(),undefined);assert.equal(a.snapshot().scene,'battle');
  await e.step(250);assert.equal(a.snapshot().scene,'result');
  await e.step(250);assert.equal(a.snapshot().overlayHidden,true);
  assert.equal(a.snapshot().money,75);assert.equal(JSON.parse(e.raw()).records[1].attempts,1);
});
test('next stage and retry retain the timer and correct stage',async()=>{
  const seed=freshSave();seed.monsters.moss.level=30;
  const e=environment({seed}),a=e.api;
  let p=a.enter();await e.white();await p;
  p=a.beginBattle();await e.white();await p;
  e.frame(30000);await e.result();
  assert.equal(a.snapshot().clear,true);assert.equal(JSON.parse(e.raw()).unlocked,2);
  p=a.actionNext('next');await e.step(400);
  assert.equal(a.snapshot().stage,2);assert.equal(a.snapshot().running,false);
  await e.step(100);await e.step(500);await p;
  assert.equal(a.snapshot().running,true);
  e.frame(30000);await e.result();
  p=a.actionNext('retry');await e.white();await p;
  assert.equal(a.snapshot().stage,2);assert.equal(a.snapshot().elapsed,0);
});
test('reduced motion skips animations and retains combat timing',async()=>{
  const e=environment({reduced:true}),a=e.api;
  await a.enter();await a.navigateScene('stage');await a.beginBattle();
  assert.equal(e.animations.length,0);assert.equal(a.snapshot().startedAt,0);
  assert.equal(a.snapshot().running,true);assert.equal(a.snapshot().overlayHidden,true);
  e.frame(30000);for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(a.snapshot().scene,'result');assert.equal(a.snapshot().money,75);
});
test('missing animation API falls back to immediate navigation',async()=>{
  const e=environment({animate:false}),a=e.api;
  await a.enter();await a.navigateScene('build');
  assert.equal(a.snapshot().scene,'build');assert.equal(a.snapshot().transitioning,false);
  assert.equal(e.animations.length,0);
});
test('cancelled animation or failing scene callback releases lock',async()=>{
  const e=environment(),a=e.api;
  let p=a.enter();await e.step(400,true);await e.step(100);await e.step(500);await p;
  assert.equal(a.snapshot().transitioning,false);
  p=a.transitionScene('menu',()=>{throw Error('test error')});
  const rejected=assert.rejects(p,/test error/);
  await e.step(150);await rejected;
  assert.equal(a.snapshot().overlayHidden,true);assert.equal(a.snapshot().transitioning,false);
  p=a.navigateScene('shop');await e.menu();await p;
  assert.equal(a.snapshot().scene,'shop');
});
test('existing version 2 save survives navigation with unchanged data and key',async()=>{
  const seed=freshSave();
  seed.money=812;seed.unlocked=4;seed.selectedStage=3;seed.monsters.moss.level=9;seed.souls.haste=2;seed.monsters.moss.equip.push('haste');
  const e=environment({seed}),a=e.api;
  let p=a.enter();await e.white();await p;
  assert.equal(a.snapshot().state,JSON.stringify(seed));
  p=a.navigateScene('settings');await e.menu();await p;
  p=a.goTitle();await e.white();await p;
  assert.equal(e.raw(),JSON.stringify(seed));assert.equal(JSON.parse(e.raw()).version,2);
  assert.ok(e.writes.length>=2);
});

test('legacy migration preserves raw v1 and prefers v2 on subsequent startup',async()=>{
  const expected=freshSave();expected.money=812;expected.unlocked=12;expected.selectedStage=11;expected.monsters.moss.level=9;
  const legacy=JSON.parse(JSON.stringify(expected));legacy.version=1;delete legacy.selectedMission;delete legacy.missionRecords;delete legacy.materials;
  const e=environment({legacy,reduced:true}),a=e.api;
  assert.equal(e.raw(),null);await a.enter();
  assert.equal(a.snapshot().state,JSON.stringify(expected));assert.equal(e.legacyRaw(),JSON.stringify(legacy));
  const next=JSON.parse(e.raw());next.money=999;
  const e2=environment({seed:next,legacy,reduced:true});await e2.api.enter();
  assert.equal(e2.api.snapshot().money,999);assert.equal(e2.legacyRaw(),JSON.stringify(legacy));
});
test('world selection, locked region and side mission retry do not unlock campaign',async()=>{
  const seed=freshSave();seed.unlocked=2;
  const e=environment({seed,reduced:true}),a=e.api;await a.enter();await a.navigateScene('stage');
  assert.ok(e.get('worldMap').innerHTML.includes('始まりの森林'));
  a.selectRegion(1);assert.equal(JSON.parse(a.snapshot().state).selectedStage,1);
  a.selectMission('collect');assert.equal(JSON.parse(a.snapshot().state).selectedMission,'collect');
  await a.beginBattle();assert.equal(a.snapshot().mission,'collect');
  e.frame(30000);for(let i=0;i<8;i++)await Promise.resolve();
  const saved=JSON.parse(e.raw());
  assert.equal(saved.unlocked,2);assert.equal(saved.materials.soulFragment,3);assert.equal(saved.missionRecords['1:collect'].attempts,1);
  assert.equal(saved.records[1],undefined);assert.ok(e.get('result').innerHTML.includes('魂の欠片'));
  assert.equal(a.actionNext('next'),undefined);await a.actionNext('retry');
  assert.equal(a.snapshot().mission,'collect');assert.equal(a.snapshot().stage,1);assert.equal(a.snapshot().elapsed,0);
});
test('unknown v2 is protected and never falls back to v1',async()=>{
  const raw='{"version":999,"money":400}';
  const e=environment({seed:raw,legacy:freshSave(),reduced:true}),a=e.api;await a.enter();
  assert.equal(a.snapshot().protectSave,true);assert.equal(e.raw(),raw);assert.equal(a.backupJSON(),raw);assert.equal(e.writes.length,0);
});
test('write failure leaves the legacy and current state untouched on replacement',async()=>{
  const seed=freshSave();seed.money=812;const legacy={...seed,version:1};
  const e=environment({legacy,reduced:true,writeFail:true}),a=e.api;await a.enter();
  assert.equal(a.snapshot().saveOK,false);assert.equal(e.raw(),null);assert.equal(e.legacyRaw(),JSON.stringify(legacy));
  const before=a.snapshot().state;assert.throws(()=>a.persistReplacement(freshSave()));
  assert.equal(a.snapshot().state,before);assert.equal(e.legacyRaw(),JSON.stringify(legacy));
});

test('guild board renders actual monster, equipped souls and selected request',async()=>{
  const seed=freshSave();seed.unlocked=12;seed.selectedStage=11;seed.selectedMission='hunt';seed.monsters.moss.level=9;
  const e=environment({seed,reduced:true}),a=e.api;await a.enter();
  assert.ok(e.get('terminalMonster').innerHTML.includes('Lv.9'));
  assert.ok(e.get('terminalMonster').innerHTML.includes('装着魂'));
  assert.ok(e.get('terminalStage').innerHTML.includes('忘却の遺跡'));
  assert.ok(e.get('terminalStage').innerHTML.includes('討伐'));
  assert.ok(e.get('terminalStage').innerHTML.includes('data-scene="stage"'));
  assert.ok(e.get('terminalStage').innerHTML.includes('data-launch-battle="1"'));
  assert.equal(a.snapshot().state,JSON.stringify(seed));
  await a.beginBattle();assert.equal(a.snapshot().mission,'hunt');assert.equal(a.snapshot().stage,11);
});

test('illustrated world, equipment and report preserve actual mission data',async()=>{
  const seed=freshSave();seed.unlocked=2;seed.selectedMission='collect';
  const e=environment({seed,reduced:true}),a=e.api;await a.enter();
  assert.ok(e.get('terminalMonster').innerHTML.includes('assets/icons/moss.svg'));
  assert.ok(e.get('terminalMonster').innerHTML.includes('assets/icons/might.svg'));
  assert.ok(e.get('terminalStage').innerHTML.includes('assets/art/meadow.jpg'));
  await a.navigateScene('stage');
  assert.ok(e.get('worldMap').innerHTML.includes('data-region-art="forest"'));
  assert.ok(e.get('worldMap').innerHTML.includes('data-region-art="frost"'));
  await a.beginBattle();assert.equal(e.get('arena').dataset.regionArt,'forest');
  e.frame(30000);for(let i=0;i<8;i++)await Promise.resolve();
  assert.ok(e.get('result').innerHTML.includes('report-emblem rank-A'));
  const saved=JSON.parse(e.raw());assert.equal(saved.materials.soulFragment,3);assert.equal(saved.money,93);
});
