import test from 'node:test';
import assert from 'node:assert/strict';
import {openSave,saveChecksum} from '../assets/save-core.mjs';
import {syntheticSave} from './helpers/synthetic-save.mjs';

const put16=(b,p,v)=>{b[p]=v>>>8;b[p+1]=v&255;};
function commit(file){new DataView(file.payload.buffer).setUint32(0,saveChecksum(file.payload));file.payloadPositions.forEach((at,i)=>file.raw[at]=file.payload[i]);}
const units=[
 {recordIndex:23,hp:2000,en:80},
 {recordIndex:100,hp:3300,en:120,saveUnitKind:0,saveUnitForm:0},
 {recordIndex:200,hp:4000,en:160,saveUnitKind:4,saveUnitForm:0},
 {recordIndex:201,hp:4000,en:160,saveUnitKind:4,saveUnitForm:1},
 {recordIndex:202,hp:4000,en:160,saveUnitKind:4,saveUnitForm:2},
];
function unit(file,slot,id,pilot=255,link=255){const at=0x100+slot*30;file.payload.fill(0,at,at+30);put16(file.payload,at,id);file.payload[at+2]=64;file.payload[at+15]=pilot;file.payload[at+16]=link;}
test('repeated definition adds allocate independent rows and preserve legacy duplicate state byte-for-byte',async()=>{
 const file=syntheticSave();unit(file,1,100,0);file.payload[0x100+30+3]=0x77;file.payload[0x100+30+17]=22;commit(file);
 const save=await openSave(file.raw,{gameId:'srwf-final',units});
 const first=save.addUnit(2,100),second=save.addUnit(2,100);
 assert.equal(first.slot,2);assert.equal(second.slot,3);
 const rows=save.list()[0].units.filter(row=>row.id===100);assert.deepEqual(rows.map(row=>row.slot),[1,2,3]);
 const out=await save.exportFile(),bytes=Uint8Array.from(file.payloadPositions,p=>out[p]);
 assert.equal(bytes[0x100+30+3],0x77);assert.equal(bytes[0x100+30+17],22);
 assert.equal((await openSave(out,{gameId:'srwf-final',units})).list()[0].units.filter(row=>row.id===100).length,3);
});
test('each multirow add uses only its newly allocated links and fails atomically at capacity',async()=>{
 const file=syntheticSave(),save=await openSave(file.raw,{gameId:'srwf-final',units});
 const one=save.addUnit(2,200),two=save.addUnit(2,200);
 assert.equal(one.added,3);assert.equal(two.added,3);
 const rows=save.list()[0].units.filter(row=>row.id>=200&&row.id<=202);
 assert.deepEqual(rows.map(row=>[row.id,row.slot,row.linkedSlot]),[[200,1,255],[201,2,1],[202,3,1],[200,4,255],[201,5,4],[202,6,4]]);
 const full=syntheticSave();for(let slot=1;slot<127;slot++)unit(full,slot,23);commit(full);
 const blocked=await openSave(full.raw,{gameId:'srwf-final',units});assert.throws(()=>blocked.addUnit(2,200),/빈 칸 3개/);assert.deepEqual(await blocked.exportFile(),full.raw);
});
