// Synthetic regression pins for the unit/weapon storage modules. Every image is
// generated here or by the shared synthetic helpers; the expected values were
// taken from the tree before the shared byte helpers (bytesEqual, dataView,
// bytesToHex) replaced the private copies.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PRESET_FIELDS,PRESET_FORMAT,diffEditorRows,parsePreset,planPresetApplication} from '../assets/editor-preset.mjs';
import {compactUnitStorage,expandCompactUnitStorage,fUnitOffsetLedgerDiagnostics,isFinalReferenceInlineUnitStorage} from '../assets/editor-unit-compact.mjs';
import {createNativeOverlayComposer} from '../assets/editor-native-overlays.mjs';
import {spawnCapacityInfo} from '../assets/editor-spawn-capacity.mjs';
import {readWeaponNames,writeWeaponNames} from '../assets/editor-weapon-names.mjs';
import {readWeaponCloneManifest,writeWeaponCloneManifest} from '../assets/editor-weapon-clone.mjs';
import {normalizeUnitRestorations,readUnitRestorationPrefix,repackUnitRestorations} from '../assets/editor-unit-restoration.mjs';
import {expandFInlineAuxiliary,fInlineAuxiliaryUsage,packFInlineAuxiliary} from '../assets/editor-f-inline.mjs';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {tsrRuntimeLimit} from '../assets/editor-storage-safety.mjs';
import {createEditorInspector,dataRecordOffsets,splitRootSegments} from '../assets/editor-core.mjs';
import {unitFiller} from './helpers/synthetic-fillers.mjs';
import {recordTable,unitRecord} from './helpers/synthetic-tsr.mjs';
import {weaponCloneGame} from './helpers/synthetic-weapon-clone.mjs';
import {makeBase,descriptorFor,trustFor} from './helpers/synthetic-game.mjs';
import {buildDisc,packGreedy} from './helpers/synthetic-iso.mjs';
import {constructionGame} from './helpers/synthetic-construction.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hex=bytes=>Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength).toString('hex');
const view=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
function atOffset(bytes,pad=13){const buffer=new Uint8Array(bytes.length+pad*2).fill(0xa5);buffer.set(bytes,pad);return buffer.subarray(pad,pad+bytes.length);}
function flipped(bytes,at,bit=1){const out=bytes.slice();out[at]^=bit;return out;}
function holeAt(list,index){const out=list.slice();delete out[index];return out;}

test('preset weapon-addition diffs compare element by element, holes and NaN included',()=>{
 const row=(after,before)=>{
  const r={recordIndex:1,name:'u1',recordKind:'regular',editable:true,hp:3000,en:150,armor:900,speed:80,limit:200,move:6,ground:3,sea:2,air:0,space:3,
   ability1:0,ability2:0,ability3:0,ability4:0,abilityValue1:0,abilityValue2:0,abilityValue3:0,abilityValue4:0,weaponAdditions:after};
  r.original={...Object.fromEntries(PRESET_FIELDS.unit.map(f=>[f,r[f]])),weaponAdditions:before};return r;
 };
 const diff=(before,after)=>diffEditorRows('unit',[row(after,before)]).map(change=>change.weaponAdditions);
 assert.deepEqual(diff(holeAt([1,2],0),[1,2]),[]);
 assert.deepEqual(JSON.parse(JSON.stringify(diff([1,2],holeAt([1,2],0)))),[{from:[1,2],to:[null,2],baseCount:0}]);
 assert.deepEqual(diff([,],[,]),[]);
 assert.deepEqual(JSON.parse(JSON.stringify(diff([],[,]))),[{from:[],to:[null],baseCount:0}]);
 assert.equal(diff([NaN],[NaN]).length,1);
 assert.deepEqual(diff([0],[-0]),[]);
 assert.deepEqual(diff(Uint8Array.of(1,2),[1,2]),[]);
 assert.deepEqual(diff([1,2],[1,3]),[{from:[1,2],to:[1,3],baseCount:0}]);
 assert.throws(()=>diff('12','12'),error=>error instanceof TypeError&&/every is not a function/.test(error.message));
});

