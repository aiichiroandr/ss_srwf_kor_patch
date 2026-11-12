#!/usr/bin/env node
// Local-only smoke/capture probe. Never copies the supplied BIN into its report.
const fs = require('node:fs');
const path = require('node:path');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i=arg.indexOf('='); return [arg.slice(0,i),arg.slice(i+1)]; }));
if (!args['--bin'] || !args['--out']) throw Error('Usage: node scripts/editor-probe.cjs --bin=/absolute/file.bin --out=/tmp/captures [--game=srwf-f] [--playwright=/path/to/playwright] [--browser=/path/to/browser] [--url=http://127.0.0.1:8000/]');
const game=args['--game']||'srwf-f';
if(!['srwf-f','srwf-final'].includes(game))throw Error(`지원하지 않는 게임입니다: ${game}`);
const bin=path.resolve(args['--bin']);
let binStat;try{binStat=fs.statSync(bin);}catch{throw Error(`BIN을 찾을 수 없습니다: ${bin}`);}
if(!binStat.isFile()||binStat.size<=0)throw Error(`비어 있거나 일반 파일이 아닌 BIN입니다: ${bin}`);
const {chromium} = require(args['--playwright'] || 'playwright');
const out=path.resolve(args['--out']); fs.mkdirSync(out,{recursive:true});
const report={game, errors:[], screens:[]};
const stage=s=>console.log(new Date().toISOString(),s);
async function waitForPagePredicate(page,predicate,{timeout=30000,interval=100,argument}={}){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){if(await page.evaluate(predicate,argument))return;await new Promise(resolve=>setTimeout(resolve,interval));}
 throw Error(`페이지 조건을 ${timeout}ms 안에 확인하지 못했습니다.`);
}
(async()=>{
 stage('launch');
 const browser=await chromium.launch({headless:true,...(args['--browser']?{executablePath:args['--browser']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}); page.setDefaultTimeout(30000);
 page.on('pageerror',e=>report.errors.push(e.message));
 try {
  stage('open'); await page.goto(args['--url']||'http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
  await waitForPagePredicate(page,game=>{const select=document.querySelector('#gameSelect');return !select?.disabled&&[...select.options].some(option=>option.value===game);},{timeout:60000,argument:game});
  await page.evaluate(game=>{const select=document.querySelector('#gameSelect');select.value=game;select.dispatchEvent(new Event('change',{bubbles:true}));},game);
  await waitForPagePredicate(page,game=>document.querySelector('#gameSelect')?.value===game,{argument:game});
  await waitForPagePredicate(page,()=>document.querySelector('#releaseState')?.textContent==='ACCEPTED');
  await waitForPagePredicate(page,game=>document.querySelector('#gameSelect')?.value===game,{argument:game});
  // The page opens folders, not files. Hand it a one-file folder built from the BIN supplied on the command line.
  await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.hidden=true;input.id='probeBinInput';document.body.append(input);});
  await page.locator('#probeBinInput').setInputFiles(bin);
  await page.evaluate(()=>{const input=document.getElementById('probeBinInput');window.showDirectoryPicker=async()=>{const file=input.files[0],entry={kind:'file',name:file.name,async getFile(){return file;}};return {kind:'directory',name:'probe',async*entries(){yield [entry.name,entry];},async*values(){yield entry;}};};});

  stage('load and verify real BIN'); await page.locator('#editorSourceButton').click();
  await waitForPagePredicate(page,()=>!document.getElementById('workflowOpenEditor').disabled,{timeout:120000});
  await page.locator('#workflowOpenEditor').click();
   const editorNotice=page.locator('dialog.editor-notice[open]');
   await editorNotice.waitFor({state:'visible',timeout:30000});
   report.editorNotice=await editorNotice.locator('#editorNoticeText').innerText();
   await editorNotice.locator('button.is-primary').click();
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
     await waitForPagePredicate(page,type=>!document.getElementById(`${type}PreviewCaption`)?.textContent.includes('이미지 불러오는 중'),{timeout:30000,interval:100,argument:type});
    }
    const root=page.locator('.editor-data-panel:not([hidden]) .editor-game-screen');
    await root.screenshot({path:path.join(out,`${report.game}-${width}-${type}.png`)});
    report.screens.push(await root.evaluate((el,{width,type})=>{const r=el.getBoundingClientRect();return {width,type,screen:{x:r.x,y:r.y,w:r.width,h:r.height},pageOverflow:document.documentElement.scrollWidth>innerWidth,fields:[...el.querySelectorAll('input[data-editor-field]')].map(i=>({key:i.dataset.editorField,value:i.value,width:i.getBoundingClientRect().width})),text:el.innerText};},{width,type}));
   }
  }
  report.previewReturn=[];
  for(const type of ['unit','pilot']) {
   await page.locator(`#${type}TabButton`).click();
   await waitForPagePredicate(page,type=>!document.getElementById(`${type}PreviewCaption`)?.textContent.includes('이미지 불러오는 중'),{argument:type});
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