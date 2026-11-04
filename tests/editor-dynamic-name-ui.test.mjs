import {authenticatedSaveCatalog} from './helpers/authenticated-save-catalog.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FakeElement,installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {syntheticSave,syntheticHeroUnits} from './helpers/synthetic-save.mjs';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {createWeaponNameControl} from '../assets/editor-name-control.mjs';
import {createUnitWeaponEditor} from '../assets/editor-unit-weapon-ui.mjs';
import {createSaveEditor} from '../assets/save-ui.mjs';
import {openSave,saveChecksum} from '../assets/save-core.mjs';
import {saveHeroName,saveSummary} from '../assets/save-metadata.mjs';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function allocator(glyphMap,calls,onAdded=()=>{}){
 return(text,options)=>{
  calls.push({text,...options});const candidate=new Map(glyphMap);if(text.includes('힣'))candidate.set('F5FE','힣');
  const bytes=encodeEditorText(text,{gameId:'srwf-final',kind:options.kind,maxBytes:options.maxBytes,glyphMap:candidate});
  if(candidate.size!==glyphMap.size){glyphMap.set('F5FE','힣');onAdded();}return bytes;
 };
}
test('weapon input delegates glyph allocation once, while refresh and byte counters remain read only',()=>{
 const document=installFakeDom(),container=document.createElement('div'),glyphMap=new Map(),calls=[];let changes=0,invalid=0;
 const row={recordIndex:9,name:'빔',original:{name:'빔'},nameEditable:true};
 const ui=createWeaponNameControl({container,row:()=>row,gameId:()=>'srwf-final',canEdit:()=>true,encodeText:allocator(glyphMap,calls),textOptions:()=>({glyphMap}),onChange:()=>changes++,onInvalid:()=>invalid++});
 ui.refresh();ui.refresh();assert.equal(calls.length,0);ui.input.focus();ui.input.value='힣빔';ui.input.dispatchEvent({type:'input'});
 assert.equal(row.name,'힣빔');assert.deepEqual(calls,[{text:'힣빔',kind:'weapon',maxBytes:32,owner:'weapon:9'}]);assert.equal(changes,1);assert.ok(document.activeElement===ui.input);
 assert.match(container.querySelector('small').textContent,/5\/32 B/);ui.refresh();assert.equal(calls.length,1);
 ui.input.value='힣'.repeat(16);ui.input.dispatchEvent({type:'input'});assert.equal(row.name,'힣빔');assert.equal(ui.validate(),false);assert.equal(invalid,1);assert.equal(ui.input.getAttribute('aria-invalid'),'true');
});
test('F prevents unsafe new names early and lets an older custom name return explicitly to its authenticated base name',()=>{
 const d=installFakeDom(),container=d.createElement('div'),row={recordIndex:2,name:'이전 이름',baseName:'빔라이플',original:{name:'이전 이름'},nameEditable:true,nameStorageBlocked:true};let changes=0;
 const ui=createWeaponNameControl({container,row:()=>row,gameId:()=>'srwf-f',canEdit:()=>true,onChange:()=>changes++});ui.refresh();
 assert.equal(ui.input.disabled,true);assert.match(container.querySelector('small').textContent,/보류/);
 const restore=container.querySelector('.weapon-name-base-reset');assert.equal(restore.hidden,false);restore.click();assert.equal(row.name,'빔라이플');assert.equal(restore.hidden,true);assert.equal(changes,1);
});
test('inline unit weapon names use the same allocator and shared weapon owner',()=>{
 const document=installFakeDom();loadHtml(document,html);const glyphMap=new Map(),calls=[];
 const row={recordIndex:7,name:'빔',editable:true,nameEditable:true,statsValid:true,attack:1000,hit:0,critical:0,minRange:1,maxRange:2,energy:0,ammo:5,ammoEditable:true,requiredMorale:100,requiredSkill:0,voiceType:0,terrain:255};row.original={...row};let changes=0;
 const panel=document.getElementById('unitWeaponDetail'),ui=createUnitWeaponEditor({panel,workarea:document.getElementById('unitWeaponWorkarea'),gameId:()=>'srwf-final',row:id=>id===7?row:null,canEdit:()=>true,onChange:()=>changes++,encodeText:allocator(glyphMap,calls),textOptions:()=>({glyphMap}),choices:()=>[{value:0,label:'없음'}]});
 ui.context(1,[7]);ui.open(7);assert.equal(calls.length,0);const input=panel.querySelector('[data-weapon-name]');input.value='힣빔';input.dispatchEvent({type:'input'});
 assert.equal(row.name,'힣빔');assert.equal(changes,1);assert.equal(calls[0].owner,'weapon:7');ui.refresh();assert.equal(calls.length,1);assert.match(panel.querySelector('.weapon-name-field small').textContent,/5\/32 B/);
});
test('live glyph maps survive name diff, BCR export/reopen and metadata without weakening ROM or byte guards',async()=>{
 const fixture=syntheticSave(),glyphMap=new Map(),catalog=await authenticatedSaveCatalog({gameId:'srwf-final',glyphMap}),session=await openSave(fixture.raw,catalog);
 assert.throws(()=>session.editName(2,'heroName','힣'));assert.equal(session.diff().length,0);
 glyphMap.set('F5FE','힣');session.editName(2,'heroName','힣');session.editName(2,'partnerName','힣미나');
 assert.ok(session.list()[0].glyphMap===glyphMap);assert.equal(saveHeroName(session.list()[0]),'힣');assert.equal(saveHeroName(session.list()[0],'partnerName'),'힣미나');
 assert.equal(session.diff().find(row=>row.field==='heroName').after,'힣');assert.equal(saveSummary(session.list()[0]).hero,'힣');
 const output=await session.exportFile(),again=await openSave(output,catalog);assert.equal(saveHeroName(again.list()[0]),'힣');assert.equal(saveHeroName(again.list()[0],'partnerName'),'힣미나');assert.equal(again.list()[0].editable,true);
 const allowed=new Set([...fixture.payloadPositions.slice(0,4),...fixture.payloadPositions.slice(0x3c,0x4a),...fixture.payloadPositions.slice(0x50,0x5e)]);output.forEach((byte,index)=>{if(!allowed.has(index))assert.equal(byte,fixture.raw[index]);});
 const before=await session.exportFile();assert.throws(()=>session.editName(2,'heroName','힣'.repeat(7)));assert.deepEqual(await session.exportFile(),before);
 for(const other of [{glyphMap},{gameId:'srwf-f',glyphMap}]){const locked=await openSave(fixture.raw,other);assert.throws(()=>locked.editName(2,'heroName','힣'));assert.equal(locked.diff().length,0);}
});
test('save name inputs allocate before encoding, reserve existing codes and download a reopenable BCR',async t=>{
 const document=installFakeDom();loadHtml(document,html);Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
 t.mock.timers.enable({apis:['setTimeout']});const $=id=>document.getElementById(id),fixture=syntheticSave(),glyphMap=new Map(),calls=[],reservations=[];
 fixture.payload.fill(255,0x3c,0x4a);fixture.payload.set([0xec,0x10,255],0x3c);fixture.payload.fill(255,0x50,0x5e);fixture.payload.set([0xf4,0xab,255],0x50);new DataView(fixture.payload.buffer).setUint32(0,saveChecksum(fixture.payload));fixture.payloadPositions.forEach((p,i)=>fixture.raw[p]=fixture.payload[i]);
 const synced=[];const context={verified:true,gameId:'srwf-final',units:[],pilots:[],glyphMap,glyphPending:false,reserveGlyphCodes:codes=>reservations.push(new Set(codes)),syncSaveGlyphTexts:texts=>synced.push(new Map(texts))};context.encodeText=allocator(glyphMap,calls,()=>{context.glyphPending=true;});
 Object.assign(context,await authenticatedSaveCatalog(context));
 const ui=createSaveEditor(()=>context);await ui.load({name:'names.bcr',size:fixture.raw.length,arrayBuffer:async()=>fixture.raw.buffer});assert.deepEqual(reservations[0],new Set(['EC10','F4AB']));assert.deepEqual(synced.at(-1),new Map());
 $('saveCommonTab').click();$('saveCommonNamesTab').click();assert.equal(calls.length,0);const input=$('saveHeroName');input.focus();input.value='힣';input.dispatchEvent({type:'input'});
 assert.equal(calls.length,1);assert.equal(calls[0].owner,'save:2:heroName');assert.equal(calls[0].kind,'save');assert.equal(calls[0].maxBytes,14);assert.equal($('saveSlotHero').textContent,'힣');assert.ok(document.activeElement===input);assert.equal($('saveHeroNameCount').textContent,'3 / 14바이트');assert.equal($('saveDownload').disabled,false);assert.deepEqual(synced.at(-1),new Map([['save:2:heroName','힣']]));
 assert.match($('saveNameNote').textContent,/수정 ROM도 함께 저장/);$('saveCommonMoneyTab').click();$('saveCommonNamesTab').click();assert.equal(calls.length,1);
 let downloaded;t.mock.method(URL,'createObjectURL',blob=>{downloaded=blob;return 'blob:save-test';});t.mock.method(URL,'revokeObjectURL',()=>{});$('saveDownload').click();await new Promise(resolve=>setImmediate(resolve));
 assert.ok(downloaded instanceof Blob);const reopened=await openSave(new Uint8Array(await downloaded.arrayBuffer()),{gameId:'srwf-final',glyphMap});assert.equal(saveHeroName(reopened.list()[0]),'힣');
 $('saveReset').click();assert.deepEqual(reservations.at(-1),new Set(['EC10','F4AB']));assert.equal($('saveDownload').disabled,true);assert.equal(calls.length,1);assert.deepEqual(synced.at(-1),new Map(),'restoring the original BCR unregisters edited save-name owners');
 input.value='힣';input.dispatchEvent({type:'input'});assert.equal(synced.at(-1).size,1);
 await ui.load({name:'fresh.bcr',size:fixture.raw.length,arrayBuffer:async()=>fixture.raw.buffer});assert.deepEqual(synced.at(-1),new Map(),'loading another BCR discards the previous save-name owners');
});

