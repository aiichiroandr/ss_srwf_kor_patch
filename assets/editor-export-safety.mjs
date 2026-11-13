// Export safety checks that are independent of the individual TSR/native writers.
// Coordinates here are editor record indices and raw 2352-byte disc sectors only;
// no ISO LBA, decoded TSR offset, or runtime address is accepted interchangeably.
const RAW_SECTOR_BYTES=2352;
function fail(code,message,details={}){const error=new Error(message);error.code=code;error.details=details;throw error;}
function own(value,key){const d=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key):null;return d&&Object.hasOwn(d,'value')?d.value:undefined;}
function dense(value,label,maximum=4096,code='EDITOR_EXPORT_SAFETY_INVALID'){if(value===undefined)return [];if(!Array.isArray(value)||value.length>maximum||Object.keys(value).length!==value.length)fail(code,`${label} 요청 목록 형식이 올바르지 않습니다. 입력을 다시 확인하세요.`,{field:label});return value;}
function recordCount(session,kind){const index={unit:27,pilot:28,weapon:29}[kind],bytes=session?.root?.[index]?.bytes;if(!(bytes instanceof Uint8Array)||bytes.length<4)return null;const count=(bytes[0]*0x1000000+bytes[1]*65536+bytes[2]*256+bytes[3])>>>2;return count>0&&count<=65535&&count*4<=bytes.length?count:null;}
function known(session,kind,id){const count=recordCount(session,kind);if(count!==null)return id<count;const map=session?.readOnly?.[kind];return !(map instanceof Map)||map.has(id);}
function recordList(session,request,field,kind){const rows=dense(own(request,field),field,4096,'EDITOR_EDIT_INVALID'),seen=new Set();for(const row of rows){const id=own(row,'recordIndex');if(!row||typeof row!=='object'||Array.isArray(row)||!Number.isInteger(id)||id<0||id>65535)fail('EDITOR_EDIT_INVALID',`${field}의 기체/파일럿/무기 번호가 정수가 아닙니다. 해당 행을 다시 선택하세요.`,{field});if(!known(session,kind,id))fail('EDITOR_EDIT_INVALID',`${field}의 레코드 #${id}가 현재 검증한 표에 없습니다. ROM을 다시 열고 해당 편집을 고치세요.`,{field,recordIndex:id});if(seen.has(id))fail('EDITOR_EDIT_INVALID',`${field}에 레코드 #${id}가 두 번 있습니다. 중복 행을 하나로 정리하세요.`,{field,recordIndex:id});seen.add(id);}return rows;}
// Clone and restoration rows have their own complete, field-specific parsers.
// This boundary only rejects a shape which cannot be read without an accessor;
// it must not pre-empt their occupied-target, duplicate, or donor diagnostics.
function specializedRows(session,request,field,code){const value=own(request,field);if(value===undefined)return [];if(!Array.isArray(value)||Object.keys(value).length!==value.length)fail(code,`${field} 요청 형식이 올바르지 않습니다.`);for(const row of value){if(!row||typeof row!=='object'||Array.isArray(row))fail(code,`${field} 요청 형식이 올바르지 않습니다.`);for(const key of Reflect.ownKeys(row)){const descriptor=Object.getOwnPropertyDescriptor(row,key);if(!descriptor||!Object.hasOwn(descriptor,'value'))fail(code,`${field} 요청에 접근자 값이 있습니다.`);}if(field==='weaponClones'){const source=own(row,'sourceRecordIndex');if(!Number.isInteger(source)||source<0||source>65535||!known(session,'weapon',source))fail(code,'무기 복제 원본 번호가 현재 검증한 무기 표에 없습니다. 복제 설정을 다시 선택하세요.');}}return value;}
export function validateEditorExportSafety(session,request){
 if(!session?.descriptor||!(session.sourceBlob instanceof Blob)||!request||typeof request!=='object'||Array.isArray(request))fail('EDITOR_EXPORT_SAFETY_INVALID','검증된 ROM 세션 또는 출력 요청이 없습니다. ROM을 다시 열어 주세요.');
 if(!['srwf-f','srwf-final'].includes(session.descriptor.gameId)||!Number.isSafeInteger(session.file?.extentLba)||session.file.extentLba<0||!Number.isSafeInteger(session.file?.byteLength)||session.file.byteLength<1)fail('EDITOR_EXPORT_SAFETY_INVALID','디스크 파일 좌표를 확인하지 못했습니다. 원본을 다시 검사하세요.');
 const unit=recordList(session,request,'unitEdits','unit'),pilot=recordList(session,request,'pilotEdits','pilot'),weapon=recordList(session,request,'weaponEdits','weapon');
 const restore=specializedRows(session,request,'unitRestorations','EDITOR_UNIT_RESTORATION_INVALID'),clones=specializedRows(session,request,'weaponClones','EDITOR_WEAPON_CLONE_INVALID');
 // Scenario rows are sparse edits, unlike the echoed core tables, so this is
 // tied to an actual requested feature. Do not warn merely because an existing
 // native/clone configuration is echoed unchanged.
 const warnings=[];if(dense(own(request,'eventEdits'),'eventEdits').length||dense(own(request,'mapEdits'),'mapEdits').length||dense(own(request,'dialogueEdits'),'dialogueEdits').length)warnings.push('변경한 시나리오·지도·대사는 구조 검사를 통과해도 실제 진행 분기와 장기 플레이는 별도 확인이 필요합니다.');
 return Object.freeze({warnings:Object.freeze(warnings),records:Object.freeze({unit:unit.length,pilot:pilot.length,weapon:weapon.length,restore:restore.length,clones:clones.length})});
}
export function validateEditorOutputSafety(session,written){
 const blob=written?.outputBlob;if(!(blob instanceof Blob)||!Number.isSafeInteger(blob.size)||blob.size<RAW_SECTOR_BYTES||blob.size%RAW_SECTOR_BYTES!==0)fail('EDITOR_OUTPUT_STORAGE_INVALID','출력 디스크의 원시 섹터 길이가 올바르지 않습니다. 기존 다운로드는 유지하고 편집을 줄인 뒤 다시 시도하세요.',{sourceBytes:session.sourceBlob.size,outputBytes:blob?.size??0});
 // bytesChanged is legacy writer-work accounting: several legitimate stages can
 // rewrite a sector, so it is not a unique-byte metric and is intentionally not
 // bounded by the final Blob length. Physical geometry is checked above and by
 // the owning campaign/Fv2 writers.
 if(!Number.isSafeInteger(written?.bytesChanged)||written.bytesChanged<0)fail('EDITOR_OUTPUT_STORAGE_INVALID','출력 변경 범위를 확인하지 못했습니다. 새 다운로드를 만들지 않았습니다.');
 if(typeof written.sha256!=='string'||!/^[a-f0-9]{64}$/.test(written.sha256)||written.receipt?.sha256!==written.sha256)fail('EDITOR_OUTPUT_RECEIPT_INVALID','출력 해시 영수증을 다시 확인하지 못했습니다. 새 다운로드를 만들지 않았습니다.');
 return written;
}