test('preset plan statuses for weapon additions follow the element-wise comparison',async()=>{
 const GAME='srwf-final',base=await makeBase({units:3,unitWeapons:{1:[{slot:7,weapon:2}]}});
 const unit=base.opened.view.units.find(r=>r.recordIndex===1),weapons=base.opened.view.weapons,baseCount=unit.weaponList.entries.length;
 assert.equal(baseCount,1);
 const preset=parsePreset(JSON.stringify({format:PRESET_FORMAT,version:1,gameId:GAME,units:[{recordIndex:1,name:'u1',fields:{},weaponAdditions:{from:[],to:[1,2],baseCount}}],pilots:[],weapons:[]}),{gameId:GAME});
 const status=(current,entries)=>{
  const r=structuredClone(unit);r.original={...Object.fromEntries(PRESET_FIELDS.unit.map(f=>[f,r[f]])),weaponAdditions:[]};r.weaponAdditions=current;
  if(entries)r.weaponList={...r.weaponList,entries:entries(r.weaponList.entries)};
  const item=planPresetApplication(preset,{gameId:GAME,units:[r],weapons:structuredClone(weapons)}).items.find(i=>i.field==='weaponAdditions');
  return `${item.status}${item.reason?'/'+item.reason:''} ${JSON.stringify(Array.from(item.current??[]))}`;
 };
 assert.equal(status([]),'apply []');
 assert.equal(status([1,2]),'same [1,2]');
 assert.equal(status([2]),'conflict [2]');
 assert.equal(status(holeAt([1,2],0)),'skip/weapon-domain [null,2]');
 assert.equal(status(Uint16Array.of(1,2)),'skip/weapon-domain [1,2]');
 assert.equal(status([],e=>[...e,{...e[0],weaponIndex:1},{...e[0],weaponIndex:2}]),'same [1,2]');
 assert.equal(status([],e=>[...e,{...e[0],weaponIndex:2},{...e[0],weaponIndex:1}]),'skip/weapon-domain []');
});

test('SRUCMP09 reference footer matches only the lowercase zero-padded base hash',()=>{
 const game='srwf-final',empty=unitFiller(game),base=tsrRuntimeLimit(game)-68;
 const active=recordTable(Array.from({length:14},(_,i)=>i),[unitRecord(),unitRecord(),...Array.from({length:12},()=>empty)]);
 const make=baseSha=>{
  const storage={start:1024,length:active.length,offsets:Array.from({length:14},(_,i)=>i*4+view(active).getInt32(i*4)),baseSha,restoration:{slots:Array.from({length:12},(_,i)=>({recordIndex:i+2}))}};
  const logical=new Uint8Array(base+active.length),d=view(logical);
  d.setUint32(0,164);d.setInt32(108,base-108);d.setInt32(112,storage.start+storage.length-112);d.setInt32(56,4000-56);d.setInt32(116,10000-116);d.setUint32(10000,1408*4);d.setInt32(144,30000-144);
  logical.set(active,base);
  return {storage,logical,packed:compactUnitStorage(logical,storage,game,{experimentalFinalReference:true})};
 };
 const baseSha='000102030a0b0c0f10111a1f7f80f0fe00ff09a0050e0d010000000000000001',f=make(baseSha);
 assert.equal(base,458684);assert.equal(f.packed.length,458684);
 assert.equal(sha(f.packed),'0475adbd8d6acb3160d43e4dfd0303bdbf55795636ab0ba0935badd9cee009e9');
 assert.equal(sha(f.logical),'bc75d0b871d5278c07a4d28a88e72c0b318e014a79e774e92000c6bb3deaf57f');
 assert.equal(isFinalReferenceInlineUnitStorage(f.packed),true);
 const profiles=hash=>[{gameId:game,baseTargetSha256:hash,decodedLength:base,unitStorage:f.storage}];
 for(const input of [f.packed,atOffset(f.packed)])assert.deepEqual(expandCompactUnitStorage(input,game,{profiles:profiles(baseSha)}),f.logical);
 const refused=hash=>error=>error.code==='EDITOR_STORAGE_INVALID'&&JSON.stringify(error.details)===JSON.stringify({reason:'reference-profile',hash,matches:0,unitStart:1024,unitLength:812,tableSize:56,start:458684});
 for(const wrong of [baseSha.toUpperCase(),baseSha.replace(/^0+/,'')])assert.throws(()=>expandCompactUnitStorage(f.packed,game,{profiles:profiles(wrong)}),refused(baseSha));
 assert.throws(()=>expandCompactUnitStorage(f.packed,game,{profiles:[]}),refused(baseSha));
 assert.throws(()=>expandCompactUnitStorage(make('ab'.repeat(32)).packed,game,{profiles:[]}),refused('ab'.repeat(32)));
});

