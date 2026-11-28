const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const rows=new Function(src+String.raw`
function economyScenario(useWorkshop,rounds=60){const s=fresh();let spend=0,salvage=0,created=0,upgrades=0,clears=0,killTotal=0;
 for(let run=1;run<=rounds;run++){
  s.selectedStage=s.unlocked;
  const search=optimizeOwnedBuild(s,s.selectedStage,40);if(search?.best[0])applyOptimizedBuild(s,search.best[0]);
  const b=createBattle(s,s.selectedStage);advanceBattle(b,b.limit);applyResult(s,b);killTotal+=b.kills;if(b.clear)clears++;
  const ids=s.monsters[s.active].equip.slice();
  for(const id of ids){if(purchaseSoul(s,id))upgrades++}
  if(useWorkshop){
   for(const id of Object.keys(s.souls)){if(ids.includes(id))continue;const excess=Math.max(0,(s.copies[id]||0)-soulRequired(s.souls[id]));if(excess){const q=workshopTrade(s,id,'salvage',Math.min(excess,BALANCE_MASTER.upgrade.workshop.batchLimit));if(q)salvage+=q.amount}}
   const target=ids.map(id=>({id,missing:Math.max(0,soulRequired(s.souls[id])-(s.copies[id]||0)),cost:soulCost(id,s.souls[id])})).filter(v=>v.missing>0&&v.cost<=s.money&&v.missing<=BALANCE_MASTER.upgrade.workshop.batchLimit).map(v=>({...v,q:workshopQuote(s,v.id,'craft',v.missing)})).filter(v=>v.q?.ok).sort((a,b)=>a.q.amount-b.q.amount||a.cost-b.cost)[0];
   if(target){const q=workshopTrade(s,target.id,'craft',target.missing);if(q){spend+=q.amount;created+=q.qty;if(purchaseSoul(s,target.id))upgrades++}}
  }
 }
 return {rounds,unlocked:s.unlocked,clears,kills:killTotal,upgrades,fragments:fragmentCount(s),spend,salvage,created,owned:Object.keys(s.souls).length,ether:s.money}
}
return [economyScenario(false),economyScenario(true)]
`)();
process.stdout.write(JSON.stringify(rows,null,2)+'\n');
