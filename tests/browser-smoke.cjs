/* Browser-only smoke test, uses installed Chrome/Chromium and Node 22 CDP. No network or external libraries. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process');
const root=path.join(__dirname,'..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const profiles=fs.mkdtempSync(path.join(os.tmpdir(),'soul-rush-chrome-'));
const execs=[process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium','chromium-browser'].filter(Boolean);
const chrome=execs.find(bin=>cp.spawnSync(bin,['--version'],{stdio:'ignore'}).status===0);
if(!chrome)throw Error('Chrome/Chromium executable unavailable');
const server=http.createServer((req,res)=>{if(req.url==='/'||req.url==='/index.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fs.readFileSync(path.join(root,'index.html')))}res.statusCode=404;res.end('not found')});
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
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
  const click=async(selector)=>{assert.equal(await evaluate('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el||el.disabled||el.closest("[hidden]"))return false;el.scrollIntoView({block:"nearest"});el.click();return true})()'),true,'missing enabled button '+selector);};
  const scene=async(name)=>until(()=>evaluate('document.getElementById("game").dataset.scene==='+JSON.stringify(name)+'&&!document.getElementById("game").hidden&&!document.getElementById("sceneTransition").hidden===false'));
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setBypassServiceWorker',{bypass:true});
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await send('Page.navigate',{url});await until(()=>evaluate('document.getElementById("titleScreen")&&!document.getElementById("titleScreen").hidden'));
  await click('#enterBtn');await scene('terminal');
  const sizes=[[390,844],[375,600],[320,568],[1280,800]];
  for(const [width,height] of sizes){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await sleep(100);
    const geometry=await evaluate('(()=>{const s=document.querySelector("#terminalScene"),b=document.querySelector("#terminalStage [data-launch-battle]"),r=b.getBoundingClientRect();return {vw:innerWidth,vh:innerHeight,docW:document.documentElement.scrollWidth,docH:document.documentElement.scrollHeight,sceneW:s.clientWidth,scrollW:s.scrollWidth,buttonWidth:r.width,buttonHeight:r.height,theme:getComputedStyle(document.querySelector(".guild-board")).backgroundImage.startsWith("url(")}})()');
    assert.ok(geometry.docW<=geometry.vw+1&&geometry.docH<=geometry.vh+1,'outer page overflow '+JSON.stringify({width,height,geometry}));
    assert.ok(geometry.scrollW<=geometry.sceneW+2,'terminal horizontal overflow '+JSON.stringify({width,height,geometry}));
    assert.ok(geometry.buttonWidth>150&&geometry.buttonHeight>=40,'start button size '+JSON.stringify(geometry));
    assert.equal(geometry.theme,true);
    console.log('viewport',width,height,JSON.stringify(geometry));
    if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});const pic=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(process.env.SCREENSHOT_DIR,'terminal-'+width+'x'+height+'.png'),Buffer.from(pic.data,'base64'))}
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  for(const name of ['stage','build','shop','codex','settings']){
    await click('#terminalScene [data-scene="'+name+'"]');await scene(name);
    const overflow=await evaluate('(()=>{const s=document.getElementById('+JSON.stringify(name+'Scene')+');return s.scrollWidth>s.clientWidth+2})()');
    assert.equal(overflow,false,name+' horizontal overflow');
    await click('#sceneBackBtn');await scene('terminal');
  }
  const initial=await evaluate('JSON.parse(localStorage.getItem("soul_rush_prototype_v2")).money');
  await click('#terminalStage [data-launch-battle]');await scene('battle');
  await until(()=>evaluate('running'));
  await evaluate('advanceBattle(battle,30);finishBattle()');await scene('result');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("soul_rush_prototype_v2")).money'),initial+75);
  assert.ok(await evaluate('document.querySelector("#result").innerText.includes("GUILD REPORT")'));
  await click('#result [data-scene="terminal"]');await scene('terminal');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Guild browser smoke passed: four viewports, five menus, battle, report, persistent reward');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{ws?.close();proc?.kill('SIGTERM');server.close();setTimeout(()=>{try{fs.rmSync(profiles,{recursive:true,force:true})}catch{}},250).unref()});
