import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildDisc,rewriteUserSectors} from './helpers/synthetic-iso.mjs';

const script=new URL('./helpers/f-alice-probe.mjs',import.meta.url);
function nativeDefinitions(){return [
 {srw4Native:true,recordIndex:430,preset:'s-gundam',root:430,kind:1,form:0,group:'s-cruiser'},
 {srw4Native:true,recordIndex:431,preset:'s-g-cruiser',root:430,kind:1,form:1,group:'s-cruiser'},
 {srw4Native:true,recordIndex:440,preset:'ex-s-gundam',root:440,kind:1,form:0,group:'ex-s-cruiser'},
 {srw4Native:true,recordIndex:441,preset:'g-cruiser',root:440,kind:1,form:1,group:'ex-s-cruiser'},
 {srw4Native:true,recordIndex:450,preset:'sirbine',root:null,kind:0,form:0,group:null},
 {srw4Native:true,recordIndex:451,preset:'zwauss',root:null,kind:0,form:0,group:null},
 {srw4Native:true,recordIndex:452,preset:'blood-temple',root:null,kind:0,form:0,group:null}
];}

test('F ALICE probe import is inert and its arguments fail closed',async()=>{
 const before=process._getActiveHandles().length;
 const probe=await import(script);
 assert.equal(typeof probe.main,'function');
 assert.throws(()=>probe.parseArgs([]),/Usage/);
 assert.throws(()=>probe.parseArgs(['--stock','a','--stock','b','--rev1','c','--out','d']),/Usage/);
 assert.throws(()=>probe.parseArgs(['--stock','a','--rev1','c','--out']),/Missing value/);
 assert.equal(process._getActiveHandles().length,before);
});

test('F ALICE probe refuses an existing output directory without touching it',async()=>{
 const {main}=await import(script),root=await fs.mkdtemp(path.join(os.tmpdir(),'srwf-f-probe-'));
 const out=path.join(root,'already-there'),sentinel=path.join(out,'keep.txt');await fs.mkdir(out);await fs.writeFile(sentinel,'unchanged');
 await assert.rejects(main(['--stock',path.join(root,'stock.bin'),'--rev1',path.join(root,'rev1.sfc'),'--out',out]),/EEXIST/);
 assert.equal(await fs.readFile(sentinel,'utf8'),'unchanged');await fs.rm(root,{recursive:true,force:true});
});

test('F ALICE probe range overlap uses half-open byte ranges',async()=>{
 const {rangesOverlap}=await import(script);
 assert.equal(rangesOverlap({start:0,end:1},{start:1,end:2}),false);
 assert.equal(rangesOverlap({start:0,end:2},{start:1,end:3}),true);
 assert.equal(rangesOverlap({start:4,end:8},{start:0,end:4}),false);
});

test('F probe accepts all seven definitions, using recordIndex for standalone hull identities',async()=>{
 const {validateNativeDefinitions}=await import(script),definitions=validateNativeDefinitions(nativeDefinitions());
 assert.deepEqual(definitions.filter(row=>['sirbine','zwauss','blood-temple'].includes(row.preset)).map(row=>[row.preset,row.saveIdentity,row.groupingSource]),[
  ['sirbine',450,'recordIndex (standalone hull)'],['zwauss',451,'recordIndex (standalone hull)'],['blood-temple',452,'recordIndex (standalone hull)']
 ]);
 assert.equal(new Set(definitions.map(row=>row.saveIdentity)).size,5);
});

