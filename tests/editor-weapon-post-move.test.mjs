import assert from 'node:assert/strict';
import test from 'node:test';
import { makeBase, descriptorFor } from './helpers/synthetic-game.mjs';
import { echoRequest } from './helpers/synthetic-iso.mjs';
import { editorDecodedMasks, splitRootSegments, updateWeaponRecords, exportEditedImage } from '../assets/editor-core.mjs';
import { immutableBytesHash } from '../assets/editor-provenance.mjs';
import { buildPreset, serializePreset, parsePreset, planPresetApplication } from '../assets/editor-preset.mjs';
import { KILL_EXPERIENCE_PROFILES } from '../assets/editor-kill-experience-profiles.mjs';
import { WEAPON_POST_MOVE_PROFILES } from '../assets/editor-weapon-post-move-profiles.mjs';
import { WEAPON_POST_MOVE_MASK } from '../assets/editor-weapon-post-move.mjs';

test('new production profiles permit only bit 6 per bounded weapon record and never widen raw disc bounds', () => {
   assert.equal(WEAPON_POST_MOVE_PROFILES.length,8);
   for (const profile of WEAPON_POST_MOVE_PROFILES) {
     const parent=KILL_EXPERIENCE_PROFILES.find(row=>row.baseTargetSha256===profile.baseTargetSha256);
     assert.ok(parent);
     assert.equal(profile.rawMasks,parent.rawMasks);
     assert.equal(profile.immutableDiscSha256,parent.immutableDiscSha256);
     const parentMasks=new Set(parent.decodedMasks.map(m=>m.join(',')));
     const extra=profile.decodedMasks.filter(m=>!parentMasks.has(m.join(',')));
     assert.equal(extra.length,profile.gameId==='srwf-f'?1279:1407);
     assert.ok(extra.every(([,len,mask])=>len===1&&mask===WEAPON_POST_MOVE_MASK));
     assert.notEqual(profile.immutableTsrSha256,parent.immutableTsrSha256);
   }
});

for (const gameId of ['srwf-f','srwf-final']) {
 test(`${gameId}: P changes exactly its bit, rejects malformed and read-only edits and preserves other immutable bits`, async () => {
   const base=await makeBase({gameId,weaponPostMove:true,units:2});
   const {view,session}=base.opened;
   const target=view.weapons.find(row=>row.recordIndex===1);
   const root=splitRootSegments(base.decoded);
   const data=root[29].bytes, at=target.byteOffset+1;
   assert.equal(target.postMove,false);
   const locks=new Map(view.weapons.filter(w=>!w.editable).map(w=>[w.recordIndex,w.readOnlyReason]));
   const good=echoRequest(session,view, (kind,row,fields)=>{if(kind==='weapon'&&row.recordIndex===1) fields.postMove=true;});
   const changed=base.decoded.slice();
   const segment=splitRootSegments(changed)[29].bytes;
   updateWeaponRecords(segment,good.weaponEdits,locks,gameId);
   assert.equal(segment[at]^data[at],0x40);
   assert.deepEqual([...segment].flatMap((byte,i)=>byte===data[i]?[]:[i]),[at]);
   const masks=editorDecodedMasks(root,gameId,{weaponPostMove:true});
   assert.equal(immutableBytesHash(changed,masks),immutableBytesHash(base.decoded,masks));
   segment[at]^=0x80;
   assert.notEqual(immutableBytesHash(changed,masks),immutableBytesHash(base.decoded,masks));
   for(const [recordIndex,value] of [[1,1],[1,'true'],[1,null],[2,true]]) {
     const malformed=structuredClone(good.weaponEdits);
     malformed.find(r=>r.recordIndex===recordIndex).fields.postMove=value;
     const unchecked=data.slice();
     assert.throws(()=>updateWeaponRecords(unchecked,malformed,locks,gameId));
     assert.deepEqual(unchecked,data);
   }
   const output=await exportEditedImage(session,good);
   const opened=await base.full.inspectPatchedImage(output.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
   const updated=opened.view.weapons.find(row=>row.recordIndex===1);
   assert.equal(updated.postMove,true);
   assert.ok(updated.identityAliases.includes(target.identity));
   assert.ok(updated.saveIdentityAliases.includes(target.saveIdentity));
   const original={...target}; const edit={...target,postMove:true,original};
   const preset=parsePreset(serializePreset(buildPreset({gameId},{weapon:[edit]})),{gameId});
   assert.equal(preset.entries.weapon[0].fields[0].to,true);
   const preview=planPresetApplication(preset,{gameId,weapons:[{...updated,original:updated}]});
   assert.equal(preview.items.find(row=>row.kind==='weapon').status,'same');
 });
}
