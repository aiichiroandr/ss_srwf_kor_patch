import test from 'node:test';
import assert from 'node:assert/strict';
import {scanBattleDialogue,classifyPilots} from '../scripts/audit-preview-pilot-dialogue.mjs';
function fixture(){
 const b=new Uint8Array(68),v=new DataView(b.buffer);v.setInt32(0,4);
 for(let i=0;i<10;i++)v.setUint16(4+i*2,32-i*2);
 for(const p of [20,26]){v.setUint16(4+p,65535);v.setUint32(6+p,32);}
 v.setUint16(36,17);v.setUint16(38,(103<<6)|2);v.setUint16(40,0x3f01);v.setUint32(42,44);v.setUint16(46,65535);b.set([235,255,255],48);return b;
}
test('census follows shared roots once and retains speaker/voice, including token escapes',()=>{
 const scan=scanBattleDialogue(fixture(),1);assert.deepEqual(scan.records[0].actions,[{donor:0,action:32,opcode:17,speaker:103,voice:0x3f01}]);
});
test('census rejects malformed pointers and unknown instructions',()=>{
 const b=fixture();new DataView(b.buffer).setInt32(0,999);assert.throws(()=>scanBattleDialogue(b,1));
 const c=fixture();new DataView(c.buffer).setUint16(36,99);assert.throws(()=>scanBattleDialogue(c,1),/Unknown/);
});
test('recovery requires the character speaker ID, not a shared display name',()=>{
 const records=[];records[10]={sha256:'dummy',actions:[{speaker:10,voice:1}]};records[103]=records[10];records[104]=records[10];records[102]={sha256:'crew',actions:[{donor:102,action:32,opcode:17,speaker:103,voice:33}]};
 // Real scans are dense; populate other slots with a silent native record.
 for(let i=0;i<records.length;i++)records[i]??={sha256:'empty',actions:[]};
 const result=classifyPilots({records},[{id:103,name:'same'},{id:104,name:'same'}],'srwf-final');
 assert.equal(result.profiles[103].kind,'crew');assert.equal(result.profiles[103].donor,102);assert.equal(result.profiles[104].kind,'silent');
});
