import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {canEditSaveNames,createSaveNameAuthority} from '../assets/save-name-support.mjs?v=20261104-save2';
import {authenticatedSaveCatalog,saveNameAuthorityFixture} from './helpers/authenticated-save-catalog.mjs';
import {syntheticSave,syntheticHeroUnits} from './helpers/synthetic-save.mjs';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {SAVE_NAME_FIELDS,decodeSaveName} from '../assets/save-names.mjs';
import {installFakeDom,loadHtml,FakeElement} from './helpers/fake-dom.mjs';
const base=process.env.B11_BASELINE_ROOT?pathToFileURL(process.env.B11_BASELINE_ROOT+'/'):new URL('../',import.meta.url);
const {openSave,saveChecksum}=await import(new URL('assets/save-core.mjs',base));
const {createSaveEditor}=await import(new URL('assets/save-ui.mjs',base));

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: stock names reject atomically while numeric edits preserve all original name bytes`,async()=>{
 const f=syntheticSave({name:gameId==='srwf-f'?'SROBOT_F_01':'SROBOTFC_01'}),catalog=await authenticatedSaveCatalog({gameId},{stock:true});
 for(const spec of SAVE_NAME_FIELDS.filter(spec=>spec.unitSlot===undefined)){f.payload.fill(255,spec.offset,spec.offset+spec.maxBytes);f.payload.set(encodeEditorText('ア',{gameId,kind:spec.kind,maxBytes:spec.maxBytes}),spec.offset);}
 new DataView(f.payload.buffer).setUint32(0,saveChecksum(f.payload));f.payloadPositions.forEach((p,i)=>f.raw[p]=f.payload[i]);
 const session=await openSave(f.raw,catalog),before=await session.exportFile();
 assert.throws(()=>session.editNames(2,{heroName:'가',partnerName:'나'}),/한글 ROM/);
 assert.deepEqual(await session.exportFile(),before);assert.deepEqual(session.diff(),[]);
 session.edit(2,'money',1000);session.edit(2,'level',32,0);
 const result=await session.exportFile(),again=await openSave(result,catalog);
 assert.equal(again.list()[0].money,1000);assert.equal(again.list()[0].pilots[0].level,32);
 for(const spec of SAVE_NAME_FIELDS)for(let i=0;i<spec.maxBytes;i++)assert.equal(result[f.payloadPositions[spec.offset+i]],f.raw[f.payloadPositions[spec.offset+i]]);
 session.reset();assert.deepEqual(await session.exportFile(),f.raw);
});

test('flags, cloned permissions, wrong session/game and mismatched saves cannot bypass the core',async()=>{
 const f=syntheticSave(),ko=await authenticatedSaveCatalog({gameId:'srwf-final',units:syntheticHeroUnits()});
 assert.equal(canEditSaveNames(ko),true);
 for(const bad of [
  {verified:true,gameId:'srwf-final',nameEncoding:'ko',baseImageKind:'korean',baseTargetSha256:'a'.repeat(64),sessionToken:ko.sessionToken},
  {...ko,saveNameSupport:{}},structuredClone(ko),{...ko,sessionToken:'forged-session'},
  {...ko,gameId:'srwf-f'},
 ]){
  const session=await openSave(f.raw,bad);
  assert.throws(()=>session.editNames(2,{heroName:'가',partnerName:'나'}),/한글 ROM|같은 게임/);
  assert.deepEqual(await session.exportFile(),f.raw);assert.deepEqual(session.diff(),[]);
 }
 const mismatch=await openSave(syntheticSave({name:'SROBOT_F_01'}).raw,ko);
 assert.throws(()=>mismatch.editName(2,'heroName','가'),/같은 게임/);assert.deepEqual(mismatch.diff(),[]);
 const session=await openSave(f.raw,ko);session.editName(2,'heroName','크리스');
 assert.equal(decodeSaveName((await openSave(await session.exportFile())).list()[0],'heroName'),'크리스');
 const before=await session.exportFile();
 assert.throws(()=>session.editNames(2,{heroName:'가',partnerName:'가'.repeat(7)}),/바이트/);
 assert.deepEqual(await session.exportFile(),before,'bad second field cannot commit first field');
});

test('catalog refresh cannot forge permission; revocation blocks pending name export but keeps numeric editing',async()=>{
 const f=syntheticSave(),fixture=await saveNameAuthorityFixture(),catalog={gameId:fixture.view.gameId,sessionToken:fixture.view.sessionToken,saveNameSupport:fixture.saveNameSupport};fixture.close();
 const session=await openSave(f.raw,catalog);
 // Captured identity cannot be retargeted by mutating the caller's object.
 catalog.sessionToken='mutated';session.editName(2,'heroName','가');
 session.updateCatalog({...catalog,verified:true,baseImageKind:'korean'});
 assert.throws(()=>session.editName(2,'heroName','나'),/한글 ROM/);await assert.rejects(session.exportFile(),/한글 ROM/);
 session.reset();session.edit(2,'money',1000);await session.exportFile();
 session.updateCatalog({gameId:fixture.view.gameId,sessionToken:fixture.view.sessionToken,saveNameSupport:fixture.saveNameSupport});
 session.editName(2,'heroName','나');fixture.authority.clear();
 assert.throws(()=>session.editName(2,'heroName','다'),/한글 ROM/);await assert.rejects(session.exportFile(),/한글 ROM/);
 session.reset();assert.deepEqual(await session.exportFile(),f.raw);
});

test('authority rejects forged events, replay and public snapshots; only committing another inspected result revokes',async()=>{
 const fixture=await saveNameAuthorityFixture(),catalog={gameId:fixture.view.gameId,sessionToken:fixture.view.sessionToken,saveNameSupport:fixture.saveNameSupport};
 try{
  assert.throws(()=>createSaveNameAuthority(new EventTarget()),/native/);
  assert.equal(fixture.authority.accept({isTrusted:true,currentTarget:{},target:{},data:{type:'INSPECT_COMPLETE',view:fixture.view}}),null);
  assert.equal(fixture.authority.accept(new MessageEvent('message',{data:{type:'INSPECT_COMPLETE',view:fixture.view}})),null);
  assert.equal(canEditSaveNames(catalog),true,'rejected events do not revoke live authority');
  const stock=await saveNameAuthorityFixture('srwf-final',{stock:true});stock.close();
  const next=await fixture.accept(stock.view);assert.equal(next.saveNameSupport,null);
  assert.equal(canEditSaveNames(catalog),false);
 }finally{fixture.close();}
});

test('stock UI disables every name field and forged input does not allocate glyphs; money still changes',async()=>{
 const doc=installFakeDom();loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
 Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});
 globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
 let encodes=0;const catalog=await authenticatedSaveCatalog({verified:true,gameId:'srwf-final',units:syntheticHeroUnits(),pilots:[],encodeText:()=>{encodes++;}},{stock:true});
 const $=id=>doc.getElementById(id),f=syntheticSave(),ui=createSaveEditor(()=>catalog);
 await ui.load({name:'stock.bcr',size:f.raw.length,arrayBuffer:async()=>f.raw.buffer});$('saveCommonTab').click();$('saveCommonNamesTab').click();
 for(const spec of SAVE_NAME_FIELDS)assert.equal($(spec.inputId).disabled,true,spec.field);
 assert.match($('saveNameNote').textContent,/일본어 원본/);
 const input=$('saveHeroName');input.value='가';input.dispatchEvent({type:'input'});
 assert.equal(encodes,0);assert.equal($('saveDownload').disabled,true);assert.match($('saveEditorStatus').textContent,/한글 ROM/);
 $('saveReset').click();$('saveCommonMoneyTab').click();$('saveMoney').value='1000';$('saveMoney').dispatchEvent({type:'input'});
 assert.equal($('saveDownload').disabled,false);assert.match($('saveChangeCount').textContent,/변경 1건/);
});
