#!/usr/bin/env node
// Local-only F ALICE port probe. It writes only under the explicitly supplied
// new output directory and intentionally leaves ALICE registration disabled.
import fs, { openAsBlob } from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parsePatch, buildVerifiedPatchedBlob } from '../../assets/patch-core.mjs';
import { inspectPatchedImage, prepareSrw4EditorSource, attachSrw4EditorSource, exportEditedImage, locateIsoFiles, readCdUserExtent } from '../../assets/editor-core.mjs';
import { planSrw4UnusedImport } from '../../assets/editor-srw4-unused.mjs';
import { unitWeaponFields, UNIT_WEAPON_FIELDS } from '../../assets/editor-loadout.mjs';
import { echoRequest } from './synthetic-iso.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const RELEASE='srwf-f-20260928-v0-5-a';
const IP_SLOT={offset:0x1300,length:1024};
const IP_BYTES=0x8000;
const EXEC_RAM_BASE=0x06004000;
const PILOT_FUNCTIONS=Object.freeze([
 {kind:'pilotCreate',start:0x0602a208,end:0x0602a330},
 {kind:'pilotFillSP',start:0x06029370,end:0x06029400},
 {kind:'pilotList',start:0x06029700,end:0x06029e08},
 {kind:'actorList',start:0x0604db50,end:0x0604dcb0},
]);
const F_CUE_TRACKS=Object.freeze(['TRACK 01 MODE1/2352','INDEX 01 00:00:00','TRACK 02 MODE2/2352','INDEX 00 22:34:18','INDEX 01 22:36:18','TRACK 03 MODE1/2352','INDEX 01 54:15:41','TRACK 04 AUDIO','INDEX 01 54:26:37']);