test('native overlay composer reports exactly the changed IP and EXEC windows',()=>{
 const info=spawnCapacityInfo('srwf-f'),ip=new Uint8Array(info.ipByteLength),exec=new Uint8Array(info.execByteLength);
 assert.deepEqual([info.ipByteLength,info.execByteLength,info.execOffset],[6144,731504,714156]);
 view(exec).setUint32(info.execOffset,info.originalHandler);
 const changed=ip.slice();for(let i=0x1700;i<0x1800;i+=3)changed[i]^=0xff;
 const patches=(before,ipAfter,execAfter=exec.slice())=>{
  const composer=createNativeOverlayComposer({applySpawnCapacity:()=>({ip:ipAfter,exec:execAfter}),normalizeSpawnCapacity:()=>({ip:ipAfter,exec:execAfter})});
  return composer.applySpawnCapacity(before,exec,{gameId:'srwf-f',enabled:true}).patches.map(p=>[p.file,p.offset,p.before.length,sha(p.after)]);
 };
 const ipPatch=[['ip',5888,256,'c7f4bdc83dd9dafc2440b0949defa377bef0fb4f7d7f841687998c2f5eef26fb']];
 assert.deepEqual(patches(ip,changed),ipPatch);
 assert.deepEqual(patches(Array.from(ip),changed),ipPatch);
 assert.deepEqual(patches(ip,ip.slice()),[]);
 // Holes left at exactly the changed indices are skipped by the element-wise comparison.
 const sparse=Array.from(ip);for(let i=0x1700;i<0x1800;i+=3)delete sparse[i];
 assert.deepEqual(patches(sparse,changed),[]);
 const otherExec=exec.slice();view(otherExec).setUint32(info.execOffset,0x12345678);
 assert.deepEqual(patches(ip,ip.slice(),otherExec),[['exec',714156,4,'b2ed992186a5cb19f6668aade821f502c1d00970dfd0e35128d51bac4649916c']]);
});

test('weapon names write and reopen identically from byteOffset views',()=>{
 const base=()=>{const b=new Uint8Array(240),d=view(b);d.setInt32(56,104);d.setInt32(160,12);d.setInt32(164,8);d.setInt32(168,4);b.set(encodeEditorText('빔',{gameId:'srwf-final'}),172);return b;};
 const request=[{recordIndex:1,text:'천지인'}];
 const stored=writeWeaponNames(base(),request,'srwf-final');
 assert.equal(stored.length,271);
 assert.equal(sha(stored),'830c73694855f0115e30d06500684ac8cf729c56f6982041c99c7f7bed823cfa');
 assert.equal(hex(stored.subarray(240)),'0001000700000008efb5ec45ed82ff5352574e414d3031000000f000000001');
 assert.deepEqual(writeWeaponNames(atOffset(base()),request,'srwf-final'),stored);
 for(const input of [stored,atOffset(stored)]){
  const read=readWeaponNames(input,'srwf-final');
  assert.deepEqual(read.entries,request);assert.deepEqual(read.decoded,base());
 }
 for(const back of [1,4,8,30])assert.throws(()=>readWeaponNames(flipped(stored,stored.length-back),'srwf-final'),{code:'EDITOR_WEAPON_NAME_INVALID'});
 assert.throws(()=>readWeaponNames([...stored],'srwf-final'),TypeError);
});

