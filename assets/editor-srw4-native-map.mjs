// Original F palettes stay byte-identical. These fixed blank KOM slots carry
// the Rev 1 native index roles, with F's own faction colors at runtime.
import {sha256Hex} from './sha256.mjs?v=20261113-alicecopies1';
import {MAP_ICON_PACKED_PROFILES} from './editor-map-icon-packed.mjs?v=20261113-alicecopies1';
import {makeKomRecovery,restoreKomRecovery} from './editor-kom-recovery.mjs?v=20261113-alicecopies1';
import {bytesEqual as equal} from './editor-bytes.mjs?v=20261113-alicecopies1';
export const SRW4_NATIVE_ICON_HASHES=Object.freeze({"s-gundam": "87aaacb2d08638ad639e295d164439278170641d46ed961b010392c8ad76a711", "exs-gundam": "e615eef79853af8d659f9a633993c67378d924ec58887e1c4f3dc6da9c600fdd", "sirbine": "15811fad3641d7d8dfba784628b6e7b9594108ed658a8ddc07ed16bfbd4169d4", "zwauss": "5398b4895fd98eec12db61f3840396e6937021b444bdc342befd98b630ee7437", "s-gcruiser": "2d9cfad1eff49fd4a28c0f3f6ff891284419808b0108b72e49dc3816c48362b3", "exs-gcruiser": "579541d5d4e72fd6b0218e4821684e228e915022741583a6d71e45b77054396e"});
const KEYS=Object.keys(SRW4_NATIVE_ICON_HASHES),PRESETS={'s-gundam':'s-gundam','ex-s-gundam':'exs-gundam',sirbine:'sirbine',zwauss:'zwauss','s-g-cruiser':'s-gcruiser','g-cruiser':'exs-gcruiser'};
function fail(){const e=Error('제4차 맵 아이콘의 원본·빈 슬롯·압축 복원을 확인하지 못했습니다.');e.code='EDITOR_SRW4_MAP_INVALID';throw e;}
const start=id=>128+id*128;
function profile(gameId){const p=MAP_ICON_PACKED_PROFILES[gameId];if(!p)fail();return p;}
export function srw4NativeIconId(preset,gameId){profile(gameId);if(preset==='blood-temple')return 62;const key=PRESETS[preset],i=KEYS.indexOf(key);return i<0?null:(gameId==='srwf-f'?319:336)+i;}
function expectedAssets(assets){if(!Array.isArray(assets))fail();return KEYS.map(key=>{const a=assets.find(a=>a.key===key),pixels=a?.icon?.indexed??a?.indexed;if(!(pixels instanceof Uint8Array)||pixels.length!==256||sha256Hex(pixels)!==SRW4_NATIVE_ICON_HASHES[key])fail();return {key,pixels:pixels.slice()};});}
function source(packed,gameId,decode){const p=profile(gameId);if(!(packed instanceof Uint8Array)||packed.length!==p.bytes||sha256Hex(packed)!==p.sha256)fail();const raw=decode(packed,65664).output;if(raw.length!==65664||sha256Hex(raw)!==p.decodedSha256)fail();return raw;}
function fill(raw,assets,gameId){const out=raw.slice(),base=gameId==='srwf-f'?319:336;for(let i=0;i<KEYS.length;i++){const at=start(base+i);if(raw.subarray(at,at+128).some(Boolean))fail();for(let j=0;j<128;j++)out[at+j]=assets[i].pixels[j*2]<<4|assets[i].pixels[j*2+1];}return out;}
export function createSrw4NativeMapCodec({decode,encode}){
 const cache=new WeakMap();
 async function build(original,gameId,assets,{signal}={}){
  const checked=expectedAssets(assets),raw=source(original,gameId,decode),planned=fill(raw,checked,gameId);signal?.throwIfAborted();
  let byGame=cache.get(original);if(!byGame){byGame=new Map();cache.set(original,byGame);}if(byGame.has(gameId))return byGame.get(gameId);
  const promise=(async()=>{const recovery=makeKomRecovery(original,raw),packed=await encode(planned,{signal,completeNearMatches:true,maxMatchCandidates:256});if(packed.length>original.length)fail();const bytes=new Uint8Array(original.length);bytes.set(packed);if(!equal(decode(bytes,65664).output,planned))fail();return {bytes,original:original.slice(),decoded:planned,recovery,remaining:bytes.length-packed.length};})();byGame.set(gameId,promise);try{return await promise;}catch(e){byGame.delete(gameId);throw e;}
 }
 async function inspect(current,gameId,recovery,{signal}={}){
  const p=profile(gameId);if(!(current instanceof Uint8Array)||current.length!==p.bytes)fail();const planned=decode(current,65664).output;if(planned.length!==65664)fail();const original=planned.slice(),base=gameId==='srwf-f'?319:336,assets=[];
  for(let i=0;i<KEYS.length;i++){const at=start(base+i),indexed=new Uint8Array(256);for(let j=0;j<128;j++){indexed[j*2]=original[at+j]>>4;indexed[j*2+1]=original[at+j]&15;}assets.push({key:KEYS[i],indexed});original.fill(0,at,at+128);}
  expectedAssets(assets);if(sha256Hex(original)!==p.decodedSha256)fail();const packed=restoreKomRecovery(original,recovery);source(packed,gameId,decode);const rebuilt=await build(packed,gameId,assets,{signal});if(!equal(rebuilt.bytes,current)||!equal(rebuilt.recovery,recovery))fail();return rebuilt;
 }
 return Object.freeze({build,inspect});
}