test('F probe rejects missing/mismatched pair roots or forms and invented singleton transforms',async()=>{
 const {validateNativeDefinitions}=await import(script);
 const missing=nativeDefinitions();missing[1].root=null;
 assert.throws(()=>validateNativeDefinitions(missing),/s-cruiser transform coordinates/);
 const wrongRoot=nativeDefinitions();wrongRoot[3].root=441;
 assert.throws(()=>validateNativeDefinitions(wrongRoot),/ex-s-cruiser transform coordinates/);
 const wrongForm=nativeDefinitions();wrongForm[3].form=0;
 assert.throws(()=>validateNativeDefinitions(wrongForm),/ex-s-cruiser transform coordinates/);
 const invented=nativeDefinitions();invented[4].root=430;
 assert.throws(()=>validateNativeDefinitions(invented),/unexpected transform group/);
 const singletonForm=nativeDefinitions();singletonForm[4].form=2;
 assert.throws(()=>validateNativeDefinitions(singletonForm),/unexpected transform group/);
  const nullKind=nativeDefinitions();nullKind[4].kind=null;
  assert.throws(()=>validateNativeDefinitions(nullKind),/unexpected transform group/);
  const nullForm=nativeDefinitions();nullForm[4].form=null;
  assert.throws(()=>validateNativeDefinitions(nullForm),/unexpected transform group/);
  const singletonKind=nativeDefinitions();singletonKind[4].kind=1;
  assert.throws(()=>validateNativeDefinitions(singletonKind),/unexpected transform group/);
  const singletonGroup=nativeDefinitions();singletonGroup[4].group='bogus';
  assert.throws(()=>validateNativeDefinitions(singletonGroup),/unexpected transform group/);
});

test('F probe rejects missing or duplicated expected presets',async()=>{
 const {validateNativeDefinitions}=await import(script);
 assert.throws(()=>validateNativeDefinitions(nativeDefinitions().slice(0,-1)),/exactly seven native definitions/);
 const duplicate=nativeDefinitions();duplicate[6]={...duplicate[6],preset:'zwauss'};
 assert.throws(()=>validateNativeDefinitions(duplicate),/one unique definition/);
});

test('F probe reads the exact accepted index row and release descriptor schema',async()=>{
 const {acceptedRelease,descriptorFromManifest}=await import(script),release=await acceptedRelease();
 assert.equal(release.manifest.id,'srwf-f-20260928-v0-5-a');assert.equal(release.manifest.state,'ACCEPTED');
 assert.equal(release.descriptor.patchSize,release.manifest.patch.size);assert.equal(release.descriptor.patchSha256,release.manifest.patch.sha256);
 assert.equal(release.descriptor.sourceSha256,release.manifest.source.sha256);assert.equal(release.descriptor.targetSha256,release.manifest.target.sha256);
 assert.throws(()=>descriptorFromManifest({...release.manifest,patch:{...release.manifest.patch,patchSize:1}}),/public schema/);
});

test('F probe locates normalized extent keys and reads the IP slot in logical CD user data',async()=>{
 const {probeFiles}=await import(script),base=buildDisc({slot:new Uint8Array([1]),extraFiles:[{name:'0',bytes:new Uint8Array([2])}]}),changed=rewriteUserSectors(base.image,new Map([[2,user=>{user[0x1300-2048*2]=0x7f;}]]));
 const report=await probeFiles(base.blob,new Blob([changed]));
 assert.equal(report.exec.byteLength,1);assert.equal(report.tsr.byteLength,1);assert.equal(report.face.byteLength,64);
 assert.equal(report.proposedIpSlot.allZero,false);assert.equal(report.proposedIpSlot.changedIntersection,true);
});

test('F probe source binds Node Blob API, echo helper, logical IP extent and streaming output',async()=>{
 const source=await fs.readFile(script,'utf8');
 assert.match(source,/import fs, \{ openAsBlob \} from 'node:fs'/);assert.match(source,/import \{ echoRequest \} from '\.\/synthetic-iso\.mjs'/);
 assert.match(source,/readCdUserExtent\(accepted,0,IP_BYTES\)/);assert.match(source,/exclusiveWriteBlob\(path\.join\(args\.out,bin\),output\.outputBlob\)/);
 assert.match(source,/inspectPatchedImage\(accepted\.blob,acceptedDescriptor/);assert.match(source,/inspectPatchedImage\(output\.outputBlob,acceptedDescriptor/);
 assert.doesNotMatch(source,/accepted\.outputBlob/);assert.doesNotMatch(source,/output\.outputBlob\.arrayBuffer\(\)/);
});