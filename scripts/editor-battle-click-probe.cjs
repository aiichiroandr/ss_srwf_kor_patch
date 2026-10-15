// Local-only bounded actual UI audit. Never copies the supplied disc.
const fs=require('node:fs'),path=require('node:path');
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return [arg.slice(0,i),arg.slice(i+1)];}));
if(!args['--bin']||!args['--out']||!['srwf-f','srwf-final'].includes(args['--game']))throw Error('Usage: --bin=/owned/image.bin --out=/tmp/report --game=srwf-f [--limit=2000] [--playwright=/path] [--browser=/path] [--url=http://127.0.0.1:8844/]');
const limit=Number(args['--limit']||2000);if(!Number.isInteger(limit)||limit<1||limit>2000)throw Error('Invalid bounded weapon limit');
const {chromium}=require(args['--playwright']||'playwright');
const out=path.resolve(args['--out']);if(fs.existsSync(path.join(out,'report.json')))throw Error('Use a fresh report directory');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,...(args['--browser']?{executablePath:args['--browser']}:{})});
 const report={errors:[],games:[],scope:'Actual editor attack gallery clicks; not native battle timing verification',limit};
 try{for(const [game,file] of [[args['--game'].replace('srwf-',''),args['--bin']]]){
  console.log('load',game);const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push({game,message:e.message}));
  await page.goto(args['--url']||'http://127.0.0.1:8844/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.getElementById('releaseState').textContent==='ACCEPTED');
  await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.hidden=true;input.id='qaDisc';document.body.append(input);});
  await page.locator('#qaDisc').setInputFiles(path.resolve(file));
  await page.evaluate(()=>{window.showDirectoryPicker=async()=>({kind:'directory',name:'검수',async*values(){const file=document.getElementById('qaDisc').files[0];yield{kind:'file',name:file.name,async getFile(){return file;}};}});});
  await page.locator('#editorSourceButton').click();await page.waitForFunction(()=>!document.getElementById('workflowOpenEditor').disabled,null,{timeout:120000});await page.locator('#workflowOpenEditor').click();await page.locator('#editorWorkspace').waitFor({state:'visible',timeout:120000});await page.locator('#weaponTabButton').click();
  let group=report.games.find(g=>g.game===game);if(!group){group={game,rows:[]};report.games.push(group);}const rows=group.rows;const completed=new Set(rows.map(r=>r.index));
  if(args['--include-unused']==='1')await page.locator('#unusedToggle').check();
  const indices=await page.locator('#weaponRecordList [data-record-index]').evaluateAll(rows=>rows.map(r=>Number(r.dataset.recordIndex)));console.log('records',game,indices.length);
  group.availableWeaponRows=indices.length;group.attemptedWeapons=[];
  for(const index of indices.filter(i=>!completed.has(i)).slice(0,limit)){
   if(rows.length%25===0)console.log('progress',game,rows.length,index);const row=page.locator('#weapon-option-'+index);if(!await row.isVisible()){const list=page.locator('#weaponEditorPanel [data-editor-page="list"]');if(await list.isVisible())await list.click();}await row.click();
   const main=page.locator('#weaponEditorPanel [data-editor-page="main"]');if(await main.isVisible())await main.click();
   await page.waitForFunction(()=>{const p=document.querySelector('.battle-preview');return p&&p.getAttribute('aria-busy')!=='true'&&p.dataset.status!=='loading';},{},{timeout:60000});
   const owners=await page.locator('.battle-preview-owner').evaluate(n=>[...n.options].map(o=>({value:o.value,label:o.textContent})));
   if(!owners.length){
    const empty=await page.locator('.battle-preview').evaluate(p=>({hidden:p.hidden,status:p.dataset.status,canvases:p.querySelectorAll('canvas').length}));
    rows.push({index,owner:null,status:empty.status,assetKeys:[],rendered:[],emptyState:empty});
    if(empty.canvases!==0||!['idle','unmapped'].includes(empty.status))throw Error('Unowned weapon retained rendered assets');
   }
   for(const owner of owners){
    if(await page.locator('.battle-preview-owner').isVisible()&&!await page.locator('.battle-preview-owner').isDisabled())await page.locator('.battle-preview-owner').selectOption(owner.value);
    await page.waitForFunction(()=>document.querySelector('.battle-preview')?.getAttribute('aria-busy')!=='true',null,{timeout:60000});
    const result=await page.locator('.battle-preview').evaluate(p=>({status:p.dataset.status,text:p.innerText,assetKeys:[...p.querySelector('.battle-preview-assets').options].map(o=>o.value),canvases:[...p.querySelectorAll('canvas')].map(c=>({w:c.width,h:c.height})),height:p.querySelector('.battle-preview-gallery').getBoundingClientRect().height}));
    const rendered=[];
    if(result.status==='ready')for(const key of result.assetKeys.filter(k=>k!=='all')){
     if(await page.locator('.battle-preview-assets').isVisible())await page.locator('.battle-preview-assets').selectOption(key);
     else if(result.assetKeys.filter(k=>k!=='all').length!==1)throw Error('Multiple ready assets have no visible selection control');
     rendered.push(await page.locator('.battle-preview canvas').first().evaluate(async(c,key)=>{
      const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))).map(n=>n.toString(16).padStart(2,'0')).join('');
      return {key,width:c.width,height:c.height,sha256:hash,stageHeight:c.closest('.battle-preview-gallery').getBoundingClientRect().height};
     },key));
    }
    rows.push({index,owner,status:result.status,assetKeys:result.status==='ready'?result.assetKeys:[],rendered});
    if(rows.length%25===0)fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
   }
   group.attemptedWeapons.push(index);if(args['--screenshots']==='1'&&[1,2,51,245].includes(index))await page.locator('#editorWorkspace').screenshot({path:path.join(out,`${game}-${index}.png`)});
  }
  await page.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 }}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
 report.complete=true;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log('complete',report.games.map(g=>({game:g.game,rows:g.rows.length})),report.errors);
})().catch(e=>{console.error(e);process.exitCode=1;});
