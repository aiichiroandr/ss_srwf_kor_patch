import {Sha256} from './sha256.mjs?v=20261110-part2';

// A newer mutable mask changes the body identity without moving a command.
// Aliases come only from the inspector's authenticated, hash-pinned base profile;
// a preset's claimed release, name or coordinates never grant a remapping.
export function scenarioIdentityAliases(profile,kind,row){
  if(!['deployment','event','objective'].includes(kind))return Object.freeze([]);
  const index=row?.physicalIndex;
  if(!Number.isInteger(index)||index<0||!Array.isArray(row?.scenarioSlots)||typeof row?.recordIndex!=='string')return Object.freeze([]);
  const current=profile?.scenarioScopes?.scenario?.bodies?.[index];
  const prior=profile?.scenarioLabelScopes?.scenario?.bodies?.[index];
  const hashes=[];
  if(current&&prior&&current.decodedLength===prior.decodedLength)hashes.push(prior.immutableDecodedSha256);
  // Retain the older deployment-only compatibility layer as well.
  if(kind==='deployment')hashes.push(profile?.legacyDeploymentBodies?.[index]);
  return Object.freeze([...new Set(hashes.filter(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)))].map(hash=>
    `${kind}:1:${new Sha256().update(new TextEncoder().encode(JSON.stringify([hash,row.scenarioSlots,row.recordIndex]))).hex()}`));
}
