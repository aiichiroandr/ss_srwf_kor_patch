import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {makeBase} from './helpers/synthetic-game.mjs';
import {buildPreset,serializePreset,parsePreset} from '../assets/editor-preset.mjs';
import {exSBeamCloneIds} from '../assets/editor-exs-beam-ui.mjs';
const document=installFakeDom();loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
const saved=console.error;console.error=()=>{};const {__testHooks:h}=await import('../assets/app.mjs');await new Promise(r=>setTimeout(r,0));console.error=saved;
const $=id=>document.getElementById(id),identity=`beam:1:${'a'.repeat(64)}`;
const rows=enabled=>[{recordIndex:1,name:'Ex-S 빔포 연출 보정',enabled,editable:true,identity,original:{enabled}}];
async function open(gameId='srwf-final',enabled=0,{fresh=false,eligible=true,supported=true}={}){
 const {opened:{session,view}}=await makeBase({gameId,units:2});
 const units=structuredClone(view.units),weapons=structuredClone(view.weapons);
 if(eligible){units[1].construction={preset:'ex-s-gundam',loadoutVersion:2};units[1].weaponList={status:'known',placeholder:false,entries:[{weaponIndex:2,slot:1,ammoSlot:0,raw:[0,2,0,0]}]};weapons.find(w=>w.recordIndex===2).weaponClone={recordIndex:2,sourceRecordIndex:511};if(fresh)weapons.find(w=>w.recordIndex===2).pendingWeaponClone=511;}
 Object.assign(h.state,{mode:'editor',editorGameId:gameId,editorBaseReleaseId:'synthetic-final-9-c',editorSessionToken:session.sessionToken,editorBusy:false,busy:false});
 const source={...view,units,weapons,exsBeamPose:{supported,available:eligible&&supported,enabled:enabled===1},exsBeamPoses:rows(enabled)};
 h.installEditorRows(source);return source;
}
const change=enabled=>{$('exsBeamPoseToggle').checked=enabled;$('exsBeamPoseToggle').dispatchEvent({type:'change',target:$('exsBeamPoseToggle')});};
test('loaded pose option keeps OFF/ON, changes count, request, focus and reset in both games',async()=>{
 for(const gameId of ['srwf-f','srwf-final'])for(const enabled of [0,1]){
  const source=await open(gameId,enabled);assert.equal($('exsBeamPoseToggle').disabled,false);assert.equal($('exsBeamPoseToggle').checked,enabled===1);assert.equal(h.buildEditorExportRequest().exsBeamPose,enabled===1);
  change(enabled===0);assert.equal(source.exsBeamPoses[0].enabled,enabled);assert.equal(h.state.editorChangeCount,1);assert.equal(h.buildEditorExportRequest().exsBeamPose,enabled===0);
  h.editorChanges.open();const button=$('editorChangesList').querySelector('[data-change-kind="beam"]');assert.ok(button);button.click();assert.equal(h.state.editorTab,'misc');assert.equal($('exsBeamPoseSettings').hidden,true);assert.equal(document.activeElement?.id,'srw4SourceOpen');
  $('exsBeamPoseReset').click();assert.equal(h.buildEditorExportRequest().exsBeamPose,enabled===1);assert.equal(h.state.editorChangeCount,0);
 }
});
test('JSON options preserve an explicit OFF and the loaded reset baseline',async()=>{
 for(const enabled of [0,1]){
  await open('srwf-final',enabled);const source=rows(enabled);source[0].enabled=1-enabled;const text=serializePreset(buildPreset({gameId:'srwf-final'},{beam:source}));
  await h.editorChanges.loadFile({name:'pose.json',size:text.length,async text(){return text;}});h.editorChanges.apply('matching');assert.equal(h.buildEditorExportRequest().exsBeamPose,enabled===0);
  const saved=await h.editorChanges.save();assert.equal(parsePreset(JSON.stringify(saved)).entries.beam[0].identity,identity);$('exsBeamPoseReset').click();assert.equal(h.state.editorChangeCount,0);
 }
});
test('fresh owned cannon defaults ON once and respects explicit OFF and reset',async()=>{
 await open('srwf-final',0,{fresh:true});assert.equal(h.buildEditorExportRequest().exsBeamPose,true);change(false);h.refreshEditorAfterPreset();assert.equal(h.buildEditorExportRequest().exsBeamPose,false);
 const preset=buildPreset({gameId:'srwf-final'},{beam:h.state.editorBeamRows});assert.deepEqual(preset.exsBeamPoses[0].fields.enabled,{from:1,to:0},'Explicit OFF travels with a pending unit construction');
 $('exsBeamPoseReset').click();assert.equal(h.buildEditorExportRequest().exsBeamPose,false);
 delete h.state.editorUnits[1].construction;h.refreshEditorAfterPreset();assert.equal($('exsBeamPoseToggle').disabled,true);assert.equal(Object.hasOwn(h.buildEditorExportRequest(),'exsBeamPose'),false);assert.equal(h.state.editorBeamRows[0].enabled,0);
});
test('unsupported, unowned and busy controls cannot change the bundle',async()=>{
 for(const options of [{eligible:false},{supported:false}]){await open('srwf-final',0,options);assert.equal($('exsBeamPoseToggle').disabled,true);change(true);assert.equal(Object.hasOwn(h.buildEditorExportRequest(),'exsBeamPose'),false);}
 await open();h.state.editorBusy=true;h.refreshEditorAfterPreset();assert.equal($('exsBeamPoseToggle').disabled,true);change(true);assert.equal(h.buildEditorExportRequest().exsBeamPose,false);h.state.editorBusy=false;
 assert.deepEqual(exSBeamCloneIds([{construction:{preset:'g-cruiser'},weaponList:{entries:[{weaponIndex:2}]}}],[{recordIndex:2,weaponClone:{sourceRecordIndex:511}}]),[]);
 assert.deepEqual(exSBeamCloneIds([{construction:{preset:'ex-s-gundam'},weaponList:{entries:[{weaponIndex:2}]}},{weaponList:{entries:[{weaponIndex:2}]}}],[{recordIndex:2,weaponClone:{sourceRecordIndex:511}}]),[],'A cannon shared with another unit is not eligible');
});
test('pending Ex-S JSON can reconstruct its prerequisites and preserve explicit OFF',async()=>{
 const [{createEditorInspector},{constructionGame},{descriptorFor,trustFor},{buildDisc,packGreedy}]=await Promise.all([
  import('../assets/editor-core.mjs'),import('./helpers/synthetic-construction.mjs'),import('./helpers/synthetic-game.mjs'),import('./helpers/synthetic-iso.mjs')]);
 for(const gameId of ['srwf-f','srwf-final']){
  const disc=buildDisc({slot:packGreedy(constructionGame(gameId,{clones:true})),product:gameId==='srwf-f'?'20610G':'20612G'}),inspector=createEditorInspector(trustFor(disc,[],gameId)),opened=await inspector.inspectPatchedImage(disc.blob,descriptorFor(disc,{gameId}));
  const view={...opened.view,exsBeamPose:{supported:true,available:false,enabled:false},exsBeamPoses:[{...rows(0)[0],editable:false}]};
  const install=()=>{Object.assign(h.state,{mode:'editor',editorGameId:gameId,editorBaseReleaseId:'synthetic-final-9-c',editorSessionToken:opened.session.sessionToken,editorBusy:false,busy:false});h.installEditorRows(view);};
  install();$('unitConstructionChoice').value='ex-s-gundam';h.changeUnitConstruction();assert.equal(h.buildEditorExportRequest().exsBeamPose,true);change(false);
  const preset=await h.editorChanges.save(),text=serializePreset(preset);parsePreset(text);assert.deepEqual(preset.exsBeamPoses[0].fields.enabled,{from:1,to:0});
  install();const loaded=await h.editorChanges.loadFile({name:'new-exs.json',size:text.length,async text(){return text;}});assert.equal(loaded,true,$('editorChangesMessage').textContent);h.editorChanges.apply('matching');
  assert.equal(h.state.editorUnits.filter(u=>u.construction?.preset==='ex-s-gundam').length,1);assert.equal(h.buildEditorExportRequest().exsBeamPose,false);assert.equal($('exsBeamPoseToggle').disabled,false);
 }
});

