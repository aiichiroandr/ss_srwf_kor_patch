// Exact source-derived whole-disc pins with only authenticated F FACE sectors added.
import {Sha256} from './sha256.mjs?v=20261113-alicecopies1';

export const ALICE_F_FACE_MASK_PINS=Object.freeze([
 {"baseSha256":"b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9","rawMaskSha256":"32eb0145d21c5a4de66dd436aa25bab88c4ce8a06f7bf91c8106995a4cb1e61b","extentLba":692,"byteLength":343462,"expected":"e74cbc577ee3e13167326ceb689db68992b5c288440310eb63dde96911661105"},
 {"baseSha256":"85b9cbf349c421d621f3a6e6819d94f9ee1405137430046469562a2176e798a3","rawMaskSha256":"32eb0145d21c5a4de66dd436aa25bab88c4ce8a06f7bf91c8106995a4cb1e61b","extentLba":692,"byteLength":343462,"expected":"73a07c7d5366cb0c8fef15738a609f41fa56e50e3d642575da6b9b45ee8317c5"},
 {"baseSha256":"75555116f784115e7104c593fd990491ae182b9493d9f159201e17b3e3d88202","rawMaskSha256":"32eb0145d21c5a4de66dd436aa25bab88c4ce8a06f7bf91c8106995a4cb1e61b","extentLba":692,"byteLength":343462,"expected":"ec0efde4743cdb0c1a222842d77c5b517ce4e6c92710e4fb84992eec0ca1cefb"},
 {"baseSha256":"b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9","rawMaskSha256":"251a7dfbf6a4e729b70e824a96737ed14ea54efa0c4a87a89b3966c33e611eda","extentLba":692,"byteLength":343462,"expected":"ca5357be6d3d66e27b616a7c9b41a4fa614ce8c227b9a2a0e8968b3d15ac486e"},
 {"baseSha256":"85b9cbf349c421d621f3a6e6819d94f9ee1405137430046469562a2176e798a3","rawMaskSha256":"251a7dfbf6a4e729b70e824a96737ed14ea54efa0c4a87a89b3966c33e611eda","extentLba":692,"byteLength":343462,"expected":"64d9f6fba120b5d365485159bc701c9f1b41d58bdafb273f0e1bd12adb8bb675"},
 {"baseSha256":"75555116f784115e7104c593fd990491ae182b9493d9f159201e17b3e3d88202","rawMaskSha256":"251a7dfbf6a4e729b70e824a96737ed14ea54efa0c4a87a89b3966c33e611eda","extentLba":692,"byteLength":343462,"expected":"c64268ca45ada050e64fcb68fe3c1fc0bc15749990980290b3c328d41bf1217c"}
].map(Object.freeze));

function merge(ranges){
 const out=[];
 for(const range of ranges.map(value=>[...value]).sort((a,b)=>a[0]-b[0])){
  if(range.length!==3||range[2]!==255||!Number.isSafeInteger(range[0])||range[0]<0||!Number.isSafeInteger(range[1])||range[1]<1)throw Error('Invalid F FACE raw mask.');
  const previous=out.at(-1);
  if(previous&&previous[0]+previous[1]>=range[0])previous[1]=Math.max(previous[0]+previous[1],range[0]+range[1])-previous[0];
  else out.push(range);
 }
 return out;
}

// This is intentionally narrower than a directory or arbitrary raw-file mask:
// it covers only FACE.BIN's stored user bytes and the checksums coupled to those
// sectors.  The caller first authenticates the candidate FACE, active TSR table,
// and native selector; no caller-supplied pins participate here.
export function aliceFFaceMasks(profile,file){
 const rawMaskSha256=new Sha256().update(new TextEncoder().encode(JSON.stringify(profile?.rawMasks))).hex();
 const pin=ALICE_F_FACE_MASK_PINS.find(entry=>entry.baseSha256===profile?.baseTargetSha256&&entry.rawMaskSha256===rawMaskSha256);
 if(!pin||file?.extentLba!==pin.extentLba||file?.byteLength!==pin.byteLength)return null;
 const extra=[],sectors=Math.ceil(file.byteLength/2048);
 for(let index=0;index<sectors;index++){
  const length=Math.min(2048,file.byteLength-index*2048),lba=file.extentLba+index;
  extra.push([lba*2352+16,length,255],[lba*2352+2064,288,255]);
 }
 return Object.freeze({expected:pin.expected,masks:merge([...(profile.rawMasks??[]),...extra])});
}
