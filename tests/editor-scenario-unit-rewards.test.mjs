import assert from 'node:assert/strict';
import test from 'node:test';
import {readHangarUnitRewardOptions,compileHangarUnitRewardEffect} from '../assets/editor-scenario-unit-rewards.mjs';
import {compileHangarPickupProgram,compilePickupWithDefaultObjective} from '../assets/editor-scenario-unit-pickup.mjs';
import {recordTable,unitRecordWithWeapons,weaponEntryBytes} from './helpers/synthetic-tsr.mjs';

function fixture(){
 const records=Array.from({length:5},(_,id)=>unitRecordWithWeapons({graphic:2,hp:3000+id,en:100,entries:[{slot:1,weapon:1}]}));
 records[2][7]=6<<3;records[3][7]=8<<3;records[4][7]=9<<3;
 const root=[];root[27]={bytes:recordTable(records.map((_,i)=>i),records)};root[29]={bytes:recordTable([0,1,2],[new Uint8Array(17),new Uint8Array(17),new Uint8Array(17)])};return root;
}
function startOf(root,id){return new DataView(root[27].bytes.buffer).getInt32(id*4)+id*4;}
function request(root,gameId,extra={}){const selected=readHangarUnitRewardOptions(root,{gameId}).find(r=>r.unitId===1);return {unitId:1,unitIdentity:selected.identity,baseOffset:100,successOffset:200,failureOffset:64,...extra};}

test('pickup retries a full hangar and never creates again after success across resumed instruction pointers',()=>{
 const root=fixture(),context={gameId:'srwf-f',unitCount:368,regionContext:{gameId:'srwf-f',physicalIndex:0,scenarioSlots:[0],mapIndex:0,mapPhysicalIndex:0,mapSlots:[0],width:32,height:32,identity:'0'.repeat(64)}};
 const {unitId,unitIdentity}=request(root,'srwf-f');
 const program=compileHangarPickupProgram({unitId,unitIdentity,x:4,y:5,baseOffset:100},{root,context});
 const b=program.bytes,v=new DataView(b.buffer);let pc=100,failed=true,attempts=0,gifts=0;
 function tick(atTile,full){
  for(let steps=0;steps<20;steps++){
   const i=pc-100,op=b[i];
   if(op===0xc0){assert.equal(b[i+1],15);assert.deepEqual([...b.slice(i+4,i+8)],[4,5,4,5]);failed=!atTile;pc+=8;}
   else if(op===0xc2){attempts++;failed=full;if(!full)gifts++;pc+=4;}
   else if(op===0xf0)pc=failed?pc+4:pc+2+v.getInt16(i+2);
   else if(op===1)pc=pc+1+v.getInt16(i+1);
   else if(op===0xe9){pc++;return pc;}
   else assert.fail(`Unknown opcode at ${pc}`);
  }
  assert.fail('Program failed to yield');
 }
 tick(false,false);assert.equal(attempts,0);
 tick(true,true);assert.equal(attempts,1);assert.equal(gifts,0);
 const pendingSavedPc=pc;pc=pendingSavedPc;tick(true,false);assert.equal(gifts,1);
 const doneSavedPc=pc;pc=doneSavedPc;
 for(let i=0;i<10;i++)tick(true,false);
 assert.equal(attempts,2);assert.equal(gifts,1);
 assert.equal(program.permissions.savePersistence,false);
});

