// FIN native collection getter (character / robot / demo registration).
// The overlay writes no save file. Native alias registration may persist on a later game save.
import {matchesByteWindow} from './editor-byte-window.mjs?v=20261113-froster1';

// The two MOV opcodes are the reversible edit itself. All surrounding code
// comes only from the user's file and is verified by its masked digest.
export const COLLECTION_UNLOCK = Object.freeze({
  "gameId": "srwf-final",
  "extentLba": 24,
  "execBytes": 758232,
  "offset": 98176,
  "returnOffset": 52,
  "contextBytes": 72,
  "contextSha256": "2267bc2bf19ca7c87f6336b3591f3cf61d9796ef650ef30fee9d3c94659deb80",
  "identity": "collection:1:a4bded8499e5a58a23d4dc230ee554a8a78ec4c0c397bffc0a9f087b10b22ecd"
});
export const COLLECTION_EDITOR_IDENTITY=COLLECTION_UNLOCK.identity;
export function collectionEditorRow(enabled){
 if(typeof enabled!=='boolean')throw new TypeError('해금 설정은 참/거짓이어야 합니다.');
 const value=Number(enabled);
 return {recordIndex:1,name:'도감·영상 전체 열람',enabled:value,editable:true,
  identity:COLLECTION_EDITOR_IDENTITY,original:{enabled:value}};
}
function fail(){const e=new Error('도감 해금 코드가 확인된 완결편 실행 파일과 일치하지 않습니다.');e.code='EDITOR_COLLECTION_UNSUPPORTED';throw e;}
export function inspectCollectionCode(bytes){
 const p=COLLECTION_UNLOCK;if(!(bytes instanceof Uint8Array)||bytes.length!==p.execBytes)fail();
 const at=p.offset+p.returnOffset,opcode=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint16(at);
 if(opcode!==0x6083&&opcode!==0xe001)fail();
 const enabled=opcode===0xe001;
 if(!matchesByteWindow(bytes,p.offset,p.contextBytes,p.contextSha256,{offset:at,length:2}))fail();
 return enabled;
}
export function setCollectionCode(bytes,enabled){
 if(typeof enabled!=='boolean')throw new TypeError('해금 설정은 참/거짓이어야 합니다.');
 inspectCollectionCode(bytes);const out=bytes.slice(),p=COLLECTION_UNLOCK,at=p.offset+p.returnOffset;
 out[at]=enabled?0xe0:0x60;out[at+1]=enabled?1:0x83;return out;
}
export async function collectionImage(blob,gameId,{enabled,signal}={}){
 if(gameId!==COLLECTION_UNLOCK.gameId){if(enabled===true)fail();return {outputBlob:blob,enabled:false,supported:false,changedSectors:[]};}
 const {locateIsoFiles,readCdUserExtent,rewriteCdUserExtent}=await import('./editor-core.mjs?v=20261113-froster1');
 const file=(await locateIsoFiles(blob,signal,['0']))['0'];
 if(file.extentLba!==24||file.byteLength!==COLLECTION_UNLOCK.execBytes)fail();
 const bytes=await readCdUserExtent(blob,file.extentLba,file.byteLength,{signal}),before=inspectCollectionCode(bytes);
 if(enabled===undefined||enabled===before)return {outputBlob:blob,enabled:before,previouslyEnabled:before,supported:true,changedSectors:[]};
 return {...await rewriteCdUserExtent(blob,file,setCollectionCode(bytes,enabled),{signal}),enabled,previouslyEnabled:before,supported:true};
}

export async function hasCollectionImage(blob,gameId){
 if(gameId!==COLLECTION_UNLOCK.gameId)return false;
 const offset=COLLECTION_UNLOCK.offset+COLLECTION_UNLOCK.returnOffset;
 const raw=(24+Math.floor(offset/2048))*2352+16+offset%2048;
 if(blob.size<raw+2)return false;
 const b=new Uint8Array(await blob.slice(raw,raw+2).arrayBuffer());return b[0]===0xe0&&b[1]===1;
}
