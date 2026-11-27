/* Browser-only smoke test, uses installed Chrome/Chromium and Node 22 CDP. No network or external libraries. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process');
const root=path.join(__dirname,'..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const profiles=fs.mkdtempSync(path.join(os.tmpdir(),'soul-rush-chrome-'));
const execs=[process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium','chromium-browser'].filter(Boolean);
const chrome=execs.find(bin=>cp.spawnSync(bin,['--version'],{stdio:'ignore'}).status===0);
if(!chrome)throw Error('Chrome/Chromium executable unavailable');
const server=http.createServer((req,res)=>{try{const name=new URL(req.url,'http://127.0.0.1').pathname;const rel=name==='/'?'index.html':name.slice(1);if(!/^(?:index\.html|sw\.js|manifest\.webmanifest|icons\/[a-zA-Z0-9_.-]+|assets\/(?:CREDITS\.html|(?:art|icons|portraits|audio)\/[a-zA-Z0-9_.-]+))$/.test(rel)){res.statusCode=404;return res.end('not found')}const ext=path.extname(rel),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ogg':'audio/ogg'}[ext]||'application/octet-stream';const data=fs.readFileSync(path.join(root,rel));res.setHeader('Content-Type',mime);res.setHeader('Cache-Control','no-store');return res.end(data)}catch{res.statusCode=404;res.end('not found')}});
let proc,ws;
async function until(fn,ms=10000){const end=Date.now()+ms;while(Date.now()<end){let r;try{r=await fn()}catch(e){}if(r)return r;await sleep(60)}throw Error('condition timed out')}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/';
  proc=cp.spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profiles,'about:blank'],{stdio:'ignore'});
  const port=await until(()=>fs.existsSync(path.join(profiles,'DevToolsActivePort'))&&fs.readFileSync(path.join(profiles,'DevToolsActivePort'),'utf8').split('\n')[0]);
  const tab=await until(async()=>{const r=await fetch('http://127.0.0.1:'+port+'/json/list');return (await r.json()).find(t=>t.type==='page')});
  ws=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  let seq=0;const wait=new Map(),errors=[];
  ws.addEventListener('message',e=>{const v=JSON.parse(e.data);if(v.id){const p=wait.get(v.id);if(p){wait.delete(v.id);v.error?p.reject(Error(v.error.message)):p.resolve(v.result)}}else if(v.method==='Runtime.exceptionThrown')errors.push(v.params.exceptionDetails.text+': '+(v.params.exceptionDetails.exception?.description||''))});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;wait.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(wait.has(id)){wait.delete(id);reject(Error('CDP timeout '+method))}},8000).unref()});
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
  const click=async(selector)=>{assert.equal(await evaluate('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el||el.disabled||el.closest("[hidden]"))return false;el.scrollIntoView({block:"nearest"});el.click();return true})()'),true,'missing enabled button '+selector);};

  const scene=async(name)=>until(()=>evaluate('document.getElementById("app")?.dataset.scene==='+JSON.stringify(name)));
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await send('Page.navigate',{url});
  await until(()=>evaluate('document.getElementById("titleScreen")&&!document.getElementById("titleScreen").hidden'));
  await click('#enterBtn');await scene('terminal');
  const screenshot=async name=>{if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});const pic=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SCREENSHOT_DIR,name+'.png'),Buffer.from(pic.data,'base64'))}};
  const geometry=async id=>evaluate('(()=>{const a=document.getElementById("app"),s=document.getElementById('+JSON.stringify(id)+'),r=s.getBoundingClientRect();return {vw:innerWidth,vh:innerHeight,docW:document.documentElement.scrollWidth,docH:document.documentElement.scrollHeight,appW:a.clientWidth,appSW:a.scrollWidth,sceneH:s.clientHeight,sceneSH:s.scrollHeight,sceneW:s.clientWidth,sceneSW:s.scrollWidth,bottom:r.bottom}})()');
  const noOverflow=async id=>{const g=await geometry(id);assert.ok(g.docW<=g.vw+2&&g.docH<=g.vh+2,'outer viewport overflow '+JSON.stringify(g));assert.ok(g.sceneSW<=g.sceneW+2&&g.sceneSH<=g.sceneH+3,'screen overflow '+id+' '+JSON.stringify(g));assert.ok(g.bottom<=g.vh+2,'screen bottom outside viewport '+JSON.stringify(g));return g};
  for(const [width,height] of [[390,844],[375,600],[320,568],[1280,800]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600,screenWidth:width,screenHeight:height});
    await sleep(120);await noOverflow('terminalScene');
    assert.ok(await evaluate('(()=>{const b=document.querySelector("#startBtn").getBoundingClientRect();return b.height>=40&&b.bottom<=innerHeight&&b.top>=0})()'),'launch visible');
    assert.equal(await evaluate('document.querySelectorAll("#presets button").length'),5);
    await screenshot('home-'+width+'x'+height);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});
  await click('#heroSelect');await scene('characters');
  assert.equal(await evaluate('document.querySelectorAll(".character-card").length'),7);
  assert.equal(await evaluate('getComputedStyle(document.getElementById("characters")).overflowX'),'auto');
  assert.ok(await evaluate('document.getElementById("characters").scrollWidth>document.getElementById("characters").clientWidth'));
  await screenshot('characters');await click('#backBtn');await scene('terminal');
  await click('#slots [data-index="0"]');await scene('souls');
  assert.equal(await evaluate('document.querySelectorAll(".soul-tile").length'),33);
  assert.equal(await evaluate('getComputedStyle(document.getElementById("soulScroll")).overflowY'),'auto');
  await screenshot('souls');await click('#backBtn');await scene('terminal');
  // Synthetic test-only data in this isolated browser profile.
  await evaluate('state.unlocked=4;state.selectedStage=4;state.souls.spark=1;state.souls.burst=1;state.monsters.moss.equip=["might","spark","burst"];capturePreset(state);save();renderHome()');
  await click('#startBtn');await scene('battle');
  assert.equal(await evaluate('document.querySelectorAll("#enemyTrack .enemy").length'),25);
  assert.ok(await evaluate('document.getElementById("enemyTrack").scrollWidth>document.getElementById("arena").clientWidth'));
  assert.ok(await evaluate('!!document.getElementById("gauge-spark")&&!!document.getElementById("count-spark")&&!!document.getElementById("gauge-burst")&&!document.getElementById("gauge-might")'));
  await noOverflow('battleScene');await screenshot('battle-all-enemies');
  await evaluate('cancelAnimationFrame(raf);startedAt=performance.now()-8000;pauseBattle()');
  assert.equal(await evaluate('paused&&!running&&document.getElementById("pauseDialog").open'),true);
  const elapsed=await evaluate('battle.elapsed');
  await sleep(350);assert.equal(await evaluate('battle.elapsed'),elapsed);
  await click('#pauseDialog [data-action="pause-settings"]');
  assert.equal(await evaluate('document.getElementById("settingsDialog").open&&paused'),true);
  await click('#settingsDialog [data-action="close-settings"]');
  await click('#pauseDialog [data-action="abort"]');await scene('result');
  assert.equal(await evaluate('resultData.aborted&&resultData.gems===0&&resultData.reward.bonus===0'),true);
  assert.equal(await evaluate('document.querySelectorAll("#scatter .loot-token").length'),await evaluate('resultData.loot.length'));
  await noOverflow('resultScene');await screenshot('result-aborted');
  await click('#resultActions [data-action="home"]');await scene('terminal');
  await evaluate('state.unlocked=10;state.selectedStage=10;state.monsters.moss.level=500;save();renderHome()');
  await click('#startBtn');await scene('battle');
  await evaluate('cancelAnimationFrame(raf);advanceBattle(battle,24);updateBattle();settleBattle()');await scene('result');
  assert.equal(await evaluate('resultData.gems'),4);assert.equal(await evaluate('resultData.chest.length'),5);
  assert.equal(await evaluate('document.getElementById("bossChest").hidden'),false);
  assert.equal(await evaluate('document.querySelectorAll("#scatter .loot-token").length'),await evaluate('resultData.loot.length+5'));
  for(const [width,height] of [[390,844],[375,600],[320,568]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true,screenWidth:width,screenHeight:height});await sleep(120);
    await noOverflow('resultScene');
    assert.ok(await evaluate('(()=>{const p=document.querySelector("#scatter").getBoundingClientRect();return [...document.querySelectorAll(".loot-token")].every(n=>{const r=n.getBoundingClientRect();return r.left>=p.left-1&&r.right<=p.right+1&&r.top>=p.top-1&&r.bottom<=p.bottom+1})})()'),'loot inside box');
    await screenshot('boss-result-'+width+'x'+height);
  }
  await click('#resultActions [data-action="home"]');await scene('terminal');
  await evaluate('state.selectedStage=10;save();renderHome()');await click('#startBtn');await scene('battle');
  await evaluate('cancelAnimationFrame(raf);advanceBattle(battle,24);settleBattle()');await scene('result');
  assert.equal(await evaluate('resultData.gems===0&&resultData.chest.length===0'),true);
  await click('#resultActions [data-action="home"]');await scene('terminal');
  // Exercise the actual new arena UI with deterministic, isolated test state.
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});
  await evaluate('state.gems=40;state.monsters.moss.level=10000;save();renderHome()');
  await click('#arenaBtn');assert.equal(await evaluate('document.getElementById("arenaDialog").open'),true);
  await click('#arenaActions [data-action="arena-enter"]');assert.equal(await evaluate('state.gems'),20);
  await screenshot('arena-entry');await click('#arenaActions [data-action="arena-fight"]');
  await until(()=>evaluate('!arenaBusy'),10000);assert.equal(await evaluate('state.arena.wins'),1);
  await screenshot('arena-win');const money=await evaluate('state.money');
  await click('#arenaActions [data-action="arena-claim"]');assert.equal(await evaluate('state.arena===null'),true);
  assert.equal(await evaluate('state.money'),money+60);assert.equal(await evaluate('JSON.parse(localStorage.getItem(SAVE_KEY)).money'),money+60);
  await click('#arenaActions [data-action="arena-close"]');
  await click('[data-action="shop-open"]');assert.ok(await evaluate('document.getElementById("shopDialog").open&&document.querySelector("[data-action=buy-monster-pack]").disabled'));
  await screenshot('shop');await click('[data-action="shop-close"]');
  const saved=await evaluate('localStorage.getItem(SAVE_KEY)');
  assert.ok(await until(()=>evaluate('navigator.serviceWorker.controller!==null'),15000));
  assert.ok(await evaluate('caches.keys().then(keys=>keys.some(k=>k.endsWith(":0.11.0")))'));
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await send('Page.reload');await until(()=>evaluate('document.getElementById("titleScreen")&&!document.getElementById("titleScreen").hidden'),15000);
  await click('#enterBtn');await scene('terminal');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem(SAVE_KEY)).gems'),JSON.parse(saved).gems);
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('v0.11 browser smoke passed: four home viewports, horizontal character list, soul grid, full enemy track, pause/abort, boss chest, scatter bounds, arena entry/fight/claim, shop and offline save.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{ws?.close();proc?.kill('SIGTERM');server.close();setTimeout(()=>{try{fs.rmSync(profiles,{recursive:true,force:true})}catch{}},250).unref()});
