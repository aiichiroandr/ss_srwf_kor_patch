import {readBattleWebObjectStyle} from './editor-battle-web-style.mjs';
const roles=['attacker','effect','target'];
const roleOf=pose=>pose.role??(pose.slot===1?'attacker':pose.slot===4?'target':
 Number.isInteger(pose.slot)||pose.picture.assetKey?.startsWith('web-effect-plane:')?'effect':null);
const visible=(pose,scene)=>{
 if(readBattleWebObjectStyle(pose).opacity===0)return false;
 const x=pose.vertices.filter((_,i)=>i%2===0),y=pose.vertices.filter((_,i)=>i%2===1),c=pose.clip;
 const left=Math.max(0,c?.minX??0),top=Math.max(0,c?.minY??0);
 const right=Math.min(scene.width,c?c.maxX+1:scene.width),bottom=Math.min(scene.height,c?c.maxY+1:scene.height);
 return right>left&&bottom>top&&Math.min(...x)<right&&Math.max(...x)>left&&Math.min(...y)<bottom&&Math.max(...y)>top;
};
const samePose=(a,b)=>{
 const left=readBattleWebObjectStyle(a),right=readBattleWebObjectStyle(b);
 return a.picture===b.picture&&a.vertices.every((n,i)=>n===b.vertices[i])
  &&a.uvs.every((n,i)=>n===b.uvs[i])&&['minX','minY','maxX','maxY'].every(k=>a.clip?.[k]===b.clip?.[k])
  &&left.opacity===right.opacity&&left.blend===right.blend;
};

// Summarize the actual presented web objects, including disappearances and
// changes in their pictures/poses. No guessed attack-phase percentages.
export function buildBattleWebActivity(frames,durationUs){
 const tracks=roles.map(role=>({role,segments:[]})),previous=new Map();
 for(let index=0;index<frames.length;index++){
  const {atUs,webScene:scene}=frames[index],end=frames[index+1]?.atUs??durationUs;
  for(const track of tracks){
   const poses=scene.objects.filter(p=>roleOf(p)===track.role&&visible(p,scene)),old=previous.get(track.role)??[];
   const changed=poses.length!==old.length||poses.some((pose,i)=>!samePose(pose,old[i]));
   if(poses.length){
    let segment=track.segments.at(-1);
    if(!old.length){segment={fromUs:atUs,toUs:end,keyTimesUs:[atUs]};track.segments.push(segment);}
    else{segment.toUs=end;if(changed)segment.keyTimesUs.push(atUs);}
   }
   previous.set(track.role,poses);
  }
 }
 return tracks;
}
