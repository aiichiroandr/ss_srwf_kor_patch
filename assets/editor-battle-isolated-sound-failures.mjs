// These missing synthesis states belong to individual voices. Bank/control,
// timing and unknown command failures can affect the whole sequence instead.
const isolated=new Set(['tone-lfo-phase-unresolved','tone-lfo-noise-state-unresolved','tone-fm-rendering-unimplemented']);
export function isIsolatedBattleSoundFailure(reasons){
 return Array.isArray(reasons)&&reasons.length>0&&Array.from(reasons).every(reason=>isolated.has(reason));
}
export function hasPreparedBattleSoundNotes(plan){
 return Array.isArray(plan?.notes)&&plan.notes.length>0&&(plan.status==='ready'
  ||plan.status==='partial'&&isIsolatedBattleSoundFailure(plan.unresolved?.map(e=>e.reason)));
}
