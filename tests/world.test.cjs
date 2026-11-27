const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const engine=html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const run=code=>vm.runInNewContext(engine+'\n'+code,{console});
test("normal mode only; replay unlocked stages, reject locked and legacy missions",()=>{
 const x=run(`(()=>{const s=fresh();s.unlocked=4;return {normal:canMission(s,1,'main'),locked:canMission(s,5,'main'),hunt:canMission(s,1,'hunt'),collect:canMission(s,1,'collect'),challenge:canMission(s,1,'challenge')}})()`);
 assert.equal(x.normal,true);assert.equal(x.locked,false);assert.equal(x.hunt,false);assert.equal(x.collect,false);assert.equal(x.challenge,false);assert.throws(()=>run(`createBattle(fresh(),2)`))
});
test("boss every tenth stage; standard giant and 310-small-enemy boss",()=>{
 const x=run(`({bosses:Array.from({length:100},(_,i)=>stageData(i+1)).filter(x=>x.boss).map(x=>x.n),ten:stageData(10).count,twenty:stageData(20).count,tenSize:enemySize(0,stageData(10)).id,twentySizes:stageData(20).hp.map((_,i)=>enemySize(i,stageData(20)).id)})`);
 assert.equal(JSON.stringify(x.bosses),'[10,20,30,40,50,60,70,80,90,100]');assert.equal(x.ten,1);assert.equal(x.twenty,310);assert.equal(x.tenSize,'xxl');assert.ok(x.twentySizes.every(id=>id==='xs'||id==='s'))
});
test("legacy v2 migration preserves money, XP, soul levels, records and selected stage",()=>{
 const x=run(`(()=>{const s=fresh();s.version=2;delete s.presets;delete s.gems;delete s.firstClears;delete s.preset;s.money=717;s.unlocked=4;s.selectedStage=4;s.selectedMission='collect';s.active='fang';s.monsters.fang={level:10,xp:1,equip:['haste','spark','feast']};s.souls={might:1,haste:3,spark:2,feast:1};s.copies={haste:2};s.materials.soulFragment=6;s.history=[{stage:1,kills:12,count:12,elapsed:28.5,clear:true,reward:145,monster:'fang'}];const v=parseBackup(JSON.stringify(s)),next=parseBackup(JSON.stringify(v));return {money:v.money,level:v.monsters.fang.level,xp:v.monsters.fang.xp,equip:v.monsters.fang.equip,active:v.active,stage:v.selectedStage,mission:v.selectedMission,gems:v.gems,nextGems:next.gems,history:v.history[0],copies:v.copies.haste,soul:v.souls.haste,fragments:v.materials.soulFragment,presets:v.presets.length}})()`);
 assert.equal(x.money,717);assert.equal(x.level,10);assert.equal(x.xp,1);assert.equal(JSON.stringify(x.equip),'["haste","spark","feast"]');assert.equal(x.active,'fang');assert.equal(x.stage,4);assert.equal(x.mission,'main');assert.equal(x.gems,15);assert.equal(x.nextGems,15);assert.equal(x.history.elapsed,28.5);assert.equal(x.copies,2);assert.equal(x.soul,3);assert.equal(x.fragments,6);assert.equal(x.presets,5)
});
test("migration awards historical boss chest and gems only once",()=>{
 const x=run(`(()=>{const s=fresh();s.version=2;s.unlocked=11;s.selectedStage=11;delete s.gems;delete s.firstClears;delete s.presets;const v=validate(s),again=validate(v);return {gems:v.gems,again:again.gems,characters:Object.keys(v.monsters).length,same:JSON.stringify(v.monsters)===JSON.stringify(again.monsters),clears:Object.keys(v.firstClears).length,stage:v.selectedStage}})()`);
 assert.equal(x.gems,65);assert.equal(x.again,65);assert.equal(x.characters,2);assert.equal(x.same,true);assert.equal(x.clears,10);assert.equal(x.stage,11)
});
test("v1 import and invalid backup protection",()=>{
 const x=run(`(()=>{const s=fresh();s.version=1;s.money=812;s.unlocked=2;delete s.gems;delete s.presets;delete s.firstClears;delete s.missionRecords;delete s.materials;return parseBackup(JSON.stringify(s))})()`);
 assert.equal(x.money,812);assert.equal(x.version,5);assert.equal(x.gems,5);assert.throws(()=>run("parseBackup('{}')"));assert.throws(()=>run("parseBackup('bad JSON')"));assert.throws(()=>run(`parseBackup(JSON.stringify({...fresh(),version:999}))`))
});
test("historic counts and mission records survive changed enemy definitions",()=>{
 const x=run(`(()=>{const s=fresh();s.version=2;s.unlocked=11;s.records[5]={attempts:1,last:{stage:5,kills:3,count:3,clear:true,elapsed:29,reward:500,monster:'moss'},bestTime:29};s.missionRecords['4:collect']={attempts:3,successes:2,bestRank:'A',lastRank:'A',lastKills:25,lastReward:100,lastElapsed:29.7};const v=validate(s);return {record:v.records[5],side:v.missionRecords['4:collect']}})()`);
 assert.equal(x.record.last.count,3);assert.equal(x.record.last.clear,true);assert.equal(x.record.bestTime,29);assert.equal(x.side.attempts,3);assert.equal(x.side.lastElapsed,29.7)
});
test("invalid preset and active identity sanitized safely",()=>{
 const x=run(`(()=>{const s=fresh();s.active='__proto__';s.presets[0]={monster:'__proto__',equip:['bad']};s.preset=99;const v=validate(s);return {active:v.active,preset:v.preset,monsters:Object.keys(v.monsters),equip:v.monsters[v.active].equip}})()`);
 assert.equal(x.active,'moss');assert.equal(x.preset,4);assert.equal(JSON.stringify(x.monsters),'["moss"]');assert.equal(JSON.stringify(x.equip),'["might"]')
});
