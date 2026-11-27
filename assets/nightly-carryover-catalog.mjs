import {Sha256,sha256Hex} from './sha256.mjs?v=20261113-alicecopies1&nightly=20261128-1';
import {locateIsoFiles,readCdUserExtent,decompressTsr,decodeFramedLz,splitRootSegments,buildEditorRows}
  from './editor-core.mjs?v=20261113-alicecopies1&savefast=20261114-6&f65fix=20261116-1&editorcompat=20261125-1';
import {readAlicePilot} from './editor-alice.mjs?v=20261113-alicecopies1&nightly=20261128-1';
import {expandFinalInlineAuxiliary} from './editor-final-inline-aux.mjs?v=20261113-alicecopies1&nightly=20261128-1';
import {readWeaponNames} from './editor-weapon-names.mjs?v=20261113-alicecopies1&nightly=20261128-1';
import {readWeaponCloneManifest} from './editor-weapon-clone.mjs?v=20261113-alicecopies1&nightly=20261128-1';
import {expandCompactUnitStorage} from './editor-unit-compact.mjs?v=20261113-alicecopies1&nightly=20261128-1';
// Dedicated receiving catalog. It never registers an editor base,
// returns a session, opens changed/derived Nightly media, or writes any disc.
const NIGHT='d410df9bc9f268b671d83af54bc0cb1ccbd2bfea21172d6c1a3109f876f6b69c';
const families=[
 [430,'s-gundam','S건담',1,0,'s-cruiser',430,498],
 [431,'s-g-cruiser','S건담G크루저',1,1,'s-cruiser',430,502],
 [432,'ex-s-gundam','Ex-S건담',1,0,'ex-s-cruiser',432,499],
 [433,'g-cruiser','G크루저',1,1,'ex-s-cruiser',432,503],
 [434,'sirbine','서바인',0,0,null,null,500],
 [435,'zwauss','즈와우스',0,0,null,null,501],
 [436,'blood-temple','블러드템플',0,0,null,null,62],
];
const digest=sha256Hex;
const assert=Object.assign((condition,message)=>{if(!condition)throw Error(message??"Nightly 승계용 기체 데이터를 확인하지 못했습니다.");},{
 equal:(a,b,message)=>{if(a!==b)throw Error(message??"Nightly 승계 데이터가 다릅니다.");},
 deepEqual:(a,b)=>{if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw Error("Nightly ALICE 연결이 다릅니다.");}
});
async function shaBlob(blob){
 const h=new Sha256();
 for(let p=0;p<blob.size;p+=1048576)h.update(new Uint8Array(await blob.slice(p,p+1048576).arrayBuffer()));
 return h.hex();
}
export async function readNightlyCarryoverCatalog(blob) {
 const gameId='srwf-final';
 assert.equal(blob.size,644650272,'Nightly size mismatch');
 assert.equal(await shaBlob(blob),NIGHT,'Nightly SHA-256 mismatch');
 const header=new TextDecoder('latin1').decode(await blob.slice(16,112).arrayBuffer());
 assert(header.startsWith('SEGA SEGASATURN')&&header.includes('T-20612G'),'Unexpected Final header');
 const files=await locateIsoFiles(blob,undefined,['TSR.BIN','FACE.BIN','KOM.PAC']);
 const read=n=>readCdUserExtent(blob,files[n].extentLba,files[n].byteLength);
 const kom=decodeFramedLz(await read('kom.pac'),131072).output;
 assert.equal(digest(kom),'326624e28afb16bec434b3381d5cae94c531b72c521d570615ae0b27a89b9abe');
 // This exact private ALICE carrier is compact (flag 4); public editor rejection
 // is deliberate. Check the newly reviewed immutable physical body and recover
 // the four documented table-pointer words into a read-only parse scratch copy.
 const e=expandFinalInlineAuxiliary(decompressTsr(await read('tsr')),gameId);
 const v=new DataView(e.buffer,e.byteOffset,e.length),t=e.length-16,n=v.getUint32(t+8),flags=v.getUint32(t+12);
 const face=await read('face');
 assert.equal(new TextDecoder('latin1').decode(e.slice(t,t+8)),'SRWALC04');
 assert.equal(n,458936);
 assert.equal(flags,7);
 assert.equal(v.getUint32(n+16),flags);
 assert.equal(e[n+22],4);
 assert.deepEqual(Array.from({length:4},(_,i)=>v.getUint16(n+24+i*2)),[430,431,432,433]);
 assert(face.length>0);
 const a=e.slice(0,n),aView=new DataView(a.buffer);
 const cellTarget=p=>p+aView.getInt32(p);
 const pointers=[[cellTarget(48)+399*4,n],[cellTarget(52)+399*4,n+4],[8,n+8],[cellTarget(112)+399*4,n+12]];
 for(const [p,q] of pointers){
  const target=p+v.getInt32(q);assert(p>=0&&p+4<=a.length&&target>=144&&target<a.length);
  aView.setInt32(p,v.getInt32(q));
 }
 const expanded=expandFinalInlineAuxiliary(a,gameId);
 const names=readWeaponNames(expanded,gameId), clones=readWeaponCloneManifest(names.decoded,gameId,{staging:true});
 const decoded=clones.decoded;
 const c=buildEditorRows(splitRootSegments(decoded),decoded,gameId,null,[]);
 for(const [id,preset,name,kind,form,group,root,icon] of families){
  const row=c.units.find(x=>x.recordIndex===id);
  assert(row&&row.name.normalize('NFKC').replace(/\s+/gu,'')===name&&row.saveUnitKind===kind&&row.saveUnitForm===form&&row.mapIcon===icon, JSON.stringify({id,row:row&&{name:row.name,kind:row.saveUnitKind,form:row.saveUnitForm,icon:row.mapIcon}}));
  row.srw4Native=true;
  row.construction={preset};
  if(group){row.constructionGroup=group;row.constructionGroupRoot=root;}
 }
 return {gameId,targetHash:NIGHT,srw4Installed:{aliceEnabled:true},units:c.units,weapons:c.weapons,partNames:c.partNames};
}