test('pickup composition keeps default victory and defeat checks before and after acquisition',()=>{
 const root=fixture(),context={gameId:'srwf-f',unitCount:368,regionContext:{gameId:'srwf-f',physicalIndex:0,scenarioSlots:[0],mapIndex:0,mapPhysicalIndex:0,mapSlots:[0],width:32,height:32,identity:'0'.repeat(64)}};
 const decoded=new Uint8Array(80);decoded.set([0xd3,0xfc,0xf2,0,15,0,0,0xd3,0xfb,0xf2,0,11,0,0,0xe9,1,255,240,0xec,1,0xea,0xec,2,0xea],56);
 const body={decoded,roots:Array(14).fill(56)}, {unitId,unitIdentity}=request(root,'srwf-f');
 const program=compilePickupWithDefaultObjective({unitId,unitIdentity,x:4,y:5,baseOffset:100},{root,context,body});
 assert.equal(program.bytes.length,74);
 const b=program.bytes,v=new DataView(b.buffer);
 for(const initialPc of [program.pendingOffset,program.doneOffset])for(const [enemies,allies,want] of [[0,5,1],[5,0,2],[5,5,0]]){
  let pc=initialPc,value=0,outcome=null;
  for(let steps=0;steps<10;steps++){
   const i=pc-100,op=b[i];
   if(op===0xd3){value=b[i+1]===0xfc?enemies:allies;pc+=2;}
   else if(op===0xf2)pc=value===v.getUint16(i+3)?pc+1+v.getInt16(i+1):pc+5;
   else if(op===0xec){outcome=b[i+1];break;}
   else if(op===0xe9){outcome=0;assert.equal(b[i+1],1);assert.equal(pc+2+v.getInt16(i+2),initialPc===program.pendingOffset?100:program.doneOffset);break;}
   else assert.fail(`Unexpected objective opcode at ${pc}`);
  }
  assert.equal(outcome,want);
 }
 const invalid={...body,decoded:decoded.slice()};invalid.decoded[56]=0xea;
 assert.throws(()=>compilePickupWithDefaultObjective({unitId,unitIdentity,x:4,y:5,baseOffset:100},{root,context,body:invalid}));
});

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: an ordinary hangar gift preserves both explicit success and retry targets`,()=>{
 const root=fixture(),before=root[27].bytes.slice(),result=compileHangarUnitRewardEffect(request(root,gameId),{root,gameId}),b=result.bytes,v=new DataView(b.buffer);
 assert.deepEqual(Array.from(b.slice(0,6)),[0xc2,4,0,1,0xf0,0]);assert.equal(106+v.getInt16(6),200);assert.equal(b[8],1);assert.equal(109+v.getInt16(9),64);
 // Evaluate the two native predicate outcomes independently: F0 skips its
 // relative jump on failure (bit7 set), and jumps on success (bit7 clear).
 const next=failed=>(failed?109+v.getInt16(9):106+v.getInt16(6));assert.equal(next(true),64);assert.equal(next(false),200);
 assert.equal(result.requiredUnitSlots,1);assert.equal(result.createsPilot,false);assert.equal(result.createsActor,false);assert.deepEqual(result.permissions,{eventHook:false,map:false,onceOnly:false});assert.deepEqual(root[27].bytes,before);
});

test('actual transformation bits refuse all three family-link side effects without a name/number fallback',()=>{
 const root=fixture(),rows=readHangarUnitRewardOptions(root,{gameId:'srwf-f'});assert.equal(rows[0].eligible,true);
 assert.deepEqual(rows.slice(1).map(r=>[r.unitId,r.transformType,r.eligible,r.allocationSlots,r.familyLinkSideEffects]),[[2,6,false,1,true],[3,8,false,1,true],[4,9,false,1,true]]);
 assert.ok(rows.slice(1).every(row=>/연결 보존/.test(row.readOnlyReason)));
 for(const row of rows.slice(1))assert.throws(()=>compileHangarUnitRewardEffect(request(root,'srwf-f',{unitId:row.unitId,unitIdentity:row.identity}),{root,gameId:'srwf-f'}),/연결 보존/);
 const at=startOf(root,1);root[27].bytes[at+7]=6<<3;assert.throws(()=>compileHangarUnitRewardEffect(request(fixture(),'srwf-f'),{root,gameId:'srwf-f'}),/연결 보존/);
});

test('candidate identity survives editable stats/weapons but the builder rechecks current structure and eligibility',()=>{
 const root=fixture(),original=request(root,'srwf-final'),at=startOf(root,1),v=new DataView(root[27].bytes.buffer);v.setUint16(at+36,8000);v.setUint16(at+20,65535);root[27].bytes[at+9]^=0x30;
 root[27].bytes.set(weaponEntryBytes({slot:1,weapon:2}),at+48);assert.doesNotThrow(()=>compileHangarUnitRewardEffect(original,{root,gameId:'srwf-final'}));
 root[27].bytes[at+46]=2;assert.throws(()=>compileHangarUnitRewardEffect(original,{root,gameId:'srwf-final'}),/무장 목록/);
});

test('unknown identities, fields, accessors, internal jumps and native distance limits fail closed',()=>{
 const root=fixture(),valid=request(root,'srwf-f');let reads=0;const accessor={...valid};Object.defineProperty(accessor,'unitId',{get(){reads++;return 1;},enumerable:true});
 for(const extra of [{unitIdentity:'forged'},{unitId:0},{x:2},{baseOffset:55},{successOffset:104},{failureOffset:108},{baseOffset:0x7fff},{successOffset:0x8000}])assert.throws(()=>compileHangarUnitRewardEffect({...valid,...extra},{root,gameId:'srwf-f'}),{code:'EDITOR_UNIT_REWARD_INVALID'});
 assert.throws(()=>compileHangarUnitRewardEffect(accessor,{root,gameId:'srwf-f'}));assert.equal(reads,0);
 assert.throws(()=>compileHangarUnitRewardEffect({...request(root,'srwf-final'),baseOffset:0x8ff0,successOffset:56},{root,gameId:'srwf-final'}),/signed16/);
});
