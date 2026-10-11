#!/usr/bin/env node
// Local-only smoke/capture probe. Never copies the supplied BIN into its report.
const fs = require('node:fs');
const path = require('node:path');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i=arg.indexOf('='); return [arg.slice(0,i),arg.slice(i+1)]; }));
if (!args['--bin'] || !args['--out']) throw Error('Usage: node scripts/editor-probe.cjs --bin=/absolute/file.bin --out=/tmp/captures [--game=srwf-f] [--playwright=/path/to/playwright] [--browser=/path/to/browser] [--url=http://127.0.0.1:8000/]');
const {chromium} = require(args['--playwright'] || 'playwright');
const out=path.resolve(args['--out']); fs.mkdirSync(out,{recursive:true});
const report={game:args['--game']||'srwf-f', errors:[], screens:[]};
const stage=s=>console.log(new Date().toISOString(),s);
(async()=>{
 stage('launch');
 const browser=await chromium.launch({headless:true,...(args['--browser']?{executablePath:args['--browser']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}); page.setDefaultTimeout(30000);
 page.on('pageerror',e=>report.errors.push(e.message));
 try {
  stage('open'); await page.goto(args['--url']||'http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.querySelector('#gameSelect')?.disabled,null,{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#releaseState')?.textContent==='ACCEPTED');
  // The page opens folders, not files. Hand it a one-file folder built from the BIN supplied on the command line.
  await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.hidden=true;input.id='probeBinInput';document.body.append(input);});
  await page.locator('#probeBinInput').setInputFiles(args['--bin']);
  await page.evaluate(()=>{const input=document.getElementById('probeBinInput');window.showDirectoryPicker=async()=>({kind:'directory',name:'probe',async*values(){const file=input.files[0];yield {kind:'file',name:file.name,async getFile(){return file;}};}});});

  stage('load and verify real BIN'); await page.locator('#editorSourceButton').click();
  await page.waitForFunction(()=>!document.getElementById('workflowOpenEditor').disabled,null,{timeout:120000});
  await page.locator('#workflowOpenEditor').click();
  await page.locator('#editorWorkspace').waitFor({state:'visible',timeout:120000});
  report.loadedStatus=await page.locator('#editorState').innerText();
  await page.evaluate(()=>document.fonts.ready);
  for (const width of [1440,390,433]) {
   await page.setViewportSize({width,height:width===1440?1000:844});
   for(const type of ['unit','pilot','weapon']) {
    stage(`${width} ${type}`); await page.locator(`#${type}TabButton`).click();
    if(type==='pilot' && width===1440) {
     await page.locator('#pilotSearch').fill('세실리');
     if (!(await page.locator('#pilotRecordList [data-record-index]:visible').count())) await page.locator('#pilotSearch').fill('');
     const option=page.locator('#pilotRecordList [data-record-index]:visible').first();
     if(await option.count()) await option.click();
    }
    if(type !== 'weapon') {
     await page.waitForFunction(type => !document.getElementById(`${type}PreviewCaption`)?.textContent.includes('이미지 불러오는 중'), type, {timeout:30000});
    }
    const root=page.locator('.editor-data-panel:not([hidden]) .editor-game-screen');
    await root.screenshot({path:path.join(out,`${report.game}-${width}-${type}.png`)});
    report.screens.push(await root.evaluate((el,{width,type})=>{const r=el.getBoundingClientRect();return {width,type,screen:{x:r.x,y:r.y,w:r.width,h:r.height},pageOverflow:document.documentElement.scrollWidth>innerWidth,fields:[...el.querySelectorAll('input[data-editor-field]')].map(i=>({key:i.dataset.editorField,value:i.value,width:i.getBoundingClientRect().width})),text:el.innerText};},{width,type}));
   }
  }
  report.previewReturn=[];
  for(const type of ['unit','pilot']) {
   await page.locator(`#${type}TabButton`).click();
   await page.waitForFunction(type => !document.getElementById(`${type}PreviewCaption`)?.textContent.includes('이미지 불러오는 중'), type);
   for(let pass=0;pass<3;pass++) {
    await page.locator(`#${type}EditorPanel [data-editor-page="list"]`).click();
    await page.locator(`#${type}EditorPanel [data-editor-page="main"]`).click();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const check=await page.locator(`#${type}PreviewImage`).evaluate(image=>({hidden:image.hidden,width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height}));
    report.previewReturn.push({type,pass,...check});
    if(check.hidden||check.width<=0||check.height<=0)throw Error(`${type} preview disappeared after returning from list`);
   }
  }
  await page.locator('#unitTabButton').click();
  // Repeated labels must not send a later ability page back to the first one.
  await page.setViewportSize({width:740,height:360});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  report.pageRetention=[];
  const pageKeys=await page.locator('#unitEditorPanel [data-editor-page]').evaluateAll(buttons=>buttons.map(button=>button.dataset.editorPage).filter(key=>key!=='list'));
  for(const key of pageKeys) {
   await page.locator(`#unitEditorPanel [data-editor-page="${key}"]`).click();
   await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const check=await page.locator('#unitEditorPanel').evaluate(panel=>({page:panel.dataset.page,focus:document.activeElement?.dataset.editorPage}));
   report.pageRetention.push({expected:key,...check});
   if(check.page!==key||check.focus!==key)throw Error('layout recalculation lost selected page or keyboard focus');
  }
  await page.setViewportSize({width:433,height:844});
  await page.locator('#unitEditorPanel [data-editor-page="main"]').click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const hp=page.locator('[data-editor-field="hp"]'); const before=await hp.inputValue();
  await hp.fill(String(Number(before)+1));
  report.edit={before,after:await hp.inputValue(),modified:await hp.evaluate(e=>e.classList.contains('is-modified')),focus:await hp.evaluate(e=>document.activeElement===e)};
  await page.locator('[data-editor-reset-field="hp"]').click(); report.edit.restored=await hp.inputValue();
  if(!report.edit.modified||!report.edit.focus||report.edit.restored!==before) throw Error('edit/reset regression');
  stage('complete');
 } catch(e) {report.failure=e.message; report.status=await page.locator('#editorState').textContent().catch(()=>null);await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});throw e;}
 finally {fs.writeFileSync(path.join(out,`${report.game}-report.json`),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
