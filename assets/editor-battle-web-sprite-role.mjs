// Optical-only E_SPR packages checked in both owned disc directories and
// across every declared picture. Mixed arm/body/weapon packages are excluded.
// These are preparation identifiers; playback receives only prepared art.
const packages=Object.freeze({11:[7,1946],16:[8,5355],33:[22,11688],35:[15,4347],37:[8,3282],51:[11,5765],
 52:[7,2213],54:[3,4467],56:[4,1506],268:[6,2836],280:[4,2905],283:[5,2198],304:[4,1506],
 // Gundam vulcan: all19 source pictures are flash, projectile and impact
 // art in both games; no unit/body parts. Preserve the separate1282 bank.
 1290:[19,7361]});
export function resolveBattleWebWeaponSpriteRole({gameId,sourceSelector,subIndex,pictureCount,recordLength}={}){
 if(!['srwf-f','srwf-final'].includes(gameId)||!Number.isInteger(sourceSelector)||sourceSelector<0||sourceSelector>2047
  ||!Number.isInteger(pictureCount)||pictureCount<1||pictureCount>255||!Number.isInteger(subIndex)
  ||!Number.isSafeInteger(recordLength)||recordLength<1||recordLength>0x1000000
  ||subIndex<0||subIndex>=pictureCount)return {status:'partial',reason:'weapon-sprite-role-context-unresolved'};
 const expected=sourceSelector===11&&gameId==='srwf-final'?[10,2805]:packages[sourceSelector];
 if(expected===undefined)return {status:'partial',reason:'weapon-sprite-role-unclassified'};
 if(pictureCount!==expected[0])return {status:'partial',reason:'weapon-sprite-picture-count-mismatch'};
 if(recordLength!==expected[1])return {status:'partial',reason:'weapon-sprite-record-length-mismatch'};
 // Slot21 is a1024x64 storage raster in both source packages. Keep its
 // registration count, but never reinterpret the gallery guard as optics.
 if(sourceSelector===33&&subIndex===21)return {status:'partial',reason:'weapon-sprite-image-unclassified'};
 return {status:'ready',role:'optical-effect'};
}
