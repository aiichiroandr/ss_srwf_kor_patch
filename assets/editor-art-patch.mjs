// Authored pixel replacements carry only source fingerprints. Original pixels
// are read from the authenticated user's archive, never bundled in this module.
import {sha256Hex as hash} from './sha256.mjs?v=20261106-part4';
import {hexToBytes} from './editor-bytes.mjs?v=20261106-part4';
const sha=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
function invalid(message){const error=new Error(message);error.code='EDITOR_BATTLE_COMPONENT_INVALID';throw error;}

export function applyBattleArtPatch(source,asset){
 if(!(source instanceof Uint8Array)||!asset||!sha(asset.sourcePixelSha256)
  ||hash(source)!==asset.sourcePixelSha256||!sha(asset.pixelSha256)||!Array.isArray(asset.patches))invalid('전투 그림의 원본이나 변경 기록이 다릅니다.');
 const pixels=source.slice();let end=0;
 for(const entry of asset.patches){
  if(!Array.isArray(entry)||entry.length!==3)invalid('전투 그림의 변경 기록이 올바르지 않습니다.');
  const [at,length,afterHex]=entry;
  if(!Number.isSafeInteger(at)||!Number.isSafeInteger(length)||at<end||length<1||length>source.length-at
   ||typeof afterHex!=='string'||afterHex.length!==length*2
   ||!/^[0-9a-f]+$/.test(afterHex))invalid('전투 그림의 변경 범위가 올바르지 않습니다.');
  pixels.set(hexToBytes(afterHex),at);end=at+length;
 }
 if(hash(pixels)!==asset.pixelSha256)invalid('전투 그림의 변경 결과가 다릅니다.');
 return pixels;
}