test('weapon clone manifest round-trips and refuses tampered or non-canonical tails',()=>{
 const decoded=weaponCloneGame('srwf-final'),entries=[{recordIndex:1331,sourceRecordIndex:1},{recordIndex:1332,sourceRecordIndex:2}];
 assert.equal(decoded.length,38984);
 const stored=writeWeaponCloneManifest(decoded,entries,'srwf-final',{staging:true});
 assert.equal(hex(stored.subarray(decoded.length)),'053300010534000253525743505930310000984800000002');
 for(const input of [stored,atOffset(stored)]){
  const read=readWeaponCloneManifest(input,'srwf-final',{staging:true});
  assert.deepEqual(read.entries,entries);assert.deepEqual(read.decoded,decoded);
 }
 const refused=reason=>error=>error.code==='EDITOR_WEAPON_CLONE_INVALID'&&error.details?.reason===reason;
 for(const back of [24,23,21])assert.throws(()=>readWeaponCloneManifest(flipped(stored,stored.length-back),'srwf-final',{staging:true}),refused('record'));
 for(const back of [1,5,8])assert.throws(()=>readWeaponCloneManifest(flipped(stored,stored.length-back),'srwf-final',{staging:true}),refused('footer'));
 const swapped=stored.slice(),at=decoded.length;swapped.set(stored.subarray(at+4,at+8),at);swapped.set(stored.subarray(at,at+4),at+4);
 assert.throws(()=>readWeaponCloneManifest(swapped,'srwf-final',{staging:true}),refused('noncanonical'));
 const untagged=flipped(stored,stored.length-16),passed=readWeaponCloneManifest(untagged,'srwf-final',{staging:true});
 assert.equal(passed.decoded,untagged);assert.deepEqual(passed.entries,[]);
});

test('unit restorations: masked header comparison, name checks and pinned repack',async()=>{
 const gameId='srwf-final',disc=buildDisc({slot:packGreedy(constructionGame(gameId)),product:'20612G'});
 const inspector=createEditorInspector(trustFor(disc,[],gameId));
 const opened=await inspector.inspectPatchedImage(disc.blob,descriptorFor(disc,{gameId}));
 const profile=await inspector.createEditorProvenanceProfile(opened.session);
 const session=opened.session,weapons=opened.view.weapons,storage=session.unitStorage,baseLength=session.baseDecodedLength;
 assert.equal(sha(session.decoded),'de272d57937e9c2bad62ac4451c4b1b33fca2e85d8e8a037211d97135da74763');
 const open=bytes=>{const b=bytes.slice(),root=splitRootSegments(b);return {b,root,table:dataRecordOffsets(root[27].bytes,48)};};
 const presets=['s-gundam','ex-s-gundam','sirbine','zwauss','blood-temple'],request=presets.map((preset,i)=>({recordIndex:50+i,preset,loadoutVersion:1}));
 const s=open(session.decoded),repacked=repackUnitRestorations(s.b,s.root,s.table,request,structuredClone(storage),baseLength,gameId,structuredClone(weapons));
 assert.equal(repacked.length,48280);
 assert.equal(sha(repacked),'5f31c0ac1c7e4504838479c1ae5c02258fef9d86156f11d04eb50d1a8f6a7bfe');
 const x=open(repacked),normalized=normalizeUnitRestorations(x.b,x.root,x.table,weapons,profile,gameId);
 assert.deepEqual(normalized.restorations.map(r=>[r.recordIndex,r.preset,r.loadoutVersion]),request.map(r=>[r.recordIndex,r.preset,1]));
 assert.equal(sha(normalized.decoded),'252b545e90922caef90d7818f96eb4daaed6f1bb2268e92bcb77c329d08a0ee4');
 assert.deepEqual(readUnitRestorationPrefix(x.b,x.root,structuredClone(storage),baseLength,gameId),request);
 const at=x.root[27].start+x.table.offsets[50],cell=x.root[11].start+50*4,nameAt=cell+view(x.b).getInt32(cell);
 assert.deepEqual([at,cell,nameAt],[39464,364,35876]);
 const normalizeAfter=mutate=>{const y=open(repacked);mutate(y.b);return normalizeUnitRestorations(y.b,y.root,y.table,weapons,profile,gameId);};
 // Fixed header bytes and weapon entries must match exactly; bytes 19 and 30 are masked numeric fields.
 for(const [offset,bit]of [[2,1],[7,1],[9,1],[48,128],[51,1]])assert.equal(normalizeAfter(b=>{b[at+offset]^=bit;}),null,`header byte ${offset}`);
 for(const offset of [19,30])assert.equal(normalizeAfter(b=>{b[at+offset]^=1;}).restorations.length,5,`masked byte ${offset}`);
 for(const target of [cell+3,nameAt]){
  const y=open(repacked);y.b[target]^=1;
  assert.throws(()=>readUnitRestorationPrefix(y.b,y.root,structuredClone(storage),baseLength,gameId),error=>error.code==='EDITOR_UNIT_RESTORATION_INVALID'&&error.details?.reason==='name');
  assert.equal(normalizeAfter(b=>{b[target]^=1;}),null);
 }
});

