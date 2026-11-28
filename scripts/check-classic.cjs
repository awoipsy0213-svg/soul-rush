const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),cfg=JSON.parse(read('classic/reference.json'));
const master=read('classic/index.html').match(/const BALANCE_MASTER=([^\n]+);/)[1],m=JSON.parse(master);
for(const [k,v] of Object.entries(cfg.combat))assert.deepEqual(m.combat[k],v,k);
for(const [k,v] of Object.entries(cfg.stage))assert.deepEqual(m.stage[k],v,k);
for(const [id,row] of Object.entries(cfg.weapons))for(const [k,v] of Object.entries(row))assert.deepEqual(m.monsters[id][k],v,id+'.'+k);
for(const [id,name] of Object.entries(cfg.runeNames))assert.equal(m.souls[id].name,name,id);
console.log('Classic reference override data synchronized.');
