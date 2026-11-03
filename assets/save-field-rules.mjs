export const SAVE_SCALAR_RULES=Object.freeze({
  money:Object.freeze({label:'자금',min:0,max:0xffffff}),
  level:Object.freeze({label:'파일럿 레벨',min:1,max:99}),
  experience:Object.freeze({label:'다음 레벨까지 EXP',min:0,max:65535}),
});
export function requireSaveScalar(field,value){
  const rule=SAVE_SCALAR_RULES[field];if(!rule)throw new Error('지원하지 않는 저장 항목입니다.');
  if(!Number.isSafeInteger(value)||value<rule.min||value>rule.max)throw new Error(`${rule.label}: ${rule.min.toLocaleString('ko-KR')}~${rule.max.toLocaleString('ko-KR')} 사이의 정수를 입력하세요.`);
  return value;
}
