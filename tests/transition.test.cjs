const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const engine=html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const run=code=>vm.runInNewContext(engine+'\n'+code,{console});

const ui=html.match(/<script id="ui">([\s\S]*?)<\/script>/)[1];
const makeFresh=()=>run('fresh()');
function environment(seed={},writeFail=false){
 const storage=new Map(Object.entries(seed).map(([k,v])=>[k,typeof v==='string'?v:JSON.stringify(v)])),nodes=new Map(),frames=new Map(),events=new Map();let now=0,seq=0;
 function ensure(id=''){if(id&&nodes.has(id))return nodes.get(id);const cls=new Set(),el={id,hidden:false,disabled:false,open:false,style:{setProperty(k,v){this[k]=String(v)}},dataset:{},children:[],scrollLeft:0,scrollTop:0,value:'',textContent:'',files:[],classList:{add(k){cls.add(k)},remove(k){cls.delete(k)},contains(k){return cls.has(k)},toggle(k,v){if(v)cls.add(k);else cls.delete(k)}},getBoundingClientRect(){return {left:0,top:0,width:320,height:220}},setAttribute(){},removeAttribute(){},addEventListener(k,fn){events.set(id+':'+k,fn)},querySelectorAll(s){return s==='.character-card'?Array.from({length:4},()=>({scrollIntoView(){}})):[]},appendChild(x){this.children.push(x)},remove(){},showModal(){this.open=true},close(){this.open=false},select(){},click(){}};let str='';Object.defineProperty(el,'innerHTML',{get(){return str},set(v){str=String(v);for(const m of str.matchAll(/\bid="([^"]+)"/g))ensure(m[1]);if(!str)el.children=[]}});if(id)nodes.set(id,el);return el}
 for(const m of html.slice(0,html.indexOf('<script id="engine">')).matchAll(/\bid="([^"]+)"/g))ensure(m[1]);
 const context={console,document:{hidden:false,getElementById:id=>nodes.get(id)||null,createElement:()=>ensure(),addEventListener(k,fn){events.set(k,fn)}},localStorage:{getItem:k=>storage.get(k)??null,setItem(k,v){if(writeFail)throw Error('denied');storage.set(k,v)}},location:{protocol:'http:',hostname:'example.test'},navigator:{},performance:{now:()=>now},requestAnimationFrame(fn){const n=++seq;frames.set(n,fn);return n},cancelAnimationFrame(n){frames.delete(n)},setTimeout:()=>++seq,clearTimeout(){},confirm:()=>true};
 const api=vm.runInNewContext(engine+'\n'+ui+'\n({dispatch,showScene,startBattle,pauseBattle,resumeBattle,abortBattle,settleBattle,updateBattle,renderResult,openSoul,selectPreset,seed:x=>{state=x},state:()=>state,battle:()=>battle,result:()=>resultData,scene:()=>scene,paused:()=>paused,running:()=>running,protect:()=>protectSave,snapshot:()=>JSON.stringify(state)})',context);
 return {api,nodes,storage,events,context,el:id=>nodes.get(id),advance(ms){now+=ms;const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(now))},clock(ms){now+=ms},get now(){return now}};
}
test("home only displays current equipment and five preset buttons",()=>{
 const e=environment(),a=e.api;a.dispatch('enter');assert.equal(a.scene(),'terminal');assert.equal((e.el('presets').innerHTML.match(/data-action="preset"/g)||[]).length,5);assert.equal((e.el('slots').innerHTML.match(/data-action="slot"/g)||[]).length,3);assert.ok(e.el('heroSelect').innerHTML.includes('モス'));assert.equal(e.el('charactersScene').hidden,true);assert.equal(e.el('soulsScene').hidden,true)
});
test("character and soul selectors are separate screens and return to home",()=>{
 const e=environment(),a=e.api;a.dispatch('enter');a.dispatch('characters');assert.equal(a.scene(),'characters');assert.equal((e.el('characters').innerHTML.match(/data-character="/g)||[]).length,4);a.dispatch('home');a.dispatch('slot',{index:'0'});assert.equal(a.scene(),'souls');assert.equal((e.el('soulGrid').innerHTML.match(/data-action="choose-soul"/g)||[]).length,13);a.dispatch('home');assert.equal(a.scene(),'terminal')
});
test("all stage enemies rendered; no five-enemy truncation and passive gauge absent",()=>{
 const seed=makeFresh();seed.unlocked=4;seed.selectedStage=4;seed.souls.spark=1;seed.souls.burst=1;seed.monsters.moss.equip=['might','spark','burst'];seed.presets[0].equip=['might','spark','burst'];const e=environment({'soul_rush_prototype_v3':seed}),a=e.api;a.dispatch('enter');a.dispatch('start');assert.equal(a.scene(),'battle');assert.equal((e.el('enemyTrack').innerHTML.match(/id="enemy-/g)||[]).length,a.battle().stage.count);assert.ok(a.battle().stage.count>5);assert.ok(e.el('gauge-spark'));assert.ok(e.el('count-spark'));assert.ok(e.el('gauge-burst'));assert.equal(e.el('gauge-might'),undefined);assert.equal(e.el('count-burst'),undefined);assert.equal(e.el('topbar').hidden,true);e.advance(3000);assert.equal(e.el('count-spark').textContent,'発動')
});
test("pause stops clock, settings preserves pause, resume and abort settle once",()=>{
 const e=environment(),a=e.api;a.dispatch('enter');a.dispatch('start');e.advance(8000);a.dispatch('pause');const elapsed=a.battle().elapsed,kills=a.battle().kills;assert.ok(elapsed>0);assert.equal(a.paused(),true);assert.equal(a.running(),false);assert.equal(e.el('pauseDialog').open,true);e.advance(60000);assert.equal(a.battle().elapsed,elapsed);a.dispatch('pause-settings');assert.equal(e.el('settingsDialog').open,true);a.dispatch('close-settings');assert.equal(e.el('pauseDialog').open,true);a.dispatch('resume');e.advance(1000);assert.ok(Math.abs(a.battle().elapsed-elapsed-1)<.00001);a.dispatch('pause');a.dispatch('abort');assert.equal(a.scene(),'result');assert.equal(a.result().aborted,true);assert.ok(a.result().kills>=kills);assert.equal(a.result().gems,0);assert.equal(a.result().reward.bonus,0);const before=a.snapshot();assert.equal(a.settleBattle(),false);assert.equal(a.snapshot(),before)
});
test("enemy kill generates ether and soul notices; reward scatter contains every soul",()=>{
 const e=environment(),a=e.api;a.dispatch('enter');a.dispatch('start');e.advance(24000);assert.equal(a.scene(),'result');assert.ok(e.el('effects').children.some(x=>x.innerHTML.includes('エーテル')));assert.ok(e.el('effects').children.some(x=>x.innerHTML.includes('の魂')));assert.equal((e.el('scatter').innerHTML.match(/class="loot-token"/g)||[]).length,a.result().loot.length);assert.ok(e.el('rewardStrip').innerHTML.includes('ジェム'))
});
test("boss result displays chest and all chest souls",()=>{
 const s=makeFresh();s.unlocked=10;s.selectedStage=10;s.monsters.moss.level=500;const e=environment({'soul_rush_prototype_v3':s}),a=e.api;a.dispatch('enter');a.dispatch('start');e.advance(24000);assert.equal(a.scene(),'result');assert.equal(a.result().gems,20);assert.equal(e.el('bossChest').hidden,false);assert.ok(e.el('bossChest').innerHTML.includes('宝箱'));assert.equal((e.el('scatter').innerHTML.match(/class="loot-token"/g)||[]).length,a.result().loot.length+5)
});
test("old v2 storage remains intact and new v3 key written on migration",()=>{
 const s=makeFresh();s.version=2;s.money=717;s.unlocked=4;s.selectedStage=4;delete s.gems;delete s.presets;delete s.firstClears;const raw=JSON.stringify(s),e=environment({'soul_rush_prototype_v2':raw});e.api.dispatch('enter');assert.equal(e.storage.get('soul_rush_prototype_v2'),raw);const v=JSON.parse(e.storage.get('soul_rush_prototype_v3'));assert.equal(v.version,3);assert.equal(v.money,717);assert.equal(v.gems,15);assert.equal(v.selectedStage,4)
});
test("invalid latest save protects existing bytes; write failure preserves legacy",()=>{
 const raw='{"version":999}',old=JSON.stringify(makeFresh()),e=environment({'soul_rush_prototype_v3':raw,'soul_rush_prototype_v2':old});e.api.dispatch('enter');assert.equal(e.api.protect(),true);assert.equal(e.storage.get('soul_rush_prototype_v3'),raw);assert.equal(e.el('startBtn').disabled,true);const w=environment({'soul_rush_prototype_v2':old},true);w.api.dispatch('enter');assert.equal(w.storage.get('soul_rush_prototype_v2'),old);assert.equal(w.storage.has('soul_rush_prototype_v3'),false)
});
