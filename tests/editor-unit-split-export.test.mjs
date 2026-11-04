import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBase,descriptorFor} from './helpers/synthetic-game.mjs';
import {echoRequest} from './helpers/synthetic-iso.mjs';
import {exportEditedImage,preflightEditedImage} from '../assets/editor-core.mjs';
import {readWeaponNames} from '../assets/editor-weapon-names.mjs';

test('Final scattered records compose with names, preserve fixed roots, and survive editing an independently reopened image',async()=>{
 // A trailing root keeps the fixed weapon table separate from tail alignment,
 // as on the accepted game layout. The generated unit region is 4B aligned.
 const base=await makeBase({units:5,costTable:new Uint8Array(4),unitWeapons:{1:[{slot:2,weapon:1}],2:[{slot:2,weapon:1}]}}),{session,view}=base.opened;
 const request=echoRequest(session,view);
 request.unitWeaponAdditions=[1,2].map(recordIndex=>({recordIndex,weapons:Array(10).fill(2)}));
 request.weaponNameEdits=[{recordIndex:1,text:'천지인'}];
 const budget=await preflightEditedImage(session,request);
 assert.equal(budget.canExport,true,JSON.stringify(budget));assert.ok(budget.rows.find(r=>r.id==='unit-tail').usedBytes>0);
 assert.ok(budget.rows.every(r=>r.remainingBytes>=0));
 const first=await exportEditedImage(session,request),descriptor=descriptorFor(base.disc,{imageKind:'local'});
 const opened=await base.full.inspectPatchedImage(first.outputBlob,descriptor);
 const stored=readWeaponNames(opened.session.storedDecoded,'srwf-final').decoded,d=new DataView(stored.buffer,stored.byteOffset,stored.byteLength);
 assert.equal(new TextDecoder().decode(stored.subarray(stored.length-40,stored.length-32)),'SRUCMP05');
 for(let i=0;i<session.root.length;i++)assert.equal(d.getInt32(i*4),new DataView(session.decoded.buffer).getInt32(i*4),`root ${i}`);
 for(const id of [1,2])assert.equal(opened.view.units.find(r=>r.recordIndex===id).weaponList.entries.length,11);
 assert.equal(opened.view.weapons.find(r=>r.recordIndex===1).name,'천지인');
 const same=await exportEditedImage(opened.session,echoRequest(opened.session,opened.view));
 assert.equal(same.sha256,first.sha256);
 const next=echoRequest(opened.session,opened.view);next.unitEdits.find(r=>r.recordIndex===1).fields.hp=12345;
 const second=await exportEditedImage(opened.session,next),twice=await base.full.inspectPatchedImage(second.outputBlob,descriptor);
 assert.equal(twice.view.units.find(r=>r.recordIndex===1).hp,12345);
 assert.deepEqual(twice.view.units.find(r=>r.recordIndex===2).weaponList,opened.view.units.find(r=>r.recordIndex===2).weaponList);
 assert.equal(twice.view.weapons.find(r=>r.recordIndex===1).name,'천지인');
});
