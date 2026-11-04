import test from 'node:test';
import assert from 'node:assert/strict';
import {Sha256} from '../assets/sha256.mjs';
import {createBattleMotionCodec,patchIncomLaunch,patchFourBeamLaunch} from '../assets/editor-battle-motion.mjs';

function fixture(){
 const record=new Uint8Array(1024),r=new DataView(record.buffer),table=100;
 r.setUint32(4,table,true);
 for(let i=0;i<48;i++)r.setUint16(table+i*2,i===0?196:200+i*20);
 for(let i=196;i<record.length;i++)record[i]=i&255;
 const beam=new Uint8Array(1768),bv=new DataView(beam.buffer);bv.setUint32(0,46,true);bv.setUint32(4,300,true);beam.set([0x45,0x0c],20);beam.fill(255,22,32);for(let i=0;i<48;i++)bv.setUint16(300+i*2,1767);
 for(const [i,at]of [[0,396],[1,399],[2,490],[3,700],[4,910],[7,1056],[8,1099]])bv.setUint16(300+i*2,at);
 beam.set([0x2d,0x10,0,0,0xfe,0xb0,0xea,0x11,0,1,0],50);beam.set([0x24,0x10,0x05,0,0x0a],100);
 for(const [start,x]of[[490,344],[700,160]]){
  beam.set([0xfa,0x55,x>>8,x&255,0,48],start);let cursor=start+6;
  for(let i=0;i<16;i++){beam.set([0xfa,0xc4,0,i,0,0,0,2],cursor);cursor+=8;}beam[cursor]=255;
 }
 beam.set([250,82,250,69,8],399);for(const at of [432,450,470])beam.set([240,64,16,0,0,0,0,0,0,0,7,0],at);beam[1767]=255;
 const bytes=new Uint8Array(6168+767*record.length+beam.length),d=new DataView(bytes.buffer);
 for(let g=0;g<6;g++)d.setUint32(g*4,24+g*1024);
 let at=6168;for(let i=0;i<768;i++){const r=i===677?beam:record;bytes.set(r,at);d.setUint32(24+i*8,at);d.setUint32(28+i*8,at+r.length);at+=r.length;}
 const beamHash=new Sha256().update(beam).hex(),profiles={test:{size:bytes.length,sha256:new Sha256().update(bytes).hex(),fourBeamSha256:beamHash,exsReservedSha256:new Sha256().update(record).hex()}};
 return {bytes,record,beam,beamHash,codec:createBattleMotionCodec(profiles)};
}
test('incom copies both moving objects, preserves their programs, and keeps the controller unchanged',()=>{
 const {record}=fixture(),out=patchIncomLaunch(record),d=new DataView(out.buffer),table=100;
 assert.equal(d.getUint16(table),196);
 assert.deepEqual(out.subarray(196,220),record.subarray(196,220));
 for(const i of [1,2]){const at=d.getUint16(table+i*2);assert.deepEqual(out.subarray(at,at+3),Uint8Array.of(250,69,24));assert.deepEqual(out.subarray(at+3,at+23),record.subarray(200+i*20,220+i*20));}
 const original=out.slice(0,record.length);original.set(record.subarray(table+2,table+6),table+2);assert.deepEqual(original,record);
 for(const broken of [record.subarray(0,99),Uint8Array.from(record,(_,i)=>i===4?255:record[i])])assert.throws(()=>patchIncomLaunch(broken),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
});

test('opt-in Ex-S pose animation uses a separately authenticated record and v5 restores every source byte without an idle hold',()=>{
 const {bytes,codec}=fixture(),legacy=codec.build(bytes,'test',true),plan=codec.build(bytes,'test',true,{exsPose:true}),state=codec.inspect(plan.bytes,'test'),d=new DataView(plan.bytes.buffer),source=new DataView(bytes.buffer);
 assert.equal(legacy.version,2);assert.equal(plan.version,5);assert.equal(plan.exsPose,true);assert.equal(plan.exsAnimation,1407);
 assert.equal(new TextDecoder().decode(plan.bytes.subarray(-16,-8)),'SRWDAN05');assert.deepEqual(state.original,bytes);
 assert.deepEqual(codec.build(state.original,'test',true).bytes,plan.bytes,'Reload does not silently change format');
 assert.deepEqual(codec.build(state.original,'test',true,{exsPose:false}).bytes,legacy.bytes,'Explicit disable restores v2');
 const clone=plan.bytes.subarray(d.getUint32(24+767*8),d.getUint32(28+767*8)),v=new DataView(clone.buffer,clone.byteOffset,clone.byteLength);
 assert.equal(v.getUint16(20),0x453f);assert.equal(v.getUint16(22),0x450c,'Defender uses the untouched original SC bank');assert.deepEqual(clone.subarray(v.getUint16(300+43*2),v.getUint16(300+43*2)+4),Uint8Array.of(250,246,4,254));
 assert.deepEqual(clone.subarray(v.getUint16(300+44*2),v.getUint16(300+44*2)+4),Uint8Array.of(250,246,0,254));
 const main=clone.subarray(v.getUint32(0,true)),find=sequence=>{const needle=Uint8Array.from(sequence);return main.findIndex((_,i)=>needle.every((n,j)=>main[i+j]===n));};
 assert.ok(find([0x2b,0,43,0,0x2d,0x10,0,0,0xfe,0xb0,0xea,0x11,0,1,0])>=0,'Aimed part scheduled before the original charging/shot command');
 assert.ok(find([0x24,0x10,0x05,0,0x0a,0x24,0x11])>=0,'The explicit beam-object join retains the original charge wait');
 assert.equal(find([0x2b,0,44,0,0x05,0,24]),-1,'Do not restore the idle sprite and add an authored pause before the enemy shot');
 for(const index of[2,3]){
  const at=v.getUint16(300+index*2),stream=clone.subarray(at),calls=[];
  for(let cursor=0;cursor<stream.length;cursor++)if(stream[cursor]===0xfa&&stream[cursor+1]===0xc4){calls.push([...stream.subarray(cursor+2,cursor+7)]);if(calls.length===(index===2?32:16))break;}
  assert.deepEqual(calls,index===2?Array.from({length:16},(_,phase)=>[[0,phase*2,0,0,0],[0,phase*2+1,0,5,0]]).flat():Array.from({length:16},(_,phase)=>[1,phase,0,0,0]),'Only the firing shot is aligned; the defender uses the stock frame sequence');
 }
 const impact=clone.slice(v.getUint16(306),v.getUint16(306)+210),expectedImpact=bytes.slice(source.getUint32(24+677*8)+700,source.getUint32(24+677*8)+910);
 for(let i=0;i<expectedImpact.length-2;i++)if(expectedImpact[i]===250&&expectedImpact[i+1]===196)expectedImpact[i+2]=1;
 assert.deepEqual(impact,expectedImpact,'Every defender pixel origin, wait and timing byte is preserved except the bank selector');
 for(let i=0;i<768;i++)if(![537,677,767].includes(i))assert.deepEqual(plan.bytes.subarray(d.getUint32(24+i*8),d.getUint32(28+i*8)),bytes.subarray(source.getUint32(24+i*8),source.getUint32(28+i*8)));
 for(const offset of [d.getUint32(24+767*8)+21,d.getUint32(24+767*8)+clone.length-1,plan.bytes.length-1552-16+12,plan.used+1]){
  const changed=plan.bytes.slice();changed[offset]^=1;assert.throws(()=>codec.inspect(changed,'test'),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
 }
});

test('Ex-S animation cloning requires an authenticated reserved slot as well as the original source motion',()=>{
 const {bytes,beamHash}=fixture(),profiles={test:{size:bytes.length,sha256:new Sha256().update(bytes).hex(),fourBeamSha256:beamHash,exsReservedSha256:'0'.repeat(64)}},codec=createBattleMotionCodec(profiles);
 assert.equal(codec.build(bytes,'test',true).version,2);
 assert.throws(()=>codec.build(bytes,'test',true,{exsPose:true}),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
 assert.throws(()=>codec.build(bytes,'test',true,{exsPose:'true'}),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
});
test('motion packing stays in its file, recovers every original record, and changes only both selected animations',()=>{
 const {bytes,codec}=fixture(),plan=codec.build(bytes,'test',true),state=codec.inspect(plan.bytes,'test'),d=new DataView(plan.bytes.buffer);
 assert.equal(plan.bytes.length,bytes.length);assert.ok(plan.remaining>700000);assert.deepEqual(state.original,bytes);assert.equal(state.enabled,true);
 assert.equal(codec.inspect(bytes,'test').enabled,false);assert.equal(codec.build(bytes,'test',false).bytes,bytes);
 assert.deepEqual(codec.build(state.original,'test',true).bytes,plan.bytes);
 for(let i=0;i<768;i++)if(i!==537&&i!==677){const a=d.getUint32(24+i*8),b=d.getUint32(28+i*8);assert.deepEqual(plan.bytes.subarray(a,b),bytes.subarray(6168,7192));}
 assert.equal(codec.enabledFor([{preset:'sirbine'}]),false);assert.equal(codec.enabledFor([{preset:'ex-s-gundam'}]),true);
});
test('motion import refuses changed directory, source data, copied commands, length ledger and hidden bytes',()=>{
 const {bytes,codec}=fixture(),plan=codec.build(bytes,'test',true),d=new DataView(plan.bytes.buffer),target=d.getUint32(24+537*8),meta=bytes.length-16-1548;
 for(const at of [0,24,6168,target+1024,plan.used+1,meta+8,bytes.length-1]){const b=plan.bytes.slice();b[at]^=1;assert.throws(()=>codec.inspect(b,'test'),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});}
 const changed=bytes.slice();changed[7000]^=1;assert.throws(()=>codec.build(changed,'test',true),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
 assert.equal(codec.inspect(plan.bytes.subarray(1),'test'),null);
});
test('four cannon charge objects keep original bytes and timing and use independent zero-default attachment lists',()=>{
 const {beam,beamHash}=fixture(),out=patchFourBeamLaunch(beam,beamHash),v=new DataView(out.buffer),table=300;
 assert.equal(out.length,2000);assert.deepEqual(out.subarray(beam.length,beam.length+8),Uint8Array.of(250,82,250,69,8,250,69,25));
 const old=out.slice(0,beam.length);for(const i of [1,40,41,42])old.set(beam.subarray(table+i*2,table+i*2+2),table+i*2);assert.deepEqual(old,beam);
 for(let i=0;i<3;i++){const at=v.getUint16(table+(40+i)*2);assert.deepEqual(out.subarray(at,at+3),Uint8Array.of(250,69,26+i));assert.deepEqual(out.subarray(at+3,at+46),beam.subarray(1056,1099));
  const controller=v.getUint16(table+2),spawn=controller+[432,450,470][i]-399+3;assert.equal(v.getUint16(spawn+9),40+i);assert.deepEqual(out.subarray(spawn,spawn+9),beam.subarray([432,450,470][i],[432,450,470][i]+9));}
 // For a stock unit all four new FA45 pages resolve to their zero default.
 // Removing those no-op additions and normalizing copied program IDs must
 // leave the original instruction stream, including every wait, exact.
 const at=v.getUint16(table+2),controller=new Uint8Array(91);controller.set(out.subarray(at,at+5));controller.set(out.subarray(at+8,at+94),5);
 for(const spawn of [432,450,470])new DataView(controller.buffer).setUint16(spawn-399+9,7);
 assert.deepEqual(controller,beam.subarray(399,490));
 assert.throws(()=>patchFourBeamLaunch(beam),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
 const changed=beam.slice();changed[1767]^=1;assert.throws(()=>patchFourBeamLaunch(changed,beamHash),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
});

test('a verified v1 archive remains byte-identical until four-beam support is explicitly requested',()=>{
 const {bytes,codec}=fixture(),modern=codec.build(bytes,'test',true),old=modern.bytes.slice(),d=new DataView(old.buffer),meta2=old.length-16-1548;
 const saved=d.getUint32(meta2+4),beamStart=d.getUint32(meta2+8),lengths=old.slice(meta2+12,meta2+1548),used=d.getUint32(meta2)-2000,meta1=old.length-16-1544;
 d.setUint32(24+677*8,beamStart);d.setUint32(28+677*8,beamStart+1768);old.fill(0,used,old.length);
 d.setUint32(meta1,used);d.setUint32(meta1+4,saved);old.set(lengths,meta1+8);old.set(new TextEncoder().encode('SRWDAN01'),old.length-16);d.setUint32(old.length-8,1544);d.setUint32(old.length-4,1);
 const state=codec.inspect(old,'test');assert.equal(state.version,1);assert.deepEqual(state.original,bytes);
 assert.deepEqual(codec.build(state.original,'test',true).bytes,old);
 assert.deepEqual(codec.build(state.original,'test',false).bytes,bytes);
 assert.deepEqual(codec.build(state.original,'test',true,{upgrade:true}).bytes,modern.bytes);
});
