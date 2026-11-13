// Losslessly fit two Ex-S poses in the original 0x3000-byte combatant slot.
// Cropping changes the pivot by the identical amount, so every visible source
// pixel keeps its world position. Only the unused part 4 receives the new pose.
import {sha256Hex as hash} from './sha256.mjs?v=20261113-alicecopies1';
import {applyBattleArtPatch} from './editor-art-patch.mjs?v=20261113-alicecopies1';
import {EXS_AIMED_ART_V16} from './editor-exs-aimed-art.mjs?v=20261113-alicecopies1';
function invalid(message){const e=new Error(message);e.code='EDITOR_BATTLE_COMPONENT_INVALID';throw e;}
const nibble=(pixels,at)=>(pixels[at>>1]>>(at&1?0:4))&15;
function cropped(part,pixels,box){
 if(!box||![box.x,box.y,box.width,box.height].every(Number.isInteger)||box.x<0||box.y<0
  ||box.width<8||box.width%8||box.height<2||box.height%2
  ||box.x+box.width>part.width||box.y+box.height>part.height)invalid('Ex-S 자세의 투명 여백 범위가 올바르지 않습니다.');
 const out=new Uint8Array(box.width*box.height/2);
 for(let y=0;y<part.height;y++)for(let x=0;x<part.width;x++){
  const index=nibble(pixels,y*part.width+x);
  if(x<box.x||x>=box.x+box.width||y<box.y||y>=box.y+box.height){if(index)invalid('Ex-S 자세를 줄이면서 기체 그림이 잘립니다.');continue;}
  const at=(y-box.y)*box.width+x-box.x;out[at>>1]|=index<<(at&1?0:4);
 }
 const header=part.header.slice(),d=new DataView(header.buffer,header.byteOffset,header.byteLength);
 d.setUint16(8,box.width);d.setUint16(10,box.height);d.setInt16(12,part.x-box.x);d.setInt16(14,part.y-box.y);
 return {...part,header,width:box.width,height:box.height,x:part.x-box.x,y:part.y-box.y,pixels:out};
}
export function makeExSAimedPoseParts(parts,asset=EXS_AIMED_ART_V16,{preserveIdle=false}={}){
 const original=parts?.[0],blank=parts?.[4];
 if(parts?.length!==5||!original||!blank||blank.width!==8||blank.height!==8||blank.x!==4||blank.y!==4
  ||blank.pixels.length!==32||blank.pixels.some(x=>x!==0))invalid('Ex-S 조준 자세용 빈 부품이 원본과 다릅니다.');
 if(!asset||original.width!==asset.width||original.height!==asset.height||original.x!==asset.x||original.y!==asset.y
  ||hash(original.palette.subarray(2))!==asset.visiblePaletteSha256)invalid('Ex-S 조준 자세의 원본 그림이나 팔레트가 다릅니다.');
 const aimed=applyBattleArtPatch(original.pixels,asset);
 const out=parts.map(p=>({...p}));out[0]=preserveIdle?{...original,header:original.header.slice()}:cropped(original,original.pixels,asset.crop);out[4]=cropped(original,aimed,asset.crop);
 return out;
}