function fail(message){const error=new Error(message);error.code='F_ALICE_PROBE';throw error;}
export function parseArgs(argv){
 const values={};
 for(let i=0;i<argv.length;i++){
  const key=argv[i];if(!['--stock','--rev1','--out'].includes(key)||values[key])fail('Usage: node tests/helpers/f-alice-probe.mjs --stock <original-F> --rev1 <SRW4-Rev1-ROM-or-zip> --out <new-output-directory>');
  const value=argv[++i];if(!value||value.startsWith('--'))fail(`Missing value for ${key}.`);values[key]=path.resolve(value);
 }
 if(Object.keys(values).length!==3)fail('Usage: node tests/helpers/f-alice-probe.mjs --stock <original-F> --rev1 <SRW4-Rev1-ROM-or-zip> --out <new-output-directory>');
 return {stock:values['--stock'],rev1:values['--rev1'],out:values['--out']};
}
export function rangesOverlap(left,right){return left.start<right.end&&right.start<left.end;}
function changedRanges(before,after){
 if(before.length!==after.length)fail('Accepted and editor output images have different lengths.');
 const ranges=[];let start=null;
 for(let i=0;i<before.length;i++)if(before[i]!==after[i]){if(start===null)start=i;}else if(start!==null){ranges.push({start,end:i});start=null;}
 if(start!==null)ranges.push({start,end:before.length});return ranges;
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function hashFile(file){const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function hashBlob(blob){const hash=createHash('sha256');for await(const chunk of blob.stream())hash.update(chunk);return hash.digest('hex');}
const SHA256=/^[0-9a-f]{64}$/;
function localPath(relative,label){
 if(typeof relative!=='string'||relative.startsWith('/')||relative.includes('\\')||relative.includes('://'))fail(`Release ${label} is not a safe same-origin local path.`);
 const resolved=path.resolve(ROOT,relative);if(!resolved.startsWith(`${ROOT}${path.sep}`))fail(`Release ${label} escapes this checkout.`);return resolved;
}
function sha256Pin(value,label){if(typeof value!=='string'||!SHA256.test(value))fail(`Release ${label} is not a SHA-256 pin.`);return value;}
function exactKeys(value,keys,label){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail(`Release ${label} does not match the public schema.`);}
export function descriptorFromManifest(manifest){
 exactKeys(manifest.source,['profileId','size','sha256'],'source');exactKeys(manifest.target,['filename','cueFilename','size','sha256'],'target');exactKeys(manifest.patch,['format','size','sha256','recordCount','bodyUncompressedSize','url'],'patch');
 for(const [value,label] of [[manifest.source.size,'source size'],[manifest.target.size,'target size'],[manifest.patch.size,'patch size'],[manifest.patch.recordCount,'patch record count'],[manifest.patch.bodyUncompressedSize,'patch body size']])if(!Number.isSafeInteger(value)||value<1)fail(`Release ${label} is invalid.`);
 return Object.freeze({patchSize:manifest.patch.size,patchSha256:sha256Pin(manifest.patch.sha256,'patch SHA-256'),sourceSize:manifest.source.size,sourceSha256:sha256Pin(manifest.source.sha256,'source SHA-256'),targetSize:manifest.target.size,targetSha256:sha256Pin(manifest.target.sha256,'target SHA-256'),recordCount:manifest.patch.recordCount,bodyUncompressedSize:manifest.patch.bodyUncompressedSize});
}
export async function acceptedRelease(){
 const index=JSON.parse(await fsp.readFile(path.join(ROOT,'manifest/releases.json'),'utf8'));
 if(!Array.isArray(index.releases)||!Array.isArray(index.stock_profiles))fail('manifest/releases.json does not match the public release index schema.');
 const release=index.releases.find(row=>row?.id===RELEASE);if(!release||index.releases.filter(row=>row?.id===RELEASE).length!==1)fail(`Accepted release ${RELEASE} is absent or ambiguous in manifest/releases.json.`);
 if(release.state!=='ACCEPTED'||release.gameId!=='srwf-f'||typeof release.manifest!=='string'||!SHA256.test(release.manifestSha256??''))fail(`${RELEASE} is not the exact accepted F release row.`);
 const manifestPath=localPath(release.manifest,'manifest');const manifestText=await fsp.readFile(manifestPath,'utf8');
 if(sha(manifestText)!==release.manifestSha256)fail('Accepted release manifest hash does not match manifest/releases.json.');
 const manifest=JSON.parse(manifestText);
 if(manifest.id!==RELEASE||manifest.state!=='ACCEPTED'||manifest.schema!=='srwf-kor.public-release.v1')fail('Release manifest identity is not the accepted selected release.');
 const descriptor=descriptorFromManifest(manifest);const profile=index.stock_profiles.find(item=>item?.id===manifest.source.profileId);
 if(!profile||profile.gameId!==release.gameId||profile.size!==manifest.source.size||profile.sha256!==manifest.source.sha256)fail('Release source is not pinned by its F stock profile.');
 if(manifest.target.size!==manifest.source.size||manifest.patch.url!==`patches/${RELEASE}.srwfp`)fail('Release target or patch reference is not canonical.');
 return {descriptor,manifest,patchPath:localPath(manifest.patch.url,'patch')};
}
function rowsForImport(view){
 const units=structuredClone(view.units),weapons=structuredClone(view.weapons);
 for(const row of units){Object.assign(row,unitWeaponFields(row.weaponList));row.original={...row};row.restorationEligible=view.unitRestorationSlots.includes(row.recordIndex);row.weaponAdditions=[];}
 for(const row of weapons)row.original={...row};
 return {units,weapons};
}
function constructionRequest(opened,units,weapons){
 const request={...echoRequest(opened.session,{...opened.view,units,weapons}),alicePilot:false,
  unitRestorations:units.filter(row=>row.pendingConstruction).map(row=>({recordIndex:row.recordIndex,preset:row.pendingConstruction,loadoutVersion:row.construction.loadoutVersion})),
  weaponClones:weapons.filter(row=>row.pendingWeaponClone).map(row=>({recordIndex:row.recordIndex,sourceRecordIndex:row.weaponClone.sourceRecordIndex})),
  weaponNameEdits:weapons.filter(row=>row.pendingWeaponClone).map(row=>({recordIndex:row.recordIndex,text:row.name})),
  unitWeaponAdditions:units.filter(row=>row.weaponAdditions?.length).map(row=>({recordIndex:row.recordIndex,weapons:row.weaponAdditions})),srw4Native:true};
 for(const edit of request.unitEdits){const row=units.find(candidate=>candidate.recordIndex===edit.recordIndex);for(const key of ['killMoney','killExp','partSlots',...UNIT_WEAPON_FIELDS])if(Number.isInteger(row[key]))edit.fields[key]=row[key];}
 // F supports the pose only when the inspected session says it does. Do not
 // borrow Final defaults or force an unsupported component path.
 if(opened.session.exsBeamPose?.supported)request.exsBeamPose=opened.session.exsBeamPose.enabled===true;
 return request;
}
async function readFileExtent(blob,file){return readCdUserExtent(blob,file.extentLba,file.byteLength);}
export async function probeFiles(accepted,imported){
 const names=['0','TSR.BIN','FACE.BIN'];const before=await locateIsoFiles(accepted,undefined,names),after=await locateIsoFiles(imported,undefined,names);
 // IP.BIN occupies logical MODE1 user data at LBA 0. It is not the raw first
 // 0x8000 bytes of a 2352-byte image.
 const sourceIp=await readCdUserExtent(accepted,0,IP_BYTES),outputIp=await readCdUserExtent(imported,0,IP_BYTES);
 const report={ip:{extentLba:0,offset:0,length:IP_BYTES,sourceSha256:sha(sourceIp),sha256:sha(outputIp)}};
 for(const [label,key] of [['exec','0'],['tsr','tsr'],['face','face']]){
  const source=await readFileExtent(accepted,before[key]),output=await readFileExtent(imported,after[key]);
  const ranges=changedRanges(source,output);report[label]={extentLba:after[key].extentLba,byteLength:after[key].byteLength,sourceSha256:sha(source),sha256:sha(output),preserved:sha(source)===sha(output),changedRanges:ranges.map(r=>({start:r.start,end:r.end}))};
  if(label==='exec')report[label].pilotFunctionIntersections=PILOT_FUNCTIONS.map(p=>({kind:p.kind,start:p.start,end:p.end,fileStart:p.start-EXEC_RAM_BASE,fileEnd:p.end-EXEC_RAM_BASE,changed:ranges.some(r=>rangesOverlap(r,{start:p.start-EXEC_RAM_BASE,end:p.end-EXEC_RAM_BASE}))}));
 }
 const ipRanges=changedRanges(sourceIp,outputIp),slot={start:IP_SLOT.offset,end:IP_SLOT.offset+IP_SLOT.length};
 report.ip.changedRanges=ipRanges;report.proposedIpSlot={...IP_SLOT,allZero:outputIp.subarray(slot.start,slot.end).every(byte=>byte===0),changedIntersection:ipRanges.some(range=>rangesOverlap(range,slot)),hypothesis:true};
 return report;
}
async function exclusiveWrite(file,data){const handle=await fsp.open(file,'wx');try{await handle.writeFile(data);}finally{await handle.close();}}
async function exclusiveWriteBlob(file,blob){const handle=await fsp.open(file,'wx');try{for await(const chunk of blob.stream())await handle.write(chunk);}finally{await handle.close();}}
function cue(name){return `FILE "${name}" BINARY\r\n${F_CUE_TRACKS.map(line=>`  ${line}`).join('\r\n')}\r\n`;}
const NATIVE_PRESETS=Object.freeze(['s-gundam','s-g-cruiser','ex-s-gundam','g-cruiser','sirbine','zwauss','blood-temple']);
const NATIVE_PAIRS=Object.freeze([
 {group:'s-cruiser',base:'s-gundam',alternate:'s-g-cruiser'},
 {group:'ex-s-cruiser',base:'ex-s-gundam',alternate:'g-cruiser'}
]);
// linkExSCruiserRows authors kind-1 base/form-0 and cruiser/form-1 rows. The
// three other imported hulls are ordinary standalone records, not transforms.
export function validateNativeDefinitions(definitions){
 if(!Array.isArray(definitions)||definitions.length!==NATIVE_PRESETS.length)fail('Fresh inspector did not report exactly seven native definitions.');
 if(new Set(definitions.map(row=>row.recordIndex)).size!==definitions.length||definitions.some(row=>!Number.isInteger(row.recordIndex)||row.srw4Native!==true))fail('Fresh inspector reported invalid native record coordinates.');
 const byPreset=new Map();for(const row of definitions){
  if(!NATIVE_PRESETS.includes(row.preset)||byPreset.has(row.preset))fail('Fresh inspector did not report one unique definition for every expected preset.');
  byPreset.set(row.preset,row);
 }
 if(byPreset.size!==NATIVE_PRESETS.length||definitions.some(row=>/alice/i.test(row.preset??'')||/alice/i.test(row.group??'')))fail('Fresh inspector did not report the expected native definitions with ALICE absent.');
 for(const pair of NATIVE_PAIRS){
  const base=byPreset.get(pair.base),alternate=byPreset.get(pair.alternate),root=base.root;
  if(!Number.isInteger(root)||root!==base.recordIndex||alternate.recordIndex!==root+1
    ||alternate.root!==root||base.group!==pair.group||alternate.group!==pair.group
    ||base.kind!==1||alternate.kind!==1||base.form!==0||alternate.form!==1)fail(`Fresh inspector did not report valid ${pair.group} transform coordinates.`);
 }
 for(const preset of ['sirbine','zwauss','blood-temple']){
  const row=byPreset.get(preset);
  if(row.group!==null||row.root!==null||row.kind!==0||row.form!==0)fail(`Fresh inspector reported an unexpected transform group for ${preset}.`);
 }
 return definitions.map(row=>({...row,saveIdentity:row.root===null?row.recordIndex:row.root,groupingSource:row.root===null?'recordIndex (standalone hull)':'constructionGroupRoot'}));
}
export async function main(argv=process.argv.slice(2)){
 const args=parseArgs(argv);await fsp.mkdir(args.out,{recursive:false});
  let inspectedDefinitions=null;
 try{
  const inputHashes={stock:await hashFile(args.stock),rev1:await hashFile(args.rev1)};
  const release=await acceptedRelease();const parsed=await parsePatch(new Blob([await fsp.readFile(release.patchPath)]),release.descriptor);
  const stock=await openAsBlob(args.stock);const accepted=await buildVerifiedPatchedBlob(stock,parsed);
  if(accepted.targetSha256!==release.descriptor.targetSha256||accepted.blob.size!==release.descriptor.targetSize)fail('Patched target does not match the accepted release descriptor.');
  const acceptedDescriptor={gameId:'srwf-f',targetSize:release.descriptor.targetSize,targetSha256:release.descriptor.targetSha256,baseTargetSha256:release.descriptor.targetSha256,imageKind:'local'};
  const opened=await inspectPatchedImage(accepted.blob,acceptedDescriptor,{});
  const model=rowsForImport(opened.view),plan=planSrw4UnusedImport(model.units,model.weapons,'srwf-f');
  await attachSrw4EditorSource(opened.session,await prepareSrw4EditorSource(await openAsBlob(args.rev1)));
  const output=await exportEditedImage(opened.session,constructionRequest(opened,plan.units,plan.weapons),{});
  if(typeof output.sha256!=='string'||!SHA256.test(output.sha256)||output.outputBlob.size!==release.descriptor.targetSize||await hashBlob(output.outputBlob)!==output.sha256)fail('Editor export did not return a complete output Blob with its verified SHA-256.');
  // This is a personal derivative. Its trust anchor stays the accepted target;
  // output.sha256 is checked and reported separately, never promoted to a base.
  const reopened=await inspectPatchedImage(output.outputBlob,acceptedDescriptor,{});
  const definitions=validateNativeDefinitions(inspectedDefinitions=reopened.view.units.filter(row=>row.srw4Native).map(row=>({srw4Native:row.srw4Native,recordIndex:row.recordIndex,preset:row.construction?.preset??null,root:row.constructionGroupRoot??null,kind:row.saveUnitKind??null,form:row.saveUnitForm??null,group:row.constructionGroup??null})));
  // Standalone hulls intentionally use their record index; only cruiser pairs have roots.

  const files=await probeFiles(accepted.blob,output.outputBlob);
  const bin='SRWF-F-ALICE-PROBE.bin',cueName='SRWF-F-ALICE-PROBE.cue',reportName='SRWF-F-ALICE-PROBE-report.json';
  const preservedInputs={stock:(await hashFile(args.stock))===inputHashes.stock,rev1:(await hashFile(args.rev1))===inputHashes.rev1};if(!preservedInputs.stock||!preservedInputs.rev1)fail('An input changed while the probe was running.');
  const report={kind:'local-f-alice-port-probe',release:RELEASE,gameId:reopened.view.gameId,sourceSha256:inputHashes.stock,rev1Sha256:inputHashes.rev1,inputsPreserved:preservedInputs,acceptedTargetSha256:release.descriptor.targetSha256,outputSha256:output.sha256,definitions,files,cueTimingSource:'docs/F_V04_VALIDATION.md, CUE 구성: measured F raw-sector transitions and preserved track-2 index',pendingALICE:true,runtime:'not tested; this probe makes no runtime ownership claim',firstClear:'missing; no first-clear grant is claimed',caveats:['ALICE registration and crew remain disabled.','The proposed IP slot is a hypothesis only; a collision is not permission to choose another address.','No proprietary file bytes or assets are included in this report.']};
  await exclusiveWriteBlob(path.join(args.out,bin),output.outputBlob);await exclusiveWrite(path.join(args.out,cueName),cue(bin));await exclusiveWrite(path.join(args.out,reportName),`${JSON.stringify(report,null,2)}\n`);
  console.log(JSON.stringify({outputDirectory:args.out,report:path.join(args.out,reportName),outputSha256:output.sha256,slotCollision:report.files.proposedIpSlot.changedIntersection,slotAllZero:report.files.proposedIpSlot.allZero}));
  return report;
 }catch(error){
  // Preserve diagnostics in the new directory; never touch a pre-existing path.
  try{await exclusiveWrite(path.join(args.out,'SRWF-F-ALICE-PROBE-failure.json'),`${JSON.stringify({code:error.code??'ERROR',message:error.message,...(inspectedDefinitions?{definitions:inspectedDefinitions}:{})},null,2)}\n`);}catch{}
  throw error;
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(`${error.code??'ERROR'}: ${error.message}`);process.exitCode=1;});
