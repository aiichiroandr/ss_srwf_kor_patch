import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {makeBase} from './helpers/synthetic-game.mjs';
import {buildPreset,serializePreset,parsePreset} from '../assets/editor-preset.mjs';
const document=installFakeDom();loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
const saved=console.error;console.error=()=>{};const {__testHooks:hooks}=await import('../assets/app.mjs');await new Promise(r=>setTimeout(r,0));console.error=saved;
const $=id=>document.getElementById(id),identity=`critical:1:${'a'.repeat(64)}`;
const rows=enabled=>[{recordIndex:1,name:'크리티컬 보정 오류 수정',enabled,editable:true,identity,original:{enabled}}];
async function open(gameId='srwf-final',enabled=0){
 const {opened:{session,view}}=await makeBase({gameId,units:2});
 Object.assign(hooks.state,{mode:'editor',editorGameId:gameId,editorBaseReleaseId:'synthetic-final-9-c',editorSessionToken:session.sessionToken,editorBusy:false,busy:false});
 const source={...view,criticalFix:{available:true,enabled:enabled===1,identity},criticalFixes:rows(enabled)};
 hooks.installEditorRows(source);return source;
}
const change=enabled=>{$('criticalFixToggle').checked=enabled;$('criticalFixToggle').dispatchEvent({type:'change',target:$('criticalFixToggle')});};
test('critical fix defaults OFF, preserves loaded ON, counts, focuses, exports and resets for F and Final',async()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  const source=await open(gameId);assert.equal($('criticalFixSettings').hidden,false);assert.equal($('criticalFixToggle').checked,false);
  assert.equal($('criticalFixToggle').disabled,false);assert.equal($('criticalFixUnsupported').hidden,true);
  assert.equal($('criticalFixStatus').textContent,'OFF');assert.equal(hooks.buildEditorExportRequest().criticalFix,false);change(true);
  assert.equal(source.criticalFixes[0].enabled,0,'UI owns a copied row');assert.equal(hooks.state.editorChangeCount,1);
  assert.equal($('criticalFixStatus').textContent,'ON');assert.equal(hooks.buildEditorExportRequest().criticalFix,true);
  hooks.editorChanges.open();const button=$('editorChangesList').querySelector('[data-change-kind="critical"]');assert.ok(button);
  button.click();assert.equal(hooks.state.editorTab,'misc');assert.equal(document.activeElement,$('criticalFixToggle'));
  $('criticalFixReset').click();assert.equal($('criticalFixToggle').checked,false);assert.equal(hooks.state.editorChangeCount,0);
  await open(gameId,1);assert.equal($('criticalFixToggle').checked,true);assert.equal($('criticalFixStatus').textContent,'ON');
  change(false);assert.equal(hooks.buildEditorExportRequest().criticalFix,false);assert.equal(hooks.state.editorChangeCount,1);
  $('criticalFixReset').click();assert.equal(hooks.buildEditorExportRequest().criticalFix,true);
  assert.equal(hooks.state.editorCriticalRows[0].identity,identity);assert.equal(hooks.state.editorChangeCount,0);
 }
});
test('ordinary JSON UI roundtrip preserves OFF and the loaded baseline in both directions',async()=>{
 for(const gameId of ['srwf-f','srwf-final'])for(const enabled of [0,1]){
  await open(gameId,enabled);const source=rows(enabled);source[0].enabled=1-enabled;
  const text=serializePreset(buildPreset({gameId},{critical:source}));
  await hooks.editorChanges.loadFile({name:'critical.json',size:text.length,async text(){return text;}});
  hooks.editorChanges.apply('matching');
  assert.equal($('criticalFixToggle').checked,enabled===0);assert.equal(hooks.buildEditorExportRequest().criticalFix,enabled===0);
  const exported=await hooks.editorChanges.save(),entry=parsePreset(JSON.stringify(exported)).entries.critical[0];
  assert.equal(entry.identity,identity);assert.deepEqual(entry.fields,[{field:'enabled',from:enabled,to:1-enabled}]);
  $('criticalFixReset').click();assert.equal(hooks.buildEditorExportRequest().criticalFix,enabled===1);assert.equal(hooks.state.editorChangeCount,0);
 }
});
test('critical card stays visible but cannot change unsupported, unknown-game, busy or read-only rows',async()=>{
 for(const busyField of ['editorBusy','busy']){
  const source=await open();hooks.state[busyField]=true;hooks.installEditorRows(source);
  assert.equal($('criticalFixToggle').disabled,true);assert.equal($('criticalFixReset').disabled,true);
  change(true);$('criticalFixReset').click();assert.equal(hooks.buildEditorExportRequest().criticalFix,false);hooks.state[busyField]=false;
 }
 for(const gameId of ['srwf-f','srwf-final','unknown']){
  await open();hooks.state.editorGameId=gameId;
  hooks.installEditorRows({units:[],pilots:[],weapons:[],gameId,criticalFix:{available:false},criticalFixes:[]});
  assert.equal($('criticalFixSettings').hidden,false);assert.equal($('criticalFixToggle').disabled,true);
  assert.equal($('criticalFixReset').disabled,true);assert.equal($('criticalFixUnsupported').hidden,false);
  assert.equal(Object.hasOwn(hooks.buildEditorExportRequest(),'criticalFix'),false);
  change(true);assert.equal(hooks.state.editorCriticalRows.length,0);assert.equal($('criticalFixToggle').checked,false);
 }
 const source=await open();source.criticalFixes[0].editable=false;hooks.installEditorRows(source);
 assert.equal($('criticalFixToggle').disabled,true);change(true);assert.equal(hooks.buildEditorExportRequest().criticalFix,false);
});
