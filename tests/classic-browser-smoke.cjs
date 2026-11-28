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
  await click('[data-action="classic-weapon-inspect"][data-id="moss"]');assert.ok(await evaluate('!document.getElementById("classicWeaponDetail").hidden&&document.querySelector("#classicWeaponDetail .classic-compare")'));await screenshot('classic-weapon-detail');await click('[data-action="classic-weapon-close"]');
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
  await click('[data-action="choose-soul"][data-id="haste"]');assert.ok(await evaluate('document.querySelector("#soulDetail .classic-compare .better")'));await screenshot('classic-rune-preview');await click('[data-action="equip-soul"]');
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
  assert.ok(await evaluate('(()=>{const a=document.getElementById("arena").getBoundingClientRect(),b=document.querySelector(".battle-bottom").getBoundingClientRect(),t=document.getElementById("timer").getBoundingClientRect(),l=document.querySelector(".classic-battle-left").getBoundingClientRect(),w=document.getElementById("classicBattleWeapon").getBoundingClientRect();return a.bottom<=b.top+1&&t.top>=a.top&&t.bottom<a.bottom&&l.left<w.left&&a.height/(a.height+b.height)>.38&&a.height/(a.height+b.height)<.46})()'),'reference split composition');
  await evaluate('cancelAnimationFrame(raf);advanceBattle(battle,2);updateBattle();attackEffect(battle)');
  await noOverflow('battleScene');assert.ok(await evaluate('(()=>{const e=document.querySelector(".battle-bottom.panel"),s=getComputedStyle(e);return s.backgroundImage.includes("292b2c")||s.backgroundImage.includes("41, 43, 44")})()'),'dark reference battle panel must override inherited white panel');await screenshot('classic-battle');
  await screen(320,568);await evaluate('updateBattle()');await noOverflow('battleScene');assert.ok(await evaluate('(()=>{const a=document.getElementById("classicBattleWeapon").getBoundingClientRect();return [...document.querySelectorAll("#classicBattleWeapon .classic-static-socket")].every(e=>{const r=e.getBoundingClientRect();return r.left>=a.left-2&&r.right<=a.right+2&&r.top>=a.top-2&&r.bottom<=a.bottom+2})})()'),'resized weapon sockets stay inside viewport');await screenshot('classic-battle-small');
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
    await send('Page.navigate',{url:url+'?demo='+n});await until(()=>evaluate('location.search==='+JSON.stringify('?demo='+n)+'&&document.getElementById("app")?.dataset.scene==="title"&&typeof CLASSIC_DEMO!=="undefined"&&CLASSIC_DEMO'));await screen(390,844);
    assert.equal(await evaluate('document.getElementById("classicDemoPanel").hidden'),false);
    await noOverflow('titleScreen');if(n===29)await screenshot('classic-demo-menu');
    await click('#enterBtn');await scene('battle');await evaluate('cancelAnimationFrame(raf)');
    assert.equal(await evaluate('battle.stage.n'),n);assert.equal(await evaluate('battle.initialSeed'),123);
    assert.ok(await evaluate('document.querySelector(".rider-weapon")&&document.querySelector(".city-near")&&document.querySelector("#goalMarker svg")'));
    await evaluate('advanceBattle(battle,Math.min(battle.limit,5));updateBattle();attackEffect(battle)');
    await noOverflow('battleScene');assert.ok(await evaluate('(()=>{const a=document.getElementById("classicBattleWeapon").getBoundingClientRect();return [...document.querySelectorAll("#classicBattleWeapon .classic-static-socket")].every(e=>{const r=e.getBoundingClientRect();return r.left>=a.left-2&&r.right<=a.right+2&&r.top>=a.top-2&&r.bottom<=a.bottom+2})})()'),'weapon sockets inside viewport');await screenshot('classic-demo-'+n+'-battle');
    await evaluate('advanceBattle(battle,battle.limit);updateBattle();settleBattle()');await scene('result');assert.equal(await evaluate('resultData.clear'),true);await noOverflow('resultScene');await screenshot('classic-demo-'+n+'-result');if(n===29){const before=await evaluate('JSON.stringify(state)');await click('#scatter [data-action="loot-inspect"]');assert.ok(await evaluate('document.getElementById("infoDialog").open&&document.querySelector(".classic-loot-big")'));assert.equal(await evaluate('JSON.stringify(state)'),before);await screenshot('classic-loot-inspect');await click('[data-action="loot-gear"]');await scene('souls');assert.ok(await evaluate('!document.getElementById("soulDetail").hidden'));await screenshot('classic-loot-to-gear');await evaluate('showScene("result")')}if(n===20){assert.equal(await evaluate('document.getElementById("scatter").dataset.grouped'),'1');await screen(320,568);await noOverflow('resultScene');await screenshot('classic-demo-20-result-small');await screen(390,844)}
    assert.equal(await evaluate('JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))'),store);
    await click('[data-action="title"]');await scene('title');
  }

  // Capture a complete real-time browser playthrough, not a synthetic animation.
  if(process.env.RECORD_DEMO==='1'){
    const dir=path.resolve(process.env.DEMO_DIR||'classic-demo-recording'),framesDir=path.join(profiles,'video-frames');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(framesDir,{recursive:true});
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await screen(390,844);
    await send('Page.navigate',{url:url+'?demo=29'});await until(()=>evaluate('location.search==="?demo=29"&&typeof CLASSIC_DEMO!=="undefined"&&CLASSIC_DEMO&&document.getElementById("app")?.dataset.scene==="title"'));
    const frames=[],capture=async()=>{const p=await send('Page.captureScreenshot',{format:'jpeg',quality:92});const file='frame-'+String(frames.length).padStart(5,'0')+'.jpg';fs.writeFileSync(path.join(framesDir,file),Buffer.from(p.data,'base64'));frames.push({file,t:Date.now()})};
    const hold=async ms=>{const end=Date.now()+ms;do{const start=Date.now();await capture();await sleep(Math.max(0,100-(Date.now()-start)))}while(Date.now()<end)};
    await hold(1100);await click('[data-action="demo-preview"]');await scene('terminal');await hold(1600);
    await click('#heroSockets [data-index="0"]');await scene('souls');await hold(1000);
    await click('#classicRuneHeader [data-action="soul-slot"][data-index="0"]');await hold(1600);
    await click('[data-action="classic-rune-close"]');await click('#backBtn');await scene('terminal');await hold(650);
    await click('#startBtn');await scene('battle');
    const deadline=Date.now()+32000;while(await evaluate('scene==="battle"')){await hold(100);assert.ok(Date.now()<deadline,'real-time demonstration exceeded limit')}
    await scene('result');assert.equal(await evaluate('resultData.clear'),true);assert.ok(await evaluate('resultData.elapsed>0&&resultData.elapsed<=24'));await hold(2400);
    assert.ok(frames.length>=80,'enough recorded browser frames');const lines=[];for(let i=0;i<frames.length;i++){lines.push('file '+frames[i].file);lines.push('duration '+(i+1<frames.length?Math.max(.02,(frames[i+1].t-frames[i].t)/1000):.12).toFixed(4))}lines.push('file '+frames.at(-1).file);fs.writeFileSync(path.join(framesDir,'frames.txt'),lines.join('\n')+'\n');
    // Chrome MediaRecorder encodes the real captured frames when FFmpeg is absent.
    const out=path.join(dir,'classic-016-area29.webm');
    await evaluate('window.__demoFrames=[]');
    for(let i=0;i<frames.length;i+=8){const batch=frames.slice(i,i+8).map(f=>({data:fs.readFileSync(path.join(framesDir,f.file)).toString('base64'),t:f.t-frames[0].t}));await evaluate('window.__demoFrames.push(...'+JSON.stringify(batch)+');true')}
    const recording=await send('Runtime.evaluate',{expression:String.raw`(async()=>{const frames=window.__demoFrames;const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;const ctx=canvas.getContext('2d',{alpha:false});const images=await Promise.all(frames.map(f=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='data:image/jpeg;base64,'+f.data})));const stream=canvas.captureStream(24);const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1600000});const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};const done=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=reject});ctx.drawImage(images[0],0,0,390,844);recorder.start();const start=performance.now();for(let i=0;i<frames.length;i++){const delay=frames[i].t-(performance.now()-start);if(delay>0)await new Promise(r=>setTimeout(r,delay));ctx.drawImage(images[i],0,0,390,844)}await new Promise(r=>setTimeout(r,160));recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:mime});window.__demoVideo=new Uint8Array(await blob.arrayBuffer());window.__demoFrames=[];return {size:window.__demoVideo.length,mime}})()`,returnByValue:false,awaitPromise:false,userGesture:true});assert.ok(recording.result.objectId,'recorder promise');
    const encoded=await until(()=>evaluate('window.__demoVideo?.length||0'),90000);const fd=fs.openSync(out,'w');try{for(let offset=0;offset<encoded;offset+=65536){const part=await evaluate('(()=>{const a=window.__demoVideo.subarray('+offset+','+(offset+65536)+');let s="";for(let i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s)})()');fs.writeSync(fd,Buffer.from(part,'base64'))}}finally{fs.closeSync(fd)}await evaluate('delete window.__demoVideo');assert.ok(fs.statSync(out).size>20000);assert.equal(await evaluate('JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))'),store);console.log('Real-time browser demonstration recorded: '+frames.length+' frames; '+fs.statSync(out).size+' bytes; actual AREA29 clear.');
  }

  await send('Page.navigate',{url});await until(()=>evaluate('location.search===""&&document.getElementById("app")?.dataset.scene==="title"&&typeof CLASSIC_DEMO!=="undefined"&&!CLASSIC_DEMO'));assert.equal(await evaluate('JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))'),store);await click('#enterBtn');await scene('terminal');

  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await send('Page.reload');await until(()=>evaluate('document.getElementById("titleScreen")&&!document.getElementById("titleScreen").hidden'),15000);
  await click('#enterBtn');await scene('terminal');assert.equal(await evaluate('JSON.parse(localStorage.getItem(SAVE_KEY)).gems'),JSON.parse(saved).gems);
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  assert.equal(errors.length,0,errors.join('\n'));console.log('Classic browser smoke passed: four home viewports, weapon/rune grids, equip/upgrade, helmet, shop, gift, 24-second battle, six boss cases, isolated offline save.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{ws?.close();proc?.kill('SIGTERM');server.close();setTimeout(()=>{try{fs.rmSync(profiles,{recursive:true,force:true})}catch{}},250).unref()});