test('alias and mecha fields reserve existing glyphs, use their own byte budgets and clear their glyph text when emptied',async()=>{
 const document=installFakeDom();loadHtml(document,html);Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
 const $=id=>document.getElementById(id),fixture=syntheticSave(),glyphMap=new Map([['EC10','가'],['F4AB','나']]),calls=[],reserved=[],synced=[];
 fixture.payload.fill(255,0x4a,0x50);fixture.payload.set([0xec,0x10,255],0x4a);fixture.payload.fill(255,0x64,0x6e);fixture.payload.set([0xf4,0xab,255],0x64);
 new DataView(fixture.payload.buffer).setUint32(0,saveChecksum(fixture.payload));fixture.payloadPositions.forEach((p,i)=>fixture.raw[p]=fixture.payload[i]);
 const context={verified:true,gameId:'srwf-final',units:syntheticHeroUnits(),pilots:[],glyphMap,encodeText:allocator(glyphMap,calls),reserveGlyphCodes:codes=>reserved.push(new Set(codes)),syncSaveGlyphTexts:texts=>synced.push(new Map(texts))};
 Object.assign(context,await authenticatedSaveCatalog(context));
 const ui=createSaveEditor(()=>context);await ui.load({name:'aliases.bcr',size:fixture.raw.length,arrayBuffer:async()=>fixture.raw.buffer});assert.deepEqual(reserved[0],new Set(['EC10','F4AB']));
 const edit=(id,value)=>{const input=$(id);input.value=value;input.dispatchEvent({type:'input'});};
 $('saveCommonTab').click();$('saveCommonNamesTab').click();edit('saveHeroAlias','힣');assert.deepEqual(calls[0],{text:'힣',kind:'saveAlias',maxBytes:6,owner:'save:2:heroAlias'});
 $('saveCommonUnitNamesTab').click();edit('saveHeroUnitName1','힣');assert.deepEqual(calls[1],{text:'힣',kind:'saveUnit',maxBytes:11,owner:'save:2:heroUnitName1'});
 assert.deepEqual(synced.at(-1),new Map([['save:2:heroAlias','힣'],['save:2:heroUnitName1','힣']]));
 edit('saveHeroUnitName1','');assert.equal(calls.length,2);assert.equal(synced.at(-1).get('save:2:heroUnitName1'),'');assert.equal($('saveDownload').disabled,false);
 $('saveReset').click();assert.deepEqual(synced.at(-1),new Map());assert.deepEqual(reserved.at(-1),new Set(['EC10','F4AB']));
});
