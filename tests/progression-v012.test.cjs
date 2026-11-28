const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
// Deterministic feasibility scenario, NOT a player-skill or typical pacing prediction.
// Greedy per-slot build selection and perfect knowledge of the next arena outcome are optimistic.
test('campaign and arena economy permit reaching beyond AREA100 in a deterministic scenario',()=>{
const report=new Function(source+'\n'+String.raw`
const s=fresh();let arenaWins=0,arenaEntries=0;
function evaluate(ids,n){s.monsters[s.active].equip=ids;const b=createBattle(s,n);advanceBattle(b,b.limit);let score=b.clear?2+(b.limit-b.elapsed)/b.limit:1-b.hp.reduce((a,x)=>a+x,0)/b.stage.hp.reduce((a,x)=>a+x,0);if(b.stage.bossKind==='onehit'&&!b.clear)score=Math.min(.999,b.maxHit/b.stage.hp[0]);return {b,score}}
function optimize(n){let best=null;for(const mon of Object.keys(s.monsters)){s.active=mon;let selected=[],result=evaluate([],n);for(let j=0;j<mdef(mon).slots;j++){let opt=null;for(const id of Object.keys(s.souls)){if(selected.includes(id))continue;const z=evaluate([...selected,id],n);if(!opt||z.score>opt.score)opt={id,...z}}if(!opt)break;selected.push(opt.id);result=opt}if(!best||result.score>best.score)best={mon,selected,...result}}s.active=best.mon;s.monsters[s.active].equip=best.selected;capturePreset(s);return best}
function upgrade(){for(const id of Object.keys(s.monsters))while(upgradeCharacter(s,id)){}for(const id of s.monsters[s.active].equip)while(purchaseSoul(s,id)){}}
for(let k=1;k<=130;k++){const n=s.unlocked;applyResult(s,optimize(n).b);upgrade();if(k%20===0&&s.gems>=20){arenaEnter(s,k*913+1);arenaEntries++;let wins=0;while(wins<10){const d=arenaDuel(s);if(!d.win)break;arenaFight(s);wins++}arenaWins+=wins;arenaClaim(s);upgrade()}}
return {unlocked:s.unlocked,gems:s.gems,arenaWins,arenaEntries,monsters:Object.keys(s.monsters).length};
`)();
assert.ok(report.unlocked>100,JSON.stringify(report));assert.ok(report.monsters>1);assert.ok(report.arenaWins>=10);
});
