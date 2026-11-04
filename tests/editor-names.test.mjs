import {authenticatedSaveCatalog} from './helpers/authenticated-save-catalog.mjs';
const openSave=async(input,catalog)=>openUntrustedSave(input,await authenticatedSaveCatalog(catalog));
import test from 'node:test';import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {encodeEditorText,decodeEditorText} from '../assets/editor-text-codec.mjs';
import {readWeaponNames,writeWeaponNames} from '../assets/editor-weapon-names.mjs';
import {openSave as openUntrustedSave} from '../assets/save-core.mjs';import {syntheticSave} from './helpers/synthetic-save.mjs';
import {makeBase,descriptorFor} from './helpers/synthetic-game.mjs';import {echoRequest} from './helpers/synthetic-iso.mjs';
import {exportEditedImage} from '../assets/editor-core.mjs';
import {tsrRuntimeLimit} from '../assets/editor-storage-safety.mjs';
test('old shared-name metadata above the new CD reserve is recoverable, but new writes must fit the safe bound',()=>{
 const gameId='srwf-final',base=new Uint8Array(640),v=new DataView(base.buffer);v.setInt32(56,160-56);
 for(let id=0;id<4;id++)v.setInt32(160+id*4,(id?200:176)-(160+id*4));
 base.set(encodeEditorText('천지인검',{gameId}),176);base.set(encodeEditorText('빔',{gameId}),200);
 const request=[1,2,3].map(recordIndex=>({recordIndex,text:'초월빔라이플'})),small=writeWeaponNames(base,request,gameId),gap=tsrRuntimeLimit(gameId)-base.length-8;
 const old=new Uint8Array(small.length+gap),d=new DataView(old.buffer);old.set(small.subarray(0,base.length));old.set(small.subarray(base.length),base.length+gap);
 for(let i=0;i<request.length;i++){
  const cell=160+request[i].recordIndex*4,target=cell+v.getInt32(cell),newTarget=new DataView(small.buffer).getUint32(base.length+12*i+8)+gap;
  d.setInt32(cell,newTarget-cell);d.setUint32(base.length+gap+12*i+8,newTarget);
 }
 d.setUint32(old.length-8,base.length+gap);
 assert.ok(old.length>tsrRuntimeLimit(gameId));
 const read=readWeaponNames(old,gameId);assert.deepEqual(read.entries,request);
 assert.deepEqual(read.decoded.subarray(0,base.length),base);
 assert.throws(()=>writeWeaponNames(read.decoded,read.entries,gameId),e=>e.code==='EDITOR_STORAGE_INVALID'&&e.details.maximumBytes===458752);
});
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: existing glyphs including 천지인, token FF, unsupported text and byte bounds`,()=>{
 for(const kind of ['weapon','hero','save']){
  const options={gameId,kind,maxBytes:14},bytes=encodeEditorText('천지인',options);assert.equal(decodeEditorText(bytes,options),'천지인');
  assert.equal(decodeEditorText(encodeEditorText('미나',options),options),'미나');
  assert.throws(()=>encodeEditorText('가'.repeat(7),options),/14바이트/);assert.throws(()=>encodeEditorText('😀',options),/없는 글자/);assert.throws(()=>encodeEditorText(' 가',options));
 }
});
for(const name of ['SROBOT_F_01','SROBOTFC_01'])test(`${name}: hero/partner names export in fragmented gzip save, preserve every unrelated byte and face`,async()=>{
 const f=syntheticSave({name}),gameId=name.includes('FC')?'srwf-final':'srwf-f',s=await openSave(new Uint8Array(gzipSync(f.raw)),{gameId});
 s.editName(2,'heroName','천지인');s.editName(2,'partnerName','크리스');assert.equal(s.diff().length,2);
 const out=await s.exportFile(),again=await openSave(out,{gameId});
 assert.equal(decodeEditorText(again.list()[0].heroNameBytes,{gameId,kind:'save'}),'천지인');assert.equal(decodeEditorText(again.list()[0].partnerNameBytes,{gameId,kind:'save'}),'크리스');
 const {gunzipSync}=await import('node:zlib'),raw=gunzipSync(out),allowed=new Set([...f.payloadPositions.slice(0,4),...f.payloadPositions.slice(0x3c,0x4a),...f.payloadPositions.slice(0x50,0x5e)]);
 for(let i=0;i<raw.length;i++)if(!allowed.has(i))assert.equal(raw[i],f.raw[i],`outside name fields ${i}`);
 await assert.rejects(async()=>s.editName(2,'heroName','😀'));s.reset();assert.deepEqual(await s.exportFile(),new Uint8Array(gzipSync(f.raw)));
});
test('Final new save names use the current font, retain the legacy reader and show current names in summaries and diffs',async()=>{
 const gameId='srwf-final',legacy=encodeEditorText('미나 라이클링',{gameId,kind:'hero',maxBytes:14}),old=encodeEditorText('경',{gameId,kind:'hero'});
 assert.deepEqual([...old],[0xf2,0xe2,255]);
 const current=encodeEditorText('경',{gameId,kind:'save'});
 assert.deepEqual(current,encodeEditorText('경',{gameId,kind:'weapon'}));assert.notDeepEqual(current,old);
 assert.equal(decodeEditorText(legacy,{gameId,kind:'save'}),'미나 라이클링');assert.equal(decodeEditorText(legacy,{gameId,kind:'hero'}),'미나 라이클링');
 const f=syntheticSave({heroNameBytes:legacy}),s=await openSave(f.raw,{gameId});s.editName(2,'heroName','경미나');s.editName(2,'partnerName','아무로');
 const again=await openSave(await s.exportFile(),{gameId}),r=again.list()[0];
 assert.equal(decodeEditorText(r.heroNameBytes,{gameId,kind:'save'}),'경미나');assert.equal(decodeEditorText(r.partnerNameBytes,{gameId,kind:'save'}),'아무로');
 assert.equal(s.diff().find(d=>d.field==='heroName').before,'미나 라이클링');assert.equal(s.diff().find(d=>d.field==='heroName').after,'경미나');
 const {saveHeroName}=await import('../assets/save-metadata.mjs');assert.equal(saveHeroName(r),'경미나');
});
test('name extension is canonical, restores pointers, does not overwrite shared original text and rejects tampering',()=>{
 const base=new Uint8Array(240),v=new DataView(base.buffer);v.setInt32(56,160-56);v.setInt32(160,12);v.setInt32(164,8);v.setInt32(168,4);base.set(encodeEditorText('빔',{gameId:'srwf-final'}),172);
 const output=writeWeaponNames(base,[{recordIndex:1,text:'천지인'}],'srwf-final'),read=readWeaponNames(output,'srwf-final');
 assert.deepEqual(read.decoded,base);assert.deepEqual(read.entries,[{recordIndex:1,text:'천지인'}]);assert.deepEqual(base.subarray(172,177),output.subarray(172,177));assert.equal(new DataView(output.buffer).getInt32(168),4);
 assert.deepEqual(writeWeaponNames(base,read.entries,'srwf-final'),output);
 for(const at of [164,base.length,base.length+3,output.length-1]){const bad=output.slice();bad[at]^=1;assert.throws(()=>readWeaponNames(bad,'srwf-final'));}
});
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: identical complete names share bytes and retain independent original pointers`,()=>{
 const base=new Uint8Array(640),v=new DataView(base.buffer);v.setInt32(56,160-56);
 for(let id=0;id<4;id++)v.setInt32(160+id*4,(id?200:176)-(160+id*4));
 base.set(encodeEditorText('천지인검',{gameId}),176);base.set(encodeEditorText('빔',{gameId}),200);
 for(const text of ['천지인검','초월빔라이플']){
  const request=[1,2,3].map(recordIndex=>({recordIndex,text})),out=writeWeaponNames(base,request,gameId),d=new DataView(out.buffer),read=readWeaponNames(out,gameId);
  assert.equal(new TextDecoder().decode(out.subarray(out.length-16,out.length-8)),'SRWNAM02');
  assert.deepEqual(read.decoded,base);assert.deepEqual(read.entries,request);
  const targets=[1,2,3].map(id=>160+id*4+d.getInt32(160+id*4));assert.equal(new Set(targets).size,1);
  if(text==='천지인검')assert.equal(targets[0],176,'only an existing complete name is reused');
  assert.ok(out.length<base.length+16+3*(8+encodeEditorText(text,{gameId}).length));
  assert.deepEqual(writeWeaponNames(read.decoded,read.entries,gameId),out);
  for(const at of [base.length,base.length+3,base.length+8,out.length-1]){const bad=out.slice();bad[at]^=1;assert.throws(()=>readWeaponNames(bad,gameId));}
 }
 assert.equal(v.getInt32(164),36,'input was never changed');
});
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: rename through disc writer, fresh provenance reopen, numeric follow-up and restoration`,async()=>{
 const base=await makeBase({gameId,units:4}),{session,view}=base.opened,row=view.weapons.find(r=>r.nameEditable);assert.ok(row);
 const request=echoRequest(session,view);request.weaponNameEdits=[{recordIndex:row.recordIndex,text:'천지인'}];
 const result=await exportEditedImage(session,request),desc=descriptorFor(base.disc,{gameId,imageKind:'local'}),opened=await base.full.inspectPatchedImage(result.outputBlob,desc);
 assert.equal(opened.view.weapons.find(r=>r.recordIndex===row.recordIndex).name,'천지인');assert.deepEqual(opened.session.decoded,session.decoded);
 const request2=echoRequest(opened.session,opened.view),target=request2.weaponEdits.find(r=>r.recordIndex===row.recordIndex);target.fields.attack=1234;
 const result2=await exportEditedImage(opened.session,request2),again=await base.full.inspectPatchedImage(result2.outputBlob,desc);assert.equal(again.view.weapons.find(r=>r.recordIndex===row.recordIndex).name,'천지인');assert.equal(again.view.weapons.find(r=>r.recordIndex===row.recordIndex).attack,1234);
 const restore=echoRequest(opened.session,opened.view);restore.weaponNameEdits=[{recordIndex:row.recordIndex,text:row.name}];const restored=await exportEditedImage(opened.session,restore);const original=await base.full.inspectPatchedImage(restored.outputBlob,desc);assert.deepEqual(original.session.decoded,session.decoded);assert.equal(original.session.weaponNames.length,0);
});

test('weapon name presets preserve glyph-checked strings, restore them on a fresh model and refuse unsupported text',async()=>{
 const {buildPreset,parsePreset,serializePreset,applyPreset}=await import('../assets/editor-preset.mjs');
 const gameId='srwf-final',base=await makeBase({gameId}),source=base.opened.view.weapons.find(r=>r.nameEditable),row={...source,original:{...source}};row.name='빔라이플개';
 const preset=parsePreset(serializePreset(buildPreset({gameId},{weapon:[row]}))),fresh={...source,original:{...source}};
 assert.equal(preset.changeCount,1);assert.equal(applyPreset(preset,{gameId,weapons:[fresh]},'all').applied,1);assert.equal(fresh.name,'빔라이플개');
 const bad=JSON.parse(serializePreset(buildPreset({gameId},{weapon:[row]})));bad.weapons[0].fields.name.to='😀';assert.throws(()=>parsePreset(JSON.stringify(bad)));
});

test('F relocated first name uses the authenticated weapon-table count, including backward aliases',()=>{
 const gameId='srwf-f',base=new Uint8Array(12000),v=new DataView(base.buffer);
 v.setInt32(56,160-56);v.setInt32(116,6000-116);v.setUint32(6000,1280*4);
 base.set(encodeEditorText('빔',{gameId}),144);
 for(let id=0;id<1280;id++)v.setInt32(160+id*4,144-(160+id*4));
 const changed=writeWeaponNames(base,[{recordIndex:1279,text:'천지인'}],gameId);
 const reopened=readWeaponNames(changed,gameId);
 assert.deepEqual(reopened.decoded,base);assert.deepEqual(reopened.entries,[{recordIndex:1279,text:'천지인'}]);
 assert.throws(()=>writeWeaponNames(base,[{recordIndex:1280,text:'천지인'}],gameId));
});
