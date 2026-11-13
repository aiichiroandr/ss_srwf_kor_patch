import assert from 'node:assert/strict';
import test from 'node:test';

import {dataRecordOffsets,exportEditedImage,preflightEditedImage,requirePhysicalResourcePlans,splitRootSegments} from '../assets/editor-core.mjs';
import {echoRequest} from './helpers/synthetic-iso.mjs';
import {makeBase} from './helpers/synthetic-game.mjs';

const codeIs=code=>error=>error?.code===code;

async function fixture(options={}){
 const base=await makeBase(options),session=base.opened.session,rows=base.opened.view;
 const request=echoRequest(session,rows,(kind,row,fields)=>{if(kind==='unit'&&row.recordIndex===1)fields.hp=(fields.hp+1)&0xffff;});
 return {session,request};
}

test('authenticated synthetic editor session runs effective-data checks in both preflight and export',async()=>{
 const {session,request}=await fixture(),before=await session.sourceBlob.arrayBuffer();
 const preflight=await preflightEditedImage(session,request);
 assert.equal(preflight.schema,'srwf.editor-storage-budget.v1');
 const written=await exportEditedImage(session,request);
 assert.ok(written.outputBlob instanceof Blob);
 assert.notEqual(written.outputBlob,session.sourceBlob);
 assert.deepEqual(new Uint8Array(await session.sourceBlob.arrayBuffer()),new Uint8Array(before),'preflight/export do not mutate the authenticated source');
});

test('both composition paths reject a malformed post-edit weapon reference on an authenticated fixture',async()=>{
 const {session,request}=await fixture({unitWeapons:{1:[{slot:1,weapon:1}]}}),before=await session.sourceBlob.arrayBuffer();
 const corrupt={afterEffectiveData(decoded){
   const root=splitRootSegments(decoded),table=dataRecordOffsets(root[27].bytes,48),row=table.records.find(entry=>entry.recordIndex===1);
   root[27].bytes[row.start+48]=2; // declared count now exceeds its terminating list
 }};
 for(const operation of [preflightEditedImage,exportEditedImage])await assert.rejects(operation(session,request,{testSeam:corrupt}),codeIs('EDITOR_OUTPUT_STRUCTURE_INVALID'));
 assert.deepEqual(new Uint8Array(await session.sourceBlob.arrayBuffer()),new Uint8Array(before));
});

test('physical ISO plan cannot expand across an authenticated live TSR allocation',async()=>{
 const {session}=await fixture();
 const bad={extentLba:session.file.extentLba+1,byteLength:session.file.byteLength};
 await assert.rejects(requirePhysicalResourcePlans(session.sourceBlob,[{label:'overlap probe',file:bad}]),codeIs('EDITOR_OUTPUT_ALLOCATION_INVALID'));
});

test('final candidate read-back rejects post-writer corruption without replacing source/request',async()=>{
 const {session,request}=await fixture(),before=await session.sourceBlob.arrayBuffer();
 await assert.rejects(exportEditedImage(session,request,{testSeam:{afterFinalWrite:async blob=>{
   const bytes=new Uint8Array(await blob.arrayBuffer());
   // Damage the final TSR sector after every normal writer. The final output
   // reader, rather than a receipt comparison, must refuse its checksum.
   bytes[session.file.extentLba*2352+2064]^=1;
   return new Blob([bytes]);
 }}}),codeIs('EDITOR_SECTOR_CHECKSUM'));
 assert.deepEqual(new Uint8Array(await session.sourceBlob.arrayBuffer()),new Uint8Array(before));
 assert.equal(request.unitEdits.find(row=>row.recordIndex===1).fields.hp!==undefined,true);
});
