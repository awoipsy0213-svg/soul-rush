const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const engine=html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const run=code=>vm.runInNewContext(engine+'\n'+code,{console});
test("24-second initial battle, partial rewards, no auto-level and loot",()=>{
 const x=run(`(()=>{const s=fresh(),b=createBattle(s);advanceBattle(b,24);const r=applyResult(s,b);return {done:b.done,kills:b.kills,elapsed:b.elapsed,clear:b.clear,ether:r.reward.total,dropSum:b.etherDrops.reduce((a,x)=>a+x.amount,0),xp:r.xp,lv:s.monsters.moss.level,loot:r.loot.length,again:applyResult(s,b),gems:r.gems}})()`);
 assert.equal(x.done,true);assert.equal(x.elapsed,24);assert.equal(x.clear,false);assert.equal(x.kills,11);assert.equal(x.ether,82);assert.equal(x.dropSum,x.ether);assert.equal(x.xp,0);assert.equal(x.lv,1);assert.ok(x.loot>0);assert.equal(x.again,null);assert.equal(x.gems,0)
});
test("early clear grants stage reward and 4 gems exactly once",()=>{
 const x=run(`(()=>{const s=fresh();s.monsters.moss.level=30;const a=createBattle(s);advanceBattle(a,24);const r=applyResult(s,a);const b=createBattle(s,1);advanceBattle(b,24);const t=applyResult(s,b);return {first:r.gems,repeat:t.gems,clear:a.clear,elapsed:a.elapsed,gems:s.gems,unlocked:s.unlocked,bonus:r.reward.bonus,again:applyResult(s,a)}})()`);
 assert.equal(x.first,4);assert.equal(x.repeat,0);assert.equal(x.clear,true);assert.ok(x.elapsed<24);assert.equal(x.gems,4);assert.equal(x.unlocked,2);assert.ok(x.bonus>0);assert.equal(x.again,null)
});
test("boss first clear grants 4 gems, five souls once",()=>{
 const x=run(`(()=>{const s=fresh();s.unlocked=10;s.selectedStage=10;s.monsters.moss.level=500;const a=createBattle(s);advanceBattle(a,24);const r=applyResult(s,a);const b=createBattle(s,10);advanceBattle(b,24);const t=applyResult(s,b);return {clear:r.clear,first:r.gems,repeat:t.gems,chars:r.chest.filter(x=>x.kind==='character').length,souls:r.chest.filter(x=>x.kind==='soul').length,loot:r.loot.length,repeatChest:t.chest.length,gems:s.gems,owned:Object.keys(s.monsters).length,unlocked:s.unlocked}})()`);
 assert.equal(x.clear,true);assert.equal(x.first,4);assert.equal(x.repeat,0);assert.equal(x.chars,0);assert.equal(x.souls,5);assert.ok(x.loot>=1);assert.equal(x.repeatChest,0);assert.equal(x.gems,4);assert.equal(x.owned,1);assert.equal(x.unlocked,11)
});
test("stopping mid-run preserves earned rewards without first clear or unlock",()=>{
 const x=run(`(()=>{const s=fresh(),b=createBattle(s);advanceBattle(b,12);const partial=rewards(b).partial,loot=b.loot.length,kills=b.kills;const stopped=stopBattle(b),r=applyResult(s,b);return {stopped,aborted:r.aborted,clear:r.clear,partial,paid:r.reward.total,loot,paidLoot:r.loot.length,kills,xp:r.xp,bonus:r.reward.bonus,gems:r.gems,unlocked:s.unlocked,again:applyResult(s,b)}})()`);
 assert.equal(x.stopped,true);assert.equal(x.aborted,true);assert.equal(x.clear,false);assert.equal(x.partial,x.paid);assert.equal(x.loot,x.paidLoot);assert.ok(x.kills>0);assert.equal(x.xp,0);assert.equal(x.bonus,0);assert.equal(x.gems,0);assert.equal(x.unlocked,1);assert.equal(x.again,null)
});
test("unfinished battles cannot award rewards",()=>{
 const x=run(`(()=>{const s=fresh(),before=JSON.stringify(s),b=createBattle(s);advanceBattle(b,5);return {result:applyResult(s,b),unchanged:JSON.stringify(s)===before}})()`);
 assert.equal(x.result,null);assert.equal(x.unchanged,true)
});
test("fixed simulation seed, incremental and single-jump results match",()=>{
 const x=run(`(()=>{const s=fresh();s.souls.spark=1;s.souls.burst=1;s.monsters.moss.equip=['might','spark','burst'];const a=createBattle(s),b=createBattle(s);advanceBattle(a,24);for(let i=1;i<=240;i++)advanceBattle(b,i/10);return {a:JSON.stringify(a),b:JSON.stringify(b)}})()`);
 assert.equal(x.a,x.b)
});
test("24-second boundary counts exactly at limit and rejects later hit",()=>{
 const x=run(`(()=>{const make=t=>{const b=createBattle(fresh());b.stage={...b.stage,count:1,hp:[10]};b.hp=[10];b.stats={atk:10,speed:1/t,levels:{}};b.nextAttack=t;return b};const a=make(24),b=make(24.01);advanceBattle(a,23.999);const before=a.done;advanceBattle(a,24);advanceBattle(b,24);return {before,clear:a.clear,elapsed:a.elapsed,late:b.clear,lateKills:b.kills}})()`);
 assert.equal(x.before,false);assert.equal(x.clear,true);assert.equal(x.elapsed,24);assert.equal(x.late,false);assert.equal(x.lateKills,0)
});
test("next enemy is immediately targetable",()=>{
 const x=run(`(()=>{const b=createBattle(fresh());b.stage={...b.stage,count:2,hp:[10,10]};b.hp=[10,10];b.stats={atk:10,speed:1,levels:{}};b.nextAttack=1;advanceBattle(b,1);const a={kills:b.kills,front:front(b),done:b.done};advanceBattle(b,2);return {a,kills:b.kills,clear:b.clear,elapsed:b.elapsed}})()`);
 assert.equal(x.a.kills,1);assert.equal(x.a.front,1);assert.equal(x.a.done,false);assert.equal(x.kills,2);assert.equal(x.clear,true);assert.equal(x.elapsed,2)
});
test("soul duplicates do not auto-level and require both resources",()=>{
 const x=run(`(()=>{const s=fresh();s.money=200;const denied=!purchaseSoul(s,'might'),first=grantSoul(s,'haste'),duplicate=grantSoul(s,'haste');grantSoul(s,'haste');const before=s.souls.haste,cost=soulCost('haste',before);const oldMoney=s.money,ok=purchaseSoul(s,'haste');return {denied,first,duplicate,before,ok,lv:s.souls.haste,copies:s.copies.haste||0,paid:oldMoney-s.money,cost,unowned:purchaseSoul(s,'pulse')}})()`);
 assert.equal(x.denied,true);assert.equal(x.first,true);assert.equal(x.duplicate,false);assert.equal(x.before,1);assert.equal(x.ok,true);assert.equal(x.lv,2);assert.equal(x.copies,0);assert.equal(x.paid,x.cost);assert.equal(x.unowned,false)
});
test("characters unlock only with gems; summon gives duplicate without direct rank",()=>{
 const x=run(`(()=>{const s=fresh();s.money=10000;const no=purchaseMonster(s,'fang');s.gems=100;const yes=purchaseMonster(s,'fang'),money=s.money,after=s.gems,repeat=purchaseMonster(s,'fang');const draw=summonCharacter(s,0);return {no,yes,repeat,money,after,gems:s.gems,draw,rank:s.monsters.fang.rank,lv:s.monsters.fang.level,dups:s.monsters.fang.duplicates}})()`);
 assert.equal(x.no,false);assert.equal(x.yes,true);assert.equal(x.repeat,false);assert.equal(x.money,10000);assert.equal(x.after,65);assert.equal(x.gems,40);assert.equal(x.draw.id,'fang');assert.equal(x.draw.new,false);assert.equal(x.rank,0);assert.equal(x.lv,1);assert.equal(x.dups,1)
});
test("monster level upgrade consumes duplicate and ether without changing legacy rank",()=>{
 const x=run(`(()=>{const s=fresh();grantCharacter(s,'fang');s.money=1000;const no=upgradeCharacter(s,'fang');grantCharacter(s,'fang');const a=getStats(s,'fang'),before=s.money,ok=upgradeCharacter(s,'fang'),b=getStats(s,'fang');return {no,ok,paid:before-s.money,level:s.monsters.fang.level,xp:s.monsters.fang.xp,dups:s.monsters.fang.duplicates,rank:s.monsters.fang.rank,atk:b.atk>a.atk,spd:b.speed>a.speed}})()`);
 assert.equal(x.no,false);assert.equal(x.ok,true);assert.equal(x.paid,150);assert.equal(x.level,2);assert.equal(x.xp,0);assert.equal(x.dups,0);assert.equal(x.rank,0);assert.equal(x.atk,true);assert.equal(x.spd,true)
});
test("no designed character level or rank cap; high levels survive save roundtrip",()=>{
 const x=run(`(()=>{const s=fresh();s.monsters.moss.level=100001;s.monsters.moss.rank=1001;s.souls.might=1001;s.copies.might=1002;s.money=1000000;const ok=purchaseSoul(s,'might'),v=parseBackup(JSON.stringify(s));return {level:v.monsters.moss.level,rank:v.monsters.moss.rank,soul:v.souls.might,ok}})()`);
 assert.equal(x.level,100001);assert.equal(x.rank,1001);assert.equal(x.soul,1002);assert.equal(x.ok,true)
});
test("five builds are independent and persist selected character and souls",()=>{
 const x=run(`(()=>{const s=fresh();grantCharacter(s,'fang');grantSoul(s,'haste');grantSoul(s,'spark');equipSlot(s,1,'haste');selectPreset(s,1);selectCharacter(s,'fang');equipSlot(s,0,'spark');selectPreset(s,0);const a={id:s.active,equip:s.monsters[s.active].equip.slice()};selectPreset(s,1);const v=parseBackup(JSON.stringify(s));return {length:v.presets.length,a,id:v.active,equip:v.monsters[v.active].equip,preset:v.preset,p0:v.presets[0],p1:v.presets[1]}})()`);
 assert.equal(x.length,5);assert.equal(x.a.id,'moss');assert.equal(JSON.stringify(x.a.equip),'["might","haste"]');assert.equal(x.id,'fang');assert.equal(JSON.stringify(x.equip),'["spark"]');assert.equal(x.preset,1);assert.equal(JSON.stringify(x.p0.equip),'["might","haste"]')
});
test("slots enforce ownership, five-slot capacity and no duplicated equip",()=>{
 const x=run(`(()=>{const s=fresh();for(const id of ['haste','spark','pulse','burst','rage'])grantSoul(s,id);const a=equipSlot(s,1,'pulse'),b=equipSlot(s,2,'haste'),c=equipSlot(s,3,'spark'),d=equipSlot(s,4,'burst'),cap=equipSlot(s,5,'rage'),unowned=equipSlot(s,0,'opening'),swap=equipSlot(s,0,'spark'),remove=equipSlot(s,4,null);return {a,b,c,d,cap,unowned,swap,remove,equip:s.monsters.moss.equip}})()`);
 assert.equal(x.a,true);assert.equal(x.b,true);assert.equal(x.c,true);assert.equal(x.d,true);assert.equal(x.cap,false);assert.equal(x.unowned,false);assert.equal(x.swap,true);assert.equal(x.remove,true);assert.equal(JSON.stringify(x.equip),'["spark","pulse","haste","might"]')
});
test("battle captures stats and equipped souls at launch",()=>{
 const x=run(`(()=>{const s=fresh(),b=createBattle(s),before=JSON.stringify(b.stats);s.monsters.moss.level=50;grantSoul(s,'haste');equipSlot(s,1,'haste');return {same:JSON.stringify(b.stats)===before,different:JSON.stringify(getStats(s))!==before}})()`);
 assert.equal(x.same,true);assert.equal(x.different,true)
});
test("all 33 souls and six enemy sizes remain available",()=>{
 const x=run(`({souls:SOULS.length,sizes:ENEMY_SIZES.length,times:Object.values(TRIGGERS).filter(x=>x.period).length,counts:Object.values(TRIGGERS).filter(x=>x.every).length})`);
 assert.equal(x.souls,33);assert.equal(x.sizes,6);assert.equal(x.times,13);assert.equal(x.counts,9)
});
