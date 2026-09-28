// Local end-to-end harness: real files/worker/patch/download; only OS picker is supplied by fixture.
const {chromium}=require(process.env.PLAYWRIGHT_PATH || '/Users/garlicb/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out='/private/tmp/srwf-g103-r116-browser';
async function hash(p){const h=crypto.createHash('sha256');for await(const c of fs.createReadStream(p))h.update(c);return h.digest('hex')}
(async()=>{
 await fsp.mkdir(out,{recursive:true});const browser=await chromium.launch({executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:true});
 const report=[];
 try{
 for(const game of ['srwf-f','srwf-final'])for(const lane of 'abc'){
  const version=game==='srwf-f'?'v0-5':'v0-2',id=`${game}-20260928-${version}-${lane}`;
  const manifest=JSON.parse(await fsp.readFile(path.join(root,'releases',id+'.json'),'utf8'));
  const context=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 Android Mobile LocalReleaseVerification',acceptDownloads:true});
  await context.addInitScript(()=>{
   window.showDirectoryPicker=async()=>{
    const file=document.querySelector('#verification-file').files[0];
    const handle={kind:'file',name:file.name,getFile:async()=>file};
    return {kind:'directory',name:'Local verification source',async *entries(){yield [file.name,handle]},getFileHandle:async()=>handle};
   };
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8792',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!document.querySelector('#gameSelect').disabled);
  await page.selectOption('#gameSelect',game);await page.waitForFunction(()=>!document.querySelector('#fontSelect').disabled);
  await page.selectOption('#fontSelect',lane);
  await page.waitForFunction(n=>document.querySelector('#targetName').textContent===n,manifest.target.filename);
  if(await page.locator('#releaseSelect').isDisabled())throw Error('Version selector disabled');
  await page.locator('#patchNotesToggle').click();
  if(await page.locator('.patch-note-bgm-table').count()!==2)throw Error('Missing BGM tables');
  if(!(await page.locator('#patchNotesSummary').innerText()).includes('버튼 + START'))throw Error('Missing shortcut');
  await page.screenshot({path:path.join(out,id+'-notes.png')});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error('Horizontal page overflow');
  await page.locator('#patchNotesClose').click();
  await page.evaluate(()=>{const e=document.createElement('input');e.type='file';e.id='verification-file';e.hidden=true;document.body.append(e)});
  await page.locator('#verification-file').setInputFiles(game==='srwf-f'?'/Users/garlicb/Documents/srwf_runtime/rom/mod/stock.img':'/private/tmp/srwf-g103-r116-public-export/fin-stock.img');
  await page.locator('#sourceButton').click();await page.waitForFunction(()=>!document.querySelector('#patchButton').disabled);
  console.log(id,'source selected; applying',new Date().toISOString());
  await page.locator('#patchButton').click();
  await page.waitForFunction(()=>!document.querySelector('#downloadActions').hidden||!document.querySelector('#errorPanel').hidden,{},{timeout:600000});
  if(await page.locator('#errorPanel').isVisible())throw Error(await page.locator('#errorPanel').innerText());
  for(const kind of ['Bin','Cue']){
   const wait=page.waitForEvent('download',{timeout:600000});await page.locator('#download'+kind+'Link').click();const download=await wait;
   const file=path.join(out,download.suggestedFilename());await download.saveAs(file);
   if(kind==='Bin'){if(await hash(file)!==manifest.target.sha256)throw Error('Downloaded BIN hash mismatch');if((await fsp.stat(file)).size!==manifest.target.size)throw Error('BIN size mismatch');await fsp.unlink(file)}
   else{const cue=await fsp.readFile(file,'utf8');if(!cue.includes(manifest.target.filename))throw Error('CUE filename mismatch');if((cue.match(/TRACK /g)||[]).length!==(game==='srwf-f'?4:3))throw Error('CUE tracks mismatch');await fsp.unlink(file)}
   await download.delete();
  }
  await page.screenshot({path:path.join(out,id+'-complete.png')});
  if(errors.length)throw Error(errors.join('\n'));
  report.push({id,sourceSelection:'PASS',patchWorker:'PASS',binDownloadSha256:manifest.target.sha256,cueDownload:'PASS',mobileNotes:'PASS'});
  await fsp.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(id,'PASS',new Date().toISOString());await context.close();
 }
 const p=await browser.newPage({viewport:{width:1440,height:1000}});await p.goto('http://127.0.0.1:8792');await p.waitForFunction(()=>!document.querySelector('#gameSelect').disabled);await p.screenshot({path:path.join(out,'desktop.png')});
 console.log('SIX RELEASE DOWNLOADS PASS');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
