// Adds only unit record +19 (base battle EXP) to the pinned mutable domain.
import {WEAPON_VOICE_PROFILES} from './editor-weapon-voice-profiles.mjs?v=20261106-part4';
const pins=[
  {
    "base": "b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9",
    "parent": "5c1f4f57697086d77bcabc2f51516c88ca6dfee9fa3cedfad80ba87a88c4a5ef",
    "hash": "17bde18b6f0058e62c6054c46d4880d2b2a1b28532ac0c75702b9114058afeff"
  },
  {
    "base": "85b9cbf349c421d621f3a6e6819d94f9ee1405137430046469562a2176e798a3",
    "parent": "139dff755a218dda9f214c14fe408896f11a9e404fbc79e6302dbcfba7f73c7c",
    "hash": "83fd1a98714241e43a243e55049da03aa49e6a2d353ecba9a71a069494344f36"
  },
  {
    "base": "0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d",
    "parent": "d30a7227a3d7f84b50dc4165c4088dc3e7e5c26903d57dabab07db42fade25ef",
    "hash": "0c053ab97bdb58d05cf5ee2f4cb229aa24d736738b70d09a20392714b633312d"
  },
  {
    "base": "75555116f784115e7104c593fd990491ae182b9493d9f159201e17b3e3d88202",
    "parent": "ba0506b3f04ab4cca6bd2dd4bd0d9c0d11663f473473afc2ef73385f04c07924",
    "hash": "2ace9198989b10a841e733e3cbbd22defbbae2f500859fae7d8f03209437d3f2"
  },
  {
    "base": "fd8df11fc7a933cea000d40695325fb290900c72b64f8b316e18b06afee8d73e",
    "parent": "b18030bf5db908ca52c25683b60ea912c04df9a30874ee38601c9567effe6211",
    "hash": "e31541aa0978eebd08286a856dc88160da3801b8d002ad6380877c38b02731b9"
  },
  {
    "base": "9d22ab0ac45e2f8a3728c18825ddd2ea96035704a2ef56b291e077e93e885e23",
    "parent": "2ac4597473d4c9fefd9aa2f741b845d367dfe27c9af98a132d4152df0925303b",
    "hash": "739fa68383b31d16c56071f9ba1f8199d9da1789ca7da9767110508db962bebc"
  },
  {
    "base": "c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8",
    "parent": "c209b6b3f5b8d3ae7f68ff08a3f754654feec6ea63817db82acb393d27306095",
    "hash": "1e26eeed484b6e3a383226a7343dc1396d038f704fadc208e00ac1861f03a345"
  },
  {
    "base": "ff7192abc112d5c969a0e236f5061fc6853234eedc350525c46c0548c57dfbdb",
    "parent": "00ee208ddb8b96f7185cd1f2c1b69fc2cf3d9341344819962230cda5308a9ad8",
    "hash": "b9e555841fc9759c6faef719faee3b3461958c9d89ab94a9ea44ce16446d5935"
  }
];
export function killExperienceMasks(parent) {
 const extra=[...new Set(parent.unitStorage.offsets.slice(1))].map(offset=>[parent.unitStorage.start+offset+19,1,255]);
 const merged=[];
 for(const range of [...parent.decodedMasks,...extra].sort((a,b)=>a[0]-b[0])) {
  const previous=merged.at(-1);
  if(previous&&previous[0]===range[0]&&previous[1]===range[1]&&previous[2]===range[2])continue;
  if(previous&&previous[2]===255&&range[2]===255&&previous[0]+previous[1]>=range[0])previous[1]=Math.max(previous[0]+previous[1],range[0]+range[1])-previous[0];
  else merged.push([...range]);
 }
 return Object.freeze(merged.map(Object.freeze));
}
export const KILL_EXPERIENCE_PROFILES=Object.freeze(pins.map(pin=>{
 const parent=WEAPON_VOICE_PROFILES.find(profile=>profile.baseTargetSha256===pin.base&&profile.immutableTsrSha256===pin.parent);
 if(!parent)throw Error('Missing battle EXP profile parent');
 return Object.freeze({...parent,decodedMasks:killExperienceMasks(parent),immutableTsrSha256:pin.hash});
}));
