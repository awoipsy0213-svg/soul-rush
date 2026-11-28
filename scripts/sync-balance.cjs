// Edit data/master/*.json. Generated data/balance.json and embedded HTML are not hand-edited.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=n=>JSON.parse(fs.readFileSync(path.join(root,'data/master',n+'.json'),'utf8'));
const w=read('weapon_master'),r=read('rune_master'),e=read('enemy_master'),s=read('stage_master'),b=read('boss_master'),q=read('reward_master'),d=read('drop_table'),u=read('upgrade_table'),f=read('effect_master'),c=read('balance_config');
const data={combat:c.combat,monsters:w,souls:r.souls,enemySizes:e.sizes,stage:{...s,...b,enemyPatterns:e.patterns,lanes:e.lanes},reward:{...q.campaign,...d},upgrade:u,buffs:r.buffs,passive:r.passive,arena:q.arena,gift:q.gift,shop:q.shop,cosmetics:c.cosmetics,effects:f,buildTemplates:c.buildTemplates,lab:c.lab};
const positive=(n,label)=>{if(!Number.isFinite(n)||n<=0)throw Error('Invalid '+label)};
for(const [id,m] of Object.entries(w)){for(const k of ['atk','speed','range','slots','cap'])positive(m[k],id+'.'+k);if(!Number.isInteger(m.slots)||m.slots>6||!Number.isInteger(m.cap)||m.engage<0||m.engage>m.range||!['forward','line','cone'].includes(m.shape))throw Error('Invalid weapon geometry '+id);if(m.allowed.some(k=>!r.souls[k]))throw Error('Invalid allowed rune '+id)}
for(const [id,x] of Object.entries(r.souls)){positive(x.cost,id+'.cost');if(!Number.isFinite(x.chance)||x.chance<0||x.chance>1)throw Error('Invalid trigger chance '+id);if(x.every)positive(x.every,id+'.every');if(x.period)positive(x.period,id+'.period');if(x.shape==='blast'||x.shape==='circle')positive(x.radius,id+'.radius');if(x.hits&&(!Number.isInteger(x.hits)||x.hits>32||x.hits<1))throw Error('Invalid hits '+id)}
if(!Array.isArray(e.lanes)||!e.lanes.length||e.lanes.some(x=>!Number.isFinite(x)))throw Error('Invalid enemy lanes');
for(const k of ['limit','walkSpeed','speedCap','eventCap','minPeriod'])positive(c.combat[k],k);
for(const x of c.buildTemplates){if(x.monsters.some(k=>!w[k])||x.souls.some(k=>!r.souls[k]))throw Error('Unknown build master ID '+x.id)}
const file=path.join(root,'index.html'),json=path.join(root,'data/balance.json'),marker=/\/\* BALANCE_MASTER_BEGIN \*\/\nconst BALANCE_MASTER=[^\n]+;\n\/\* BALANCE_MASTER_END \*\//,old=fs.readFileSync(file,'utf8');
if(!marker.test(old))throw Error('Missing balance master marker');
const next=old.replace(marker,()=> '/* BALANCE_MASTER_BEGIN */\nconst BALANCE_MASTER='+JSON.stringify(data)+';\n/* BALANCE_MASTER_END */'),compiled=JSON.stringify(data,null,2)+'\n';
if(process.argv.includes('--check')){if(next!==old||fs.readFileSync(json,'utf8')!==compiled)throw Error('Balance master out of sync; run node scripts/sync-balance.cjs')}
else{fs.writeFileSync(file,next);fs.writeFileSync(json,compiled)}
console.log('Balance master is synchronized (10 source masters)');