test('removing a loaded ON cannon turns the bundle OFF and keeps BIN export possible',async()=>{
 await open('srwf-final',1);h.state.editorUnits[1].weapon1=1;h.refreshEditorAfterPreset();
 assert.equal($('exsBeamPoseToggle').checked,false);assert.equal(h.buildEditorExportRequest().exsBeamPose,false);assert.equal($('exsBeamPoseReset').disabled,true);
 assert.match($('exsBeamPoseUnsupported').textContent,/OFF로 저장/);assert.ok(h.countEditorChanges()>0);
 change(true);assert.equal(h.buildEditorExportRequest().exsBeamPose,false,'An unowned cannon cannot be enabled');$('exsBeamPoseReset').click();assert.equal(h.buildEditorExportRequest().exsBeamPose,false);
 const source=rows(0);source[0].enabled=1;const text=serializePreset(buildPreset({gameId:'srwf-final'},{beam:source}));await h.editorChanges.loadFile({name:'enable-unowned.json',size:text.length,async text(){return text;}});h.editorChanges.apply('matching');assert.equal(h.buildEditorExportRequest().exsBeamPose,false);
 h.state.editorUnits[1].weapon1=2;h.refreshEditorAfterPreset();assert.equal($('exsBeamPoseReset').disabled,false);$('exsBeamPoseReset').click();assert.equal(h.buildEditorExportRequest().exsBeamPose,true);
});
