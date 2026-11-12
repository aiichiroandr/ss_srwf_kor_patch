// F v0.5a/b/c has a locally implemented, hash-pinned editor export path.  This
// is not release acceptance or a runtime claim: first-battle/first-clear runtime
// verification remains pending outside the browser editor.
export const ALICE_F_PROFILE=Object.freeze({
  gameId:'srwf-f',variant:'v0.5a/b/c',developmentOnly:true,pendingRuntime:true,availability:true,
  baseSha256:Object.freeze(['b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9','85b9cbf349c421d621f3a6e6819d94f9ee1405137430046469562a2176e798a3','75555116f784115e7104c593fd990491ae182b9493d9f159201e17b3e3d88202']),
  // These pins describe original user-owned ISO extents. They do not establish
  // an IP-resident overlay's lifetime or reachability.
  ip:{firstBytes:0x1800,logicalOffset:0x1300,slotBytes:1024,sha256:'ad00e607e43b8dd6c52f0a58d10d0ce78a5a058e2c43bb9895ffec34558783ff'},
  exec:{name:'0',extentLba:24,bytes:731504,sha256:'308fe51501cd70091fe1a9983101d6cd98b9fdc7d8857e4bac9e2bff3e9974f1'},
  faceBytes:343462,faceRecords:338,faceHeaderBytes:2704,
  sourceFaceSha256:'4bdb39f5e2e03a9b2b371704423a462c64488e75bfbc8535bd5eaeba8d1d6564',
  sourceRoot2HeaderSha256:'a02e9da1f5a909c029ac0ff67147ab56b12acbbe2a602de63ad47ea8fc129162',
  candidateFaceSha256:'4ea3c56662d814ff65effa4c03ddf76a04d958f866619ee72800a3d1c54c62bc',
  candidateFaceHeaderSha256:'1b8d8bbc175bc7ed023e13c0fd130050d21807fba1e3dcdd74b2f5aa5bf03897',
  faceId:338,pilotId:399,donorPilotId:246,donorFaceId:247,pilotBytes:27
});
export function isAliceFBase(baseSha256){return typeof baseSha256==='string'&&ALICE_F_PROFILE.baseSha256.includes(baseSha256);}
// Availability means the local, authenticated editor implementation is present.
// It deliberately does not assert accepted release status or complete runtime proof.
export function aliceFAvailable(){return ALICE_F_PROFILE.availability===true;}
