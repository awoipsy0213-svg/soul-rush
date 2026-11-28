const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const rows=new Function(src+'\nreturn benchmarkBuilds()')();
process.stdout.write(JSON.stringify(rows,null,2)+'\n');
