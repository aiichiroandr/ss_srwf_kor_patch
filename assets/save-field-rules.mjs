// `max` is what the game screen can print. The game draws numbers right-aligned in fixed fields with text control F8
// (0x060157E8); a number wider than its field makes the pad count negative and zero-fills memory: the game stops and the
// backup memory is overwritten (docs/EDITOR_FACTS.md "screen field widths"). Money of 10,000,000 or more stops the game
// in the load list (measured 2026-11-04). `storedMax` is what the record can hold: a CHANGED value must fit the screen,
// a value already stored may be kept as it is (the same rule as EDITOR_SCREEN_FIELD_LIMITS in editor-fields.mjs).
export const SAVE_SCALAR_RULES=Object.freeze({
  money:Object.freeze({label:'자금',min:0,max:9999999,storedMax:0xffffff}),
  level:Object.freeze({label:'파일럿 레벨',min:1,max:99}),
  experience:Object.freeze({label:'다음 레벨까지 EXP',min:0,max:65535}),
});
export const SAVE_MONEY_SCREEN_MAX=SAVE_SCALAR_RULES.money.max;
// `stored` is the value already in the record; passing it lets an unchanged value stand even above the screen limit.
export function requireSaveScalar(field,value,stored){
  const rule=SAVE_SCALAR_RULES[field];if(!rule)throw new Error('지원하지 않는 저장 항목입니다.');
  if(stored!==undefined&&value===stored&&Number.isSafeInteger(value)&&value>=rule.min&&value<=(rule.storedMax??rule.max))return value;
  if(!Number.isSafeInteger(value)||value<rule.min||value>rule.max)throw new Error(`${rule.label}: ${rule.min.toLocaleString('ko-KR')}~${rule.max.toLocaleString('ko-KR')} 사이의 정수를 입력하세요.${rule.storedMax!==undefined&&Number.isSafeInteger(value)&&value>rule.max?' 게임 화면의 숫자 칸보다 긴 값은 게임을 멈추고 세이브를 망가뜨립니다.':''}`);
  return value;
}
