// Web preview time only. This never trims, retimes or writes a source clip.
export function loopBattlePreviewRange(positionUs,{fromUs,toUs}={}){
 if(!Number.isFinite(positionUs)||!Number.isSafeInteger(fromUs)||!Number.isSafeInteger(toUs)
   ||fromUs<0||toUs<=fromUs)throw new Error('Battle preview range: bounded positive interval required');
 if(positionUs<fromUs)return fromUs;
 const duration=toUs-fromUs;
 return fromUs+(positionUs-fromUs)%duration;
}
