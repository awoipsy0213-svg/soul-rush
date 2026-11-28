/* Browser-only smoke test, uses installed Chrome/Chromium and Node 22 CDP. No network or external libraries. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process');
const root=path.join(__dirname,'..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const profiles=fs.mkdtempSync(path.join(os.tmpdir(),'soul-rush-chrome-'));
const execs=[process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium','chromium-browser'].filter(Boolean);
const chrome=execs.find(bin=>cp.spawnSync(bin,['--version'],{stdio:'ignore'}).status===0);
if(!chrome)throw Error('Chrome/Chromium executable unavailable');
const server=http.createServer((req,res)=>{try{const name=new URL(req.url,'http://127.0.0.1').pathname;const rel=name==='/'?'index.html':name==='/classic/'?'classic/index.html':name.slice(1);if(!/^(?:(?:classic\/)?index\.html|(?:classic\/)?sw\.js|(?:classic\/)?manifest\.webmanifest|icons\/[a-zA-Z0-9_.-]+|assets\/(?:CREDITS\.html|(?:art|icons|portraits|audio)\/[a-zA-Z0-9_.-]+))$/.test(rel)){res.statusCode=404;return res.end('not found')}const ext=path.extname(rel),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ogg':'audio/ogg'}[ext]||'application/octet-stream';const data=fs.readFileSync(path.join(root,rel));res.setHeader('Content-Type',mime);res.setHeader('Cache-Control','no-store');return res.end(data)}catch{res.statusCode=404;res.end('not found')}});
let proc,ws;
async function until(fn,ms=10000){const end=Date.now()+ms;while(Date.now()<end){let r;try{r=await fn()}catch(e){}if(r)return r;await sleep(60)}throw Error('condition timed out')}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/classic/';
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

  const screen=async(width,height)=>{await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600,screenWidth:width,screenHeight:height});await sleep(80)};
  const navVisible=async()=>assert.ok(await evaluate('(()=>{const n=document.getElementById("classicNav");const r=n.getBoundingClientRect();return !n.hidden&&r.height>=35&&r.bottom<=innerHeight+1})()'));
  for(const [w,h] of [[390,844],[375,667],[320,568],[1280,800]]){
    await screen(w,h);await noOverflow('terminalScene');await navVisible();
    assert.equal(await evaluate('document.querySelectorAll("#heroSockets .socket").length'),5);
    assert.ok(await evaluate('(()=>{const a=document.querySelector(".hero-board").getBoundingClientRect();return [...document.querySelectorAll("#heroSockets .socket")].every(e=>{const r=e.getBoundingClientRect();return r.width>=18&&r.left>=a.left-1&&r.right<=a.right+1&&r.top>=a.top-1&&r.bottom<=a.bottom+1})})()'),'weapon sockets visible');
    await screenshot('classic-home-'+w+'x'+h);
  }
  await screen(390,844);
  await click('#classicNav [data-action="characters"]');await scene('characters');await noOverflow('charactersScene');
  assert.equal(await evaluate('document.querySelectorAll(".character-card").length'),7);
  assert.equal(await evaluate('getComputedStyle(document.getElementById("characters")).gridTemplateColumns.split(" ").length'),2);
  assert.ok(await evaluate('document.getElementById("classicWeaponDetail").hidden'));await screenshot('classic-weapons');
  await click('[data-action="classic-weapon-inspect"][data-id="moss"]');assert.ok(await evaluate('!document.getElementById("classicWeaponDetail").hidden'));await screenshot('classic-weapon-detail');await click('[data-action="classic-weapon-close"]');
  await click('#classicWeaponHeader [data-index="0"][data-action="slot"]');await scene('souls');
  assert.equal(await evaluate('document.querySelectorAll(".soul-tile").length'),33);
  assert.equal(await evaluate('getComputedStyle(document.getElementById("soulGrid")).gridTemplateColumns.split(" ").length'),4);
  assert.equal(await evaluate('document.querySelectorAll(".soul-tile .classic-level").length'),33);assert.equal(await evaluate('document.querySelectorAll(".soul-tile .classic-copies").length'),33);assert.ok(await evaluate('document.querySelectorAll(".classic-equipped").length>=1'));await noOverflow('soulsScene');await screenshot('classic-runes');
  assert.ok(await evaluate('document.getElementById("soulDetail").hidden&&document.getElementById("classicFilterTools").hidden'));await click('[data-action="classic-filter"]');assert.ok(await evaluate('!document.getElementById("classicFilterTools").hidden'));await click('[data-action="classic-filter"]');
  await screen(320,568);await noOverflow('soulsScene');await navVisible();await screenshot('classic-runes-small');
  await click('[data-action="choose-soul"][data-id="might"]');assert.ok(await evaluate('!document.getElementById("soulDetail").hidden'));await noOverflow('soulsScene');await screenshot('classic-rune-detail-small');await click('[data-action="classic-rune-close"]');
  await click('#backBtn');await scene('terminal');
  await evaluate('state.souls.haste=1;state.copies.haste=2;state.money=1000;save();renderHome()');
  await click('#heroSockets [data-index="1"]');await scene('souls');
  await click('[data-action="choose-soul"][data-id="haste"]');await click('[data-action="equip-soul"]');
  assert.ok(await evaluate('state.monsters.moss.equip.includes("haste")&&document.getElementById("soulDetail").hidden'));
  await click('[data-action="choose-soul"][data-id="haste"]');await click('[data-action="upgrade-soul"]');
  assert.equal(await evaluate('state.souls.haste'),2);
  await click('#backBtn');await scene('terminal');
  await click('#classicNav [data-action="classic-helmet"]');assert.ok(await evaluate('document.getElementById("ornamentDialog").open'));await screenshot('classic-helmet');await click('[data-action="ornament-close"]');
  await click('#classicNav [data-action="shop-open"]');assert.equal(await evaluate('document.querySelectorAll("#shopContent .supply-row").length'),9);await screenshot('classic-shop');await click('[data-action="shop-close"]');
  await click('#classicNav [data-action="gift-open"]');assert.ok(await evaluate('document.getElementById("giftDialog").open'));await screenshot('classic-gift');await click('[data-action="gift-close"]');
  await screen(390,844);await click('#classicNav [data-action="start"]');await scene('battle');
  assert.equal(await evaluate('battle.limit'),24);assert.ok(await evaluate('document.querySelector("#classicATKIcon svg")&&document.querySelector("#classicSPDIcon svg")'));assert.equal(await evaluate('getComputedStyle(document.getElementById("traceTrack")).display'),'none');assert.equal(await evaluate('document.getElementById("classicNav").hidden'),true);
  assert.equal(await evaluate('document.querySelectorAll("#classicBattleWeapon .classic-static-socket").length'),5);
  assert.ok(await evaluate('(()=>{const a=document.getElementById("arena").getBoundingClientRect(),b=document.querySelector(".battle-bottom").getBoundingClientRect(),t=document.getElementById("timer").getBoundingClientRect(),l=document.querySelector(".classic-battle-left").getBoundingClientRect(),w=document.getElementById("classicBattleWeapon").getBoundingClientRect();return a.bottom<=b.top+1&&t.top>=a.top&&t.bottom<a.bottom&&l.left<w.left&&a.height/(a.height+b.height)>.40&&a.height/(a.height+b.height)<.48})()'),'reference split composition');
  await evaluate('cancelAnimationFrame(raf);advanceBattle(battle,2);updateBattle();attackEffect(battle)');
  await noOverflow('battleScene');await screenshot('classic-battle');
  await screen(320,568);await noOverflow('battleScene');await screenshot('classic-battle-small');
  await evaluate('cancelAnimationFrame(raf);advanceBattle(battle,battle.limit);updateBattle();settleBattle()');
  await scene('result');assert.ok(await evaluate('resultData.clear'));await noOverflow('resultScene');await screenshot('classic-result-small');await click('#resultActions [data-action="home"]');await scene('terminal');
  for(const n of [10,20,40,60,80,100]){
    await evaluate('state.unlocked=100;state.selectedStage='+n+';capturePreset(state);save();renderHome()');
    await click('#classicNav [data-action="start"]');await scene('battle');await evaluate('cancelAnimationFrame(raf);updateBattle()');
    assert.equal(await evaluate('battle.limit'),n===80?6:24);assert.equal(await evaluate('document.getElementById("bossHud").hidden'),false);await noOverflow('battleScene');await screenshot('classic-boss-'+n);
    await evaluate('stopBattle(battle);settleBattle()');await scene('result');await click('#resultActions [data-action="home"]');await scene('terminal');
  }
  assert.equal(await evaluate('localStorage.getItem("soul_rush_prototype_v9")'),null);
  const saved=await evaluate('localStorage.getItem(SAVE_KEY)');assert.equal(JSON.parse(saved).edition,'classic-reference-v1');
  assert.ok(await until(()=>evaluate('navigator.serviceWorker.controller?.scriptURL.includes("/classic/sw.js")'),15000));

  // Real Chrome demo interaction; preserve all persistent keys byte-for-byte.
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  const store=await evaluate('JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))');
  for(const n of [29,30,20,60]){
    await send('Page.navigate',{url:url+'?demo='+n});await scene('title');await screen(390,844);
    assert.equal(await evaluate('document.getElementById("classicDemoPanel").hidden'),false);
    await noOverflow('titleScreen');if(n===29)await screenshot('classic-demo-menu');
    await click('#enterBtn');await scene('battle');await evaluate('cancelAnimationFrame(raf)');
    assert.equal(await evaluate('battle.stage.n'),n);assert.equal(await evaluate('battle.initialSeed'),123);
    assert.ok(await evaluate('document.querySelector(".rider-weapon")&&document.querySelector(".city-near")&&document.querySelector("#goalMarker svg")'));
    await evaluate('advanceBattle(battle,Math.min(battle.limit,5));updateBattle();attackEffect(battle)');
    await noOverflow('battleScene');await screenshot('classic-demo-'+n+'-battle');
    await evaluate('advanceBattle(battle,battle.limit);updateBattle();settleBattle()');await scene('result');assert.equal(await evaluate('resultData.clear'),true);await screenshot('classic-demo-'+n+'-result');
    assert.equal(await evaluate('JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))'),store);
    await click('[data-action="title"]');await scene('title');
  }
  await send('Page.navigate',{url});await scene('title');await click('#enterBtn');await scene('terminal');
  assert.equal(await evaluate('JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))'),store);

  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await send('Page.reload');await until(()=>evaluate('document.getElementById("titleScreen")&&!document.getElementById("titleScreen").hidden'),15000);
  await click('#enterBtn');await scene('terminal');assert.equal(await evaluate('JSON.parse(localStorage.getItem(SAVE_KEY)).gems'),JSON.parse(saved).gems);
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  assert.equal(errors.length,0,errors.join('\n'));console.log('Classic browser smoke passed: four home viewports, weapon/rune grids, equip/upgrade, helmet, shop, gift, 24-second battle, six boss cases, isolated offline save.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{ws?.close();proc?.kill('SIGTERM');server.close();setTimeout(()=>{try{fs.rmSync(profiles,{recursive:true,force:true})}catch{}},250).unref()});
