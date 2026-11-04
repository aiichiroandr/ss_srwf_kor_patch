import assert from 'node:assert/strict';
import test from 'node:test';
import {readDialogueSpeakerOptions,loadDialogueSpeakerOptions} from '../assets/editor-dialogue-speakers.mjs';
import {pilotRecord,recordTable,tailOnlyRecord} from './helpers/synthetic-tsr.mjs';
import {packGreedy,referenceMode1Sector} from './helpers/synthetic-iso.mjs';

function rootFor(faces,mapping=faces.map((_,i)=>i)){
 const root=[];root[28]={bytes:recordTable(mapping,faces.map(face=>pilotRecord({header:[0x30|(face>>>8),face&255,0x0d,0x28]})))};return root;
}
function faceFile(counts,{badFace=-1,badVariant=-1,highCountFace=-1}={}){
 const frames=counts.map((count,face)=>{
  const headerEnd=6+16*count,decoded=new Uint8Array(headerEnd+32+count),view=new DataView(decoded.buffer);decoded[1]=count;if(face===highCountFace)decoded[0]=1;
  for(let i=0;i<count;i++){
   const h=i*16,pixels=headerEnd+32+i+2;decoded[h+3]=pixels>>>16;decoded[h+4]=pixels>>>8;decoded[h+5]=pixels&255;
   view.setUint16(h+10,2);view.setUint16(h+12,1);decoded[headerEnd+32+i]=0x11;
   if(face===badFace&&i===badVariant)view.setUint16(h+12,512);
  }
  const packed=packGreedy(decoded),framed=new Uint8Array(packed.length+2);framed[0]=0x70;framed.set(packed,2);return framed;
 });
 const tableBytes=counts.length*8,file=new Uint8Array(tableBytes+frames.reduce((n,b)=>n+b.length,0)),view=new DataView(file.buffer);let at=tableBytes;
 frames.forEach((frame,i)=>{view.setUint32(i*8,at-i*8);view.setUint32(i*8+4,at+frame.length-i*8-4);file.set(frame,at);at+=frame.length;});return file;
}

test('speakers follow packed pilot faces and actual frame counts, with stable immutable identities',()=>{
 const root=rootFor([0,2,1]),face=faceFile([1,1,4]),before=root[28].bytes.slice(),mediaBefore=face.slice();
 const result=readDialogueSpeakerOptions(root,face,{gameId:'srwf-f'});
 assert.deepEqual(result.speakerOptions.map(({pilotId,faceId,variantCount})=>({pilotId,faceId,variantCount})),[{pilotId:1,faceId:2,variantCount:4},{pilotId:2,faceId:1,variantCount:1}]);
 assert.equal(result.diagnostics.faceCount,3);assert.equal(result.diagnostics.invalidFaces.length,0);
 assert.deepEqual(readDialogueSpeakerOptions(root,face,{gameId:'srwf-f'}),result);assert.deepEqual(root[28].bytes,before);assert.deepEqual(face,mediaBefore);
 assert.ok(Object.isFrozen(result.speakerOptions[0]));assert.match(result.speakerOptions[0].identity,/^dialogue-speaker:1:[0-9a-f]{64}$/);
 assert.notEqual(readDialogueSpeakerOptions(root,face,{gameId:'srwf-final'}).speakerOptions[0].identity,result.speakerOptions[0].identity);
 const moved=rootFor([0,1,2]);assert.notEqual(readDialogueSpeakerOptions(moved,face,{gameId:'srwf-f'}).speakerOptions[0].identity,result.speakerOptions[0].identity);
 const first=new DataView(root[28].bytes.buffer).getInt32(4)+4;root[28].bytes[first+11]^=1;
 assert.equal(readDialogueSpeakerOptions(root,face,{gameId:'srwf-f'}).speakerOptions[0].identity,result.speakerOptions[0].identity,'editable pilot numeric bytes do not change speaker identity');
});

