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
  await page.locator('#gameSelect').selectOption(report.game);
  await page.waitForFunction(()=>!document.querySelector('#editorImageInput')?.disabled);
  stage('load and verify real BIN'); await page.locator('#editorImageInput').setInputFiles(args['--bin']);
  await page.locator('#editorWorkspace').waitFor({state:'visible',timeout:120000});
  report.loadedStatus=await page.locator('#editorState').innerText();
  await page.evaluate(()=>document.fonts.ready);
  for (const width of [1440,390,433]) {
   await page.setViewportSize({width,height:width===1440?1000:844});
   for(const type of ['unit','pilot','weapon']) {
    stage(`${width} ${type}`); await page.locator(`#${type}TabButton`).click();
    if(type==='pilot') {
     await page.locator('#pilotSearch').fill('세실리');
     if((await page.locator('#pilotSelect').innerText()).includes('검색 결과 없음') || !(await page.locator('#pilotSelect option[value]').count())) await page.locator('#pilotSearch').fill('');
     const options=await page.locator('#pilotSelect option').evaluateAll(xs=>xs.map(x=>({value:x.value,text:x.textContent})));
     if(options.length>1) await page.locator('#pilotSelect').selectOption(options.find(x=>x.value==='1')?.value||options[0].value);
    }
    const root=page.locator('.editor-data-panel:not([hidden]) .editor-game-screen');
    await root.screenshot({path:path.join(out,`${report.game}-${width}-${type}.png`)});
    report.screens.push(await root.evaluate((el,{width,type})=>{const r=el.getBoundingClientRect();return {width,type,screen:{x:r.x,y:r.y,w:r.width,h:r.height},pageOverflow:document.documentElement.scrollWidth>innerWidth,fields:[...el.querySelectorAll('input[data-editor-field]')].map(i=>({key:i.dataset.editorField,value:i.value,width:i.getBoundingClientRect().width})),text:el.innerText};},{width,type}));
   }
  }
  await page.locator('#unitTabButton').click();
  const hp=page.locator('[data-editor-field="hp"]'); const before=await hp.inputValue();
  await hp.fill(String(Number(before)+1));
  report.edit={before,after:await hp.inputValue(),modified:await hp.evaluate(e=>e.classList.contains('is-modified')),focus:await hp.evaluate(e=>document.activeElement===e)};
  await page.locator('[data-editor-reset-field="hp"]').click(); report.edit.restored=await hp.inputValue();
  if(!report.edit.modified||!report.edit.focus||report.edit.restored!==before) throw Error('edit/reset regression');
  stage('complete');
 } catch(e) {report.failure=e.message; report.status=await page.locator('#editorState').textContent().catch(()=>null);await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});throw e;}
 finally {fs.writeFileSync(path.join(out,`${report.game}-report.json`),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
