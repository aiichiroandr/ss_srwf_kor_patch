import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {makeBase} from './helpers/synthetic-game.mjs';
import {buildPreset,serializePreset,parsePreset} from '../assets/editor-preset.mjs';
const document=installFakeDom();loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
const saved=console.error;console.error=()=>{};const {__testHooks:hooks}=await import('../assets/app.mjs');await new Promise(r=>setTimeout(r,0));console.error=saved;
const $=id=>document.getElementById(id),identity=`debug:1:${'a'.repeat(64)}`;
const rows=enabled=>[{recordIndex:1,name:'디버그 메뉴',enabled,editable:true,identity,original:{enabled}}];
async function open(enabled=0){
 const {opened:{session,view}}=await makeBase({units:2});
 Object.assign(hooks.state,{mode:'editor',editorGameId:'srwf-final',editorBaseReleaseId:'synthetic-final-9-c',editorSessionToken:session.sessionToken,editorBusy:false,busy:false});
 const source={...view,debugEntry:{available:true,enabled:enabled===1,identity},debugEntries:rows(enabled)};
 hooks.installEditorRows(source);return source;
}
const change=enabled=>{$('debugEntry').checked=enabled;$('debugEntry').dispatchEvent({type:'change',target:$('debugEntry')});};
test('Misc debug entry defaults off, exports, counts, focuses and resets to the loaded BIN value',async()=>{
 const source=await open();assert.equal($('debugEntrySettings').hidden,false);assert.equal($('debugEntry').checked,false);
 assert.equal(hooks.buildEditorExportRequest().debugEntry,false);change(true);
 assert.equal(source.debugEntries[0].enabled,0,'UI owns a copied row');assert.equal(hooks.state.editorChangeCount,1);
 assert.equal(hooks.buildEditorExportRequest().debugEntry,true);
 hooks.editorChanges.open();const button=$('editorChangesList').querySelector('[data-change-kind="debug"]');assert.ok(button);
 button.click();assert.equal(hooks.state.editorTab,'misc');assert.equal(document.activeElement,$('debugEntry'));
 $('debugEntryReset').click();assert.equal($('debugEntry').checked,false);assert.equal(hooks.state.editorChangeCount,0);
 await open(1);change(false);$('debugEntryReset').click();assert.equal(hooks.buildEditorExportRequest().debugEntry,true);
 assert.equal(hooks.state.editorDebugRows[0].identity,identity);assert.equal(hooks.state.editorChangeCount,0);
});
test('debug JSON can be loaded and applied by the normal UI without losing the loaded baseline',async()=>{
 await open();const source=rows(0);source[0].enabled=1;
 const text=serializePreset(buildPreset({gameId:'srwf-final'},{debug:source}));
 await hooks.editorChanges.loadFile({name:'debug.json',size:text.length,async text(){return text;}});
 hooks.editorChanges.apply('matching');
 assert.equal($('debugEntry').checked,true);assert.equal(hooks.buildEditorExportRequest().debugEntry,true);
 const exported=await hooks.editorChanges.save();assert.equal(parsePreset(JSON.stringify(exported)).entries.debug[0].identity,identity);
 $('debugEntryReset').click();assert.equal(hooks.buildEditorExportRequest().debugEntry,false);
});
test('unsupported images hide debug, omit the export key and cannot change rows while busy',async()=>{
 await open();hooks.state.editorBusy=true;change(true);assert.equal(hooks.buildEditorExportRequest().debugEntry,false);
 hooks.state.editorBusy=false;
 for(const gameId of ['srwf-f','srwf-final']){
  const {opened:{view}}=await makeBase({gameId,units:2});hooks.state.editorGameId=gameId;
  hooks.installEditorRows({...view,debugEntry:{available:false},debugEntries:[]});
  assert.equal($('debugEntrySettings').hidden,true);assert.equal(Object.hasOwn(hooks.buildEditorExportRequest(),'debugEntry'),false);
  change(true);assert.equal(hooks.state.editorDebugRows.length,0);assert.equal($('debugEntry').checked,false);
 }
});
