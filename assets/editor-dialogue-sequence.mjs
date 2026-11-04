// Shape only. Actual B1 boundary, portrait, encoding and capacity permissions
// are checked by the authenticated scenario dialogue reader/writer.
export function readAfterDialogueJson(value){
 const fail=()=>{const error=new Error('추가 발화는 화자와 본문을 가진 최대 4개의 목록이어야 합니다.');error.code='EDITOR_DIALOGUE_INVALID';throw error;};
 if(value==='')return [];
 if(typeof value!=='string'||value.length>32768)fail();
 let entries;try{entries=JSON.parse(value);}catch{fail();}
 if(!Array.isArray(entries)||entries.length>4)fail();
 for(const entry of entries)if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).length!==2||!Object.hasOwn(entry,'speakerId')||!Object.hasOwn(entry,'text')||!Number.isInteger(entry.speakerId)||entry.speakerId<1||entry.speakerId>511||typeof entry.text!=='string'||entry.text.length>4096||/[\u0000-\u001f\u007f\u2028\u2029]/u.test(entry.text))fail();
 return entries.map(({speakerId,text})=>({speakerId,text}));
}
export function canonicalAfterDialogueJson(value){const entries=readAfterDialogueJson(value);return entries.length?JSON.stringify(entries):'';}
export function afterDialogueText(value){return readAfterDialogueJson(value).map(entry=>entry.text).join('');}