test('F07 inline auxiliary pack/expand round trip is pinned and reopens from a byteOffset view',()=>{
 const GAME='srwf-f',count=400,baseLength=409836,size=count*4,empty=unitFiller(GAME),normal=empty.slice();normal[8]=1;
 const active=new Uint8Array(size+count*54);
 for(let id=0;id<count;id++){view(active).setInt32(id*4,size+id*54-id*4);active.set(id<count-12?normal:empty,size+id*54);}
 const storage={start:20000,length:active.length,restoration:{slots:Array.from({length:12},(_,i)=>({recordIndex:count-12+i}))}};
 const logical=new Uint8Array(baseLength+active.length),d=view(logical);
 d.setUint32(0,164);d.setInt32(108,baseLength-108);d.setInt32(112,storage.start+storage.length-112);d.setInt32(56,4000-56);d.setInt32(116,9500-116);d.setUint32(9500,1280*4);d.setInt32(144,60000-144);
 for(let id=0;id<1280;id++)d.setInt32(4000+4*id,15000-4000-4*id);
 logical[15000]=255;logical.fill(71,tsrRuntimeLimit(GAME),baseLength);logical.set(active,baseLength);
 const source=compactUnitStorage(logical,storage,GAME),staged=new Uint8Array(source.length+200);staged.set(source);staged.fill(42,source.length);
 assert.equal(sha(source),'da0b5b01eb384b01d7b1e0439b4d681d46a73667532c3ce3ab6fd05a34cca98b');
 assert.deepEqual(fUnitOffsetLedgerDiagnostics(source),{version:6,rawBytes:401,storedBytes:401,savedBytes:0});
 const stored=packFInlineAuxiliary(staged,GAME,baseLength);
 assert.equal(stored.length,409836);
 assert.equal(sha(stored),'03cb5eeb7d25ade6f67712366f5f0cec3718002131eab8edcd143c81236f0463');
 assert.deepEqual(fUnitOffsetLedgerDiagnostics(stored),{version:7,rawBytes:401,storedBytes:64,savedBytes:337});
 assert.equal(fInlineAuxiliaryUsage(stored,GAME),216);
 for(const input of [stored,atOffset(stored)]){
  const expanded=expandFInlineAuxiliary(input,GAME);
  assert.equal(expanded.length,staged.length);assert.ok(expanded.subarray(baseLength).every(b=>b===42));
  assert.deepEqual(expandCompactUnitStorage(expanded.slice(0,baseLength),GAME),logical);
  assert.deepEqual(packFInlineAuxiliary(expanded,GAME,baseLength),stored);
 }
});