test('a valid first frame does not authorize a corrupt later expression',()=>{
 const result=readDialogueSpeakerOptions(rootFor([0,2,1]),faceFile([1,1,4],{badFace:2,badVariant:3}),{gameId:'srwf-final'});
 assert.deepEqual(result.speakerOptions.map(row=>row.pilotId),[2]);
 assert.deepEqual(result.diagnostics.invalidFaces,[{faceId:2,reason:'invalid-image-frame'}]);
 assert.equal(result.diagnostics.excluded[0].reason,'invalid-face-block');
 const highCount=readDialogueSpeakerOptions(rootFor([0,1]),faceFile([1,1],{highCountFace:1}),{gameId:'srwf-final'});
 assert.equal(highCount.speakerOptions.length,0);assert.equal(highCount.diagnostics.invalidFaces[0].reason,'invalid-image-count','native count is BE16, not just its low byte');
});

test('zero, missing actual frames, shared records and all hero roles have no fallback',()=>{
 const root=rootFor(Array(321).fill(1)),b=root[28].bytes;
 // A regular fixed-face record remains available; dynamic heads/lists do not.
 const result=readDialogueSpeakerOptions(root,faceFile([1,4]),{gameId:'srwf-final'});
 assert.ok(result.speakerOptions.some(row=>row.pilotId===301));assert.ok(!result.speakerOptions.some(row=>row.pilotId>=302&&row.pilotId<=311));
 assert.equal(result.diagnostics.excluded.filter(row=>row.reason==='runtime-hero').length,10);
 const alias=rootFor([0,1,1],[0,0,1,1,2]),shared=readDialogueSpeakerOptions(alias,faceFile([1,4]),{gameId:'srwf-final'});
 assert.deepEqual(shared.speakerOptions.map(row=>row.pilotId),[4]);assert.ok(shared.diagnostics.excluded.some(row=>row.reason==='shared-pilot-record'));
 const absent=readDialogueSpeakerOptions(rootFor([0,0,3]),faceFile([1,4]),{gameId:'srwf-f'});
 assert.equal(absent.speakerOptions.length,0);assert.deepEqual(absent.diagnostics.excluded.map(row=>row.reason),['no-fixed-face','face-out-of-range']);
 assert.ok(b.length>0);
});

test('a headless list that happens to encode a face ID is excluded',()=>{
 const root=[];root[28]={bytes:recordTable([0,1],[pilotRecord(),tailOnlyRecord([[1,1],[2,1],[3,1],[4,1],[5,1],[6,1]],12)])};
 const result=readDialogueSpeakerOptions(root,faceFile([1,1,1,1]),{gameId:'srwf-f'});
 assert.equal(result.speakerOptions.length,0);assert.equal(result.diagnostics.excluded[0].reason,'headless-list');
});

test('malformed global FACE source fails closed, while an invalid individual block is isolated',()=>{
 assert.throws(()=>readDialogueSpeakerOptions(rootFor([0,1]),new Uint8Array(8),{gameId:'srwf-f'}),{code:'EDITOR_DIALOGUE_SPEAKERS_INVALID'});
 assert.throws(()=>readDialogueSpeakerOptions(rootFor([0,1]),faceFile([1,1]),{gameId:'other'}),{code:'EDITOR_DIALOGUE_SPEAKERS_INVALID'});
 const face=faceFile([1,1]),view=new DataView(face.buffer);view.setUint32(12,0xffffffff);
 const result=readDialogueSpeakerOptions(rootFor([0,1]),face,{gameId:'srwf-f'});assert.equal(result.speakerOptions.length,0);assert.equal(result.diagnostics.invalidFaces.length,1);
});

test('the session wrapper reads only its bounded FACE extent and returns no media bytes',async()=>{
 const root=rootFor([0,1]),face=faceFile([1,4]),user=new Uint8Array(2048);user.set(face);
 const session={sessionToken:'synthetic-face-session',root,descriptor:{gameId:'srwf-f'},sourceBlob:new Blob([referenceMode1Sector(0,user)]),mediaFiles:{face:{extentLba:0,byteLength:face.length}}};
 assert.deepEqual(await loadDialogueSpeakerOptions(session),readDialogueSpeakerOptions(root,face,{gameId:'srwf-f'}));
 await assert.rejects(loadDialogueSpeakerOptions({...session,mediaFiles:{face:{extentLba:0,byteLength:17*1024*1024}}}),{code:'EDITOR_DIALOGUE_SPEAKERS_INVALID'});
});
