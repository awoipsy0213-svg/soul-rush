// Edit data/balance.json, then run node scripts/sync-balance.cjs.
// Keep index.html self-contained for the browser/PWA.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),file=path.join(root,'index.html');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/balance.json'),'utf8'));
const marker=/\/\* BALANCE_MASTER_BEGIN \*\/\nconst BALANCE_MASTER=[^\n]+;\n\/\* BALANCE_MASTER_END \*\//;
const old=fs.readFileSync(file,'utf8');
if(!marker.test(old))throw Error('Missing balance master marker');
const next=old.replace(marker,()=> '/* BALANCE_MASTER_BEGIN */\nconst BALANCE_MASTER='+JSON.stringify(data)+';\n/* BALANCE_MASTER_END */');
if(process.argv.includes('--check')){if(next!==old)throw Error('Balance master out of sync');}
else fs.writeFileSync(file,next);
console.log(next===old?'Balance master is synchronized':'Balance master synchronized');
