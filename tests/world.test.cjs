const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const source=html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
function run(code){return vm.runInNewContext(source+'\n'+code,{console})}
test('WORLD-01: eight regions partition all 100 stable stage IDs',()=>{
  const r=run('({length:REGIONS.length,ids:REGIONS.flatMap(r=>Array.from({length:r.end-r.start+1},(_,i)=>r.start+i)),first:regionForStage(1).id,last:regionForStage(100).id})');
  assert.equal(r.length,8);assert.equal(JSON.stringify(r.ids),JSON.stringify(Array.from({length:100},(_,i)=>i+1)));assert.equal(r.first,'forest');assert.equal(r.last,'other');
});
test('WORLD-02: side missions unlock only after first clear and reject locked stages',()=>{
  const r=run('(()=>{const s=fresh(),before=canMission(s,1,"hunt");s.unlocked=2;return {before,after:canMission(s,1,"hunt"),locked:canMission(s,3,"hunt"),invalid:canMission(s,1,"__proto__")}})()');
  assert.equal(r.before,false);assert.equal(r.after,true);assert.equal(r.locked,false);assert.equal(r.invalid,false);
  assert.throws(()=>run('createBattle(fresh(),1,"collect")'));
});
test('WORLD-03: hunt gives partial and mission reward without advancing main record',()=>{
  const r=run('(()=>{const s=fresh();s.unlocked=2;const b=createBattle(s,1,"hunt");advanceBattle(b,24);const r=applyResult(s,b),again=applyResult(s,b);return {s,r,again}})()');
  assert.equal(r.r.mission.success,true);assert.equal(r.r.mission.rank,'A');assert.equal(r.r.reward.total,78);assert.equal(r.s.money,78);assert.equal(r.s.unlocked,2);assert.equal(r.s.clears,0);assert.equal(r.s.records[1],undefined);assert.equal(r.s.missionRecords['1:hunt'].successes,1);assert.equal(r.again,null);
});
test('WORLD-04: collect yields shards and independent record exactly once',()=>{
  const r=run('(()=>{const s=fresh();s.unlocked=2;const b=createBattle(s,1,"collect");advanceBattle(b,24);const r=applyResult(s,b);applyResult(s,b);return {r,s}})()');
  assert.equal(r.r.mission.fragments,2);assert.equal(r.r.mission.success,true);assert.equal(r.s.materials.soulFragment,2);assert.equal(r.s.missionRecords['1:collect'].attempts,1);assert.equal(r.s.records[1],undefined);
});
test('WORLD-05: rank thresholds and time challenge boundaries',()=>{
  const r=run('(()=>{const stage=stageData(1),m=(kills,elapsed,mission)=>missionOutcome({stage,kills,elapsed,clear:kills===stage.count,mission}).rank;return [m(0,24,"main"),m(6,24,"main"),m(9,24,"main"),m(12,24,"main"),m(12,20,"main"),m(12,20,"challenge"),m(12,20.01,"challenge"),m(12,16,"challenge")]})()');
  assert.equal(JSON.stringify(r),JSON.stringify(['D','C','B','A','S','A','B','S']));
});
test('WORLD-06: side clear cannot open next main stage or change main history',()=>{
  const r=run('(()=>{const s=fresh();s.unlocked=2;s.monsters.moss.level=30;const b=createBattle(s,2,"challenge");advanceBattle(b,24);applyResult(s,b);return {unlocked:s.unlocked,clear:b.clear,history:s.history.length,best:s.best[2],record:s.missionRecords["2:challenge"]}})()');
  assert.equal(r.clear,true);assert.equal(r.unlocked,2);assert.equal(r.history,0);assert.equal(r.best,undefined);assert.equal(r.record.attempts,1);
});
test('SAVE-01: v1 migration preserves old progress, inventory and main records',()=>{
  const r=run('(()=>{const s=fresh();s.monsters.moss.level=30;const b=createBattle(s);advanceBattle(b,24);applyResult(s,b);const expected=JSON.stringify(s);s.version=1;delete s.selectedMission;delete s.materials;delete s.missionRecords;return {expected,actual:JSON.stringify(parseBackup(JSON.stringify(s)))}})()');
  assert.deepEqual(JSON.parse(r.actual),JSON.parse(r.expected));
});
test('SAVE-02: v2 mission data round trips; invalid keys and invalid selection are ignored',()=>{
  const r=run('(()=>{const s=fresh();s.unlocked=2;const b=createBattle(s,1,"collect");advanceBattle(b,24);applyResult(s,b);s.selectedMission="collect";const before=JSON.stringify(s),actual=JSON.stringify(parseBackup(before));s.selectedMission="bogus";s.missionRecords["999:hunt"]=s.missionRecords["1:collect"];s.materials.soulFragment=-5;const invalid=parseBackup(JSON.stringify(s));return {before,actual,invalid}})()');
  assert.deepEqual(JSON.parse(r.actual),JSON.parse(r.before));assert.equal(r.invalid.selectedMission,'main');assert.equal(r.invalid.materials.soulFragment,0);assert.equal(r.invalid.missionRecords['999:hunt'],undefined);
});
test('WORLD-07: all collection goals can be reached by full clears',()=>{
  assert.equal(run('Array.from({length:MAX_STAGE},(_,i)=>stageData(i+1)).every(stage=>Math.floor(stage.count/3)>=missionPlan(stage,"collect").target)'),true);
});
