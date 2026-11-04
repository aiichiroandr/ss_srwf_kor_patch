import assert from 'node:assert/strict';import test from 'node:test';
import {makeBase,descriptorFor} from './helpers/synthetic-game.mjs';
import {echoRequest} from './helpers/synthetic-iso.mjs';
import {splitRootSegments,updateWeaponRecords,exportEditedImage} from '../assets/editor-core.mjs';
const base=await makeBase({units:2});
const request=echoRequest(base.opened.session,base.opened.view);
for(const row of request.weaponEdits)row.fields.voiceType=base.opened.view.weapons.find(r=>r.recordIndex===row.recordIndex).voiceType;
test('dialogue writes only the low six bits, validates range and keeps read-only rows atomic',()=>{
 const root=splitRootSegments(base.decoded),source=root[29].bytes.slice(),row=base.opened.view.weapons.find(r=>r.recordIndex===1),at=row.byteOffset+2;
 source[at]=0xc3;
 const edits=structuredClone(request.weaponEdits);edits.find(r=>r.recordIndex===1).fields.voiceType=24;
 const out=source.slice();updateWeaponRecords(out,edits);assert.equal(out[at],0xd8);
 assert.deepEqual([...out].flatMap((b,i)=>b===source[i]?[]:[i]),[at]);
 for(const value of [-1,64,1.5,'3']){const bad=structuredClone(edits);bad.find(r=>r.recordIndex===1).fields.voiceType=value;const bytes=source.slice();assert.throws(()=>updateWeaponRecords(bytes,bad));assert.deepEqual(bytes,source);}
 const locked=source.slice();assert.throws(()=>updateWeaponRecords(locked,edits,new Map([[1,'locked']])));assert.deepEqual(locked,source);
});
test('dialogue survives compression, output verification and reopening with no history receipt',async()=>{
 const edited=structuredClone(request);edited.weaponEdits.find(r=>r.recordIndex===1).fields.voiceType=63;
 const result=await exportEditedImage(base.opened.session,edited);
 const opened=await base.full.inspectPatchedImage(result.outputBlob,descriptorFor(base.disc,{imageKind:'local'}));
 assert.equal(opened.view.weapons.find(r=>r.recordIndex===1).voiceType,63);
});
