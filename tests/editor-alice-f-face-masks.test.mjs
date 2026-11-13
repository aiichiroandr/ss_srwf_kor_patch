import test from 'node:test';
import assert from 'node:assert/strict';
import {ALICE_F_FACE_MASK_PINS,aliceFFaceMasks} from '../assets/editor-alice-f-face-masks.mjs?v=20261113-alicecopies1';
import {Sha256} from '../assets/sha256.mjs?v=20261113-alicecopies1';
import {PRODUCTION_TRUST,createEditorInspector} from '../assets/editor-core.mjs?v=20261113-alicecopies1';

const rawMaskSha256=profile=>new Sha256().update(new TextEncoder().encode(JSON.stringify(profile.rawMasks))).hex();
const faceGeometry=Object.freeze({extentLba:692,byteLength:343462});
const expectedPins=Object.freeze([
 ['b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9','32eb0145d21c5a4de66dd436aa25bab88c4ce8a06f7bf91c8106995a4cb1e61b','e74cbc577ee3e13167326ceb689db68992b5c288440310eb63dde96911661105'],
 ['85b9cbf349c421d621f3a6e6819d94f9ee1405137430046469562a2176e798a3','32eb0145d21c5a4de66dd436aa25bab88c4ce8a06f7bf91c8106995a4cb1e61b','73a07c7d5366cb0c8fef15738a609f41fa56e50e3d642575da6b9b45ee8317c5'],
 ['75555116f784115e7104c593fd990491ae182b9493d9f159201e17b3e3d88202','32eb0145d21c5a4de66dd436aa25bab88c4ce8a06f7bf91c8106995a4cb1e61b','ec0efde4743cdb0c1a222842d77c5b517ce4e6c92710e4fb84992eec0ca1cefb'],
 ['b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9','251a7dfbf6a4e729b70e824a96737ed14ea54efa0c4a87a89b3966c33e611eda','ca5357be6d3d66e27b616a7c9b41a4fa614ce8c227b9a2a0e8968b3d15ac486e'],
 ['85b9cbf349c421d621f3a6e6819d94f9ee1405137430046469562a2176e798a3','251a7dfbf6a4e729b70e824a96737ed14ea54efa0c4a87a89b3966c33e611eda','64d9f6fba120b5d365485159bc701c9f1b41d58bdafb273f0e1bd12adb8bb675'],
 ['75555116f784115e7104c593fd990491ae182b9493d9f159201e17b3e3d88202','251a7dfbf6a4e729b70e824a96737ed14ea54efa0c4a87a89b3966c33e611eda','c64268ca45ada050e64fcb68fe3c1fc0bc15749990980290b3c328d41bf1217c'],
]);
const pairKey=(base,rawMask)=>`${base}:${rawMask}`;
const fProfiles=PRODUCTION_TRUST.profiles.filter(profile=>expectedPins.some(([base])=>base===profile.baseTargetSha256));
const maskCovers=(masks,offset)=>masks.some(([start,length])=>start<=offset&&offset<start+length);

test('F FACE pin matrix contains exactly the six source-derived base/raw-mask pairs',()=>{
 assert.equal(ALICE_F_FACE_MASK_PINS.length,6);
 assert.deepEqual(ALICE_F_FACE_MASK_PINS.map(pin=>[pin.baseSha256,pin.rawMaskSha256,pin.expected]),expectedPins);
 assert.equal(new Set(ALICE_F_FACE_MASK_PINS.map(pin=>pairKey(pin.baseSha256,pin.rawMaskSha256))).size,6);
 assert.ok(ALICE_F_FACE_MASK_PINS.every(pin=>pin.extentLba===faceGeometry.extentLba&&pin.byteLength===faceGeometry.byteLength));
});

test('F FACE matrix selects each actual production base and raw-mask profile exactly',()=>{
 const productionPairs=new Set(fProfiles.map(profile=>pairKey(profile.baseTargetSha256,rawMaskSha256(profile))));
 assert.deepEqual([...new Set(fProfiles.map(profile=>profile.rawMasks.length))].sort((a,b)=>a-b),[101,694]);
 assert.deepEqual([...productionPairs].sort(),expectedPins.map(([base,rawMask])=>pairKey(base,rawMask)).sort());
 for(const [base,rawMask,expected] of expectedPins){
  const profile=fProfiles.find(candidate=>candidate.baseTargetSha256===base&&rawMaskSha256(candidate)===rawMask);
  assert.ok(profile,`missing production profile ${base}/${rawMask}`);
  const result=aliceFFaceMasks(profile,faceGeometry);
  assert.ok(result);
  assert.equal(result.expected,expected);
 }
});

test('F FACE masks reject caller-selected raw-mask hashes and non-game geometry',()=>{
 const profile=fProfiles[0],accepted=aliceFFaceMasks(profile,faceGeometry);
 assert.ok(accepted);
 assert.equal(aliceFFaceMasks({...profile,rawMasks:[[0,1,255]],rawMaskSha256:ALICE_F_FACE_MASK_PINS[0].rawMaskSha256},faceGeometry),null);
 assert.equal(aliceFFaceMasks({...profile,rawMaskSha256:'0'.repeat(64)},{extentLba:faceGeometry.extentLba+1,byteLength:faceGeometry.byteLength}),null);
 assert.equal(aliceFFaceMasks({...profile,rawMaskSha256:'0'.repeat(64)},{extentLba:faceGeometry.extentLba,byteLength:faceGeometry.byteLength-1}),null);
 assert.equal(aliceFFaceMasks({...profile,baseTargetSha256:'0'.repeat(64)},faceGeometry),null);
});

test('F FACE masking adds only stored FACE user bytes and sector checksums',()=>{
 const profile=fProfiles[0],result=aliceFFaceMasks(profile,faceGeometry);
 assert.ok(result);
 const sectors=Math.ceil(faceGeometry.byteLength/2048),lastLba=faceGeometry.extentLba+sectors-1;
 const lastUserStart=lastLba*2352+16,lastStoredEnd=lastUserStart+(faceGeometry.byteLength-(sectors-1)*2048);
 assert.equal(maskCovers(result.masks,faceGeometry.extentLba*2352+16),true);
 assert.equal(maskCovers(result.masks,lastStoredEnd-1),true);
 assert.equal(maskCovers(result.masks,lastLba*2352+2064),true);
 // FACE.BIN ends 602 bytes before the final sector's checksum bytes.  Those
 // sector padding bytes are intentionally not made writable by this helper.
 assert.equal(Array.from({length:602},(_,index)=>maskCovers(result.masks,lastStoredEnd+index)).every(masked=>!masked),true);
});

test('core keeps the Fv2 integration behind a complete inspector trust',()=>{
 assert.throws(()=>createEditorInspector({targets:{},profiles:[],latestGroups:null}),/editor trust/i);
});
