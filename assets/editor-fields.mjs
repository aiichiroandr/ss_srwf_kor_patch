// The values the editor writes per record and the range each one has in the record: the writers of the data core
// (assets/editor-core.mjs) check every submitted value against these bounds, and a loaded preset file is checked
// against the same table before anything of it reaches an edit. Pure data, no imports, no game text.
//
// Unit and pilot terrain grades are nibbles here (0..15, what the record can hold); the narrower rule for a CHANGED
// grade (0..4) is isGradeEditAllowed in editor-grades.mjs, which the writers and the preset check share as well.
import {isRegionRuleWireValue,decodeRegionRule} from './editor-scenario-region-context.mjs?v=20261113-froster1';
import {readAfterDialogueJson} from './editor-dialogue-sequence.mjs?v=20261113-froster1';
const range = (minimum, maximum) => Object.freeze([minimum, maximum]);
const BYTE = range(0, 0xff);
const WORD = range(0, 0xffff);
const NIBBLE = range(0, 0x0f);
const UNIT_KIND_MAX = Object.freeze({ 'srwf-f':367, 'srwf-final':447 });
const ownScalar = (object,key) => object && typeof object==='object'
  ? Object.getOwnPropertyDescriptor(object,key)?.value : undefined;

// The integer hull in the table is not permission for its gaps. Six objective
// rules admit only the original canonical encoding or this distinct tagged
// unit-kind encoding. Identity-aware callers additionally supply the real TSR
// record count; the generic preset field pass only checks the wire shape.
export function objectiveUnitIdLimit(context) {
  const gameId=ownScalar(context,'gameId'),unitCount=ownScalar(context,'unitCount');
  return Object.hasOwn(UNIT_KIND_MAX,gameId) && Number.isInteger(unitCount) && unitCount>=2 && unitCount<=512
    ? Math.min(UNIT_KIND_MAX[gameId],unitCount-1) : 0;
}
export function isObjectiveRuleValueInBounds(value,context=null) {
  if(isRegionRuleWireValue(value)){
    if(context===null)return true; // Syntactic wire only, no map permission.
    if(ownScalar(context,'gameId')!=='srwf-f')return false;
    if(ownScalar(context,'wireOnly')===true)return true;
    try{decodeRegionRule(value,context);return true;}catch{return false;}
  }
  if(!Number.isSafeInteger(value)||value<0||value>0xffff)return false;
  if(value===0)return true;
  if((value&0xfc00)===0x4000){
    const id=value>>>1&511;if(id<1||id>399)return false;
    if(context===null)return true; // Wire shape only; never a write permission.
    if(ownScalar(context,'gameId')!=='srwf-final')return false;
    if(ownScalar(context,'wireOnly')===true)return true;
    const pilotContext=ownScalar(context,'pilotContext'),catalog=ownScalar(pilotContext,'catalog');
    return ownScalar(pilotContext,'gameId')==='srwf-final'&&ownScalar(pilotContext,'scenarioLayout')==='latest'
      &&Array.isArray(catalog)&&Array.from({length:catalog.length},(_,i)=>ownScalar(catalog,String(i)))
        .some(pair=>Array.isArray(pair)&&ownScalar(pair,'0')===id);
  }
  if(value&0x8000){
    const id=value>>>1&511,limit=context===null?447:objectiveUnitIdLimit(context);
    return (value&0xfc00)===0x8000 && id>=1 && id<=limit;
  }
  const query=value&3,amount=value>>>4;
  return value<=1599 && query!==0 && amount>=(query===3?1:0) && amount<=(query===3?99:74);
}
export function isEventRuleValueInBounds(value){return Number.isSafeInteger(value)&&value>=0&&value<=1599&&(value===0||(value&3)===3&&value>>>4>=1&&value>>>4<=99);}
const OBJECTIVE_RULE = range(0,0x837f);

export const EDITOR_FIELD_BOUNDS = Object.freeze({
  beam: Object.freeze({ enabled: range(0,1) }),
  critical: Object.freeze({ enabled: range(0,1) }),
  debug: Object.freeze({ enabled: range(0,1) }),
  alice: Object.freeze({enabled:range(0,1),crewEnabled:range(0,1),spBase:range(0,999),
    ...Object.fromEntries(Array.from({length:6},(_,i)=>[[`spirit${i+1}`,range(1,30)],[`spiritLevel${i+1}`,range(1,99)]]).flat())}),
  collection: Object.freeze({ enabled: range(0,1) }),
  unit: Object.freeze({
    ...Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`weapon${i + 1}`, range(1, 2047)])),
    hp: WORD, en: WORD, armor: WORD, speed: WORD, limit: WORD,
    killMoney: WORD, killExp: BYTE, partSlots: range(1, 4), move: BYTE, ground: NIBBLE, sea: NIBBLE, air: NIBBLE, space: NIBBLE,
    ability1: BYTE, ability2: BYTE, ability3: BYTE, ability4: BYTE,
    abilityValue1: BYTE, abilityValue2: BYTE, abilityValue3: BYTE, abilityValue4: BYTE,
    shield: "boolean", parry: "boolean",
  }),
  pilot: Object.freeze({
    exp: BYTE, atk: BYTE, shot: BYTE, agi: WORD, hit: WORD,
    tech: WORD, cnt: WORD, mp: WORD,
    ground: NIBBLE, sea: NIBBLE, air: NIBBLE, space: NIBBLE,
    attackGrowth: NIBBLE, shotGrowth: NIBBLE, hitGrowth: NIBBLE, techGrowth: NIBBLE,
    agiGrowth: NIBBLE, cntGrowth: NIBBLE, mindGrowth: NIBBLE, syncGrowth: NIBBLE,
  }),
  weapon: Object.freeze({
    voiceType: range(0,63),
    // Three-digit signed modifiers spill into the next weapon-list row in
    // the game. Keep edits inside the display's two-digit magnitude.
    attack: WORD, hit: range(-99, 99), critical: NIBBLE,
    minRange: BYTE, maxRange: BYTE, terrain: BYTE, energy: WORD,
    ammo: BYTE, requiredMorale: BYTE, requiredSkill: BYTE,
  }),
  upgrade: Object.freeze({ cost: range(0, 655350) }),
  terrain: Object.freeze({ avoidanceBonus: range(-100, 100), defenseBonus: range(-100, 100), hpRecovery: range(0, 100), enRecovery: range(0, 100) }),
  reward: Object.freeze({ part1: range(1, 22), chance1: range(0, 100), part2: range(1, 22), chance2: range(0, 100) }),
  deployment: Object.freeze({ x: range(0, 63), y: range(0, 63), rewardSelector: BYTE }),
  event: Object.freeze({ turn: range(1,99),eventPhase:range(0,1),eventJoin:range(0,1),eventRule1:range(19,1599),eventRule2:range(0,1599),eventRule3:range(0,1599) }),
  objective: Object.freeze({ deadline: range(0,98),objectivePriority:range(0,1),victoryJoin:range(0,1),defeatJoin:range(0,1),
    victoryRule1:OBJECTIVE_RULE,victoryRule2:OBJECTIVE_RULE,victoryRule3:OBJECTIVE_RULE,defeatRule1:OBJECTIVE_RULE,defeatRule2:OBJECTIVE_RULE,defeatRule3:OBJECTIVE_RULE }),
  reinforcement: Object.freeze({enabled:range(0,1),pilotId:range(1,511),unitId:range(1,511),level:range(1,99),triggerX:range(0,63),triggerY:range(0,63),x:range(0,63),y:range(0,63)}),
  glyph: Object.freeze({}),
  roster: Object.freeze({initialLevel:range(1,99)}),
  dialogue: Object.freeze({speakerId:range(1,511)}),
  map: Object.freeze({ tileId: range(0, 1023) }),
});

// What the game's screens can print. The game writes these numbers right-aligned into fixed-width fields (text control
// F8, 0x060157E8). The routine pads with (field width - digits) zeros and checks only for zero, so a number wider than
// its field makes the count negative and the routine zero-fills memory: the screen goes black, the game stops and the
// backup memory is overwritten (measured 2026-11-04 on the stock Final and on v0.3 c, docs/EDITOR_FACTS.md "screen field
// widths"). The record can hold more than this; a CHANGED value must fit its field, a stored value may be kept as it is.
export const EDITOR_SCREEN_FIELD_LIMITS = Object.freeze({
  unit: Object.freeze({ en: range(0, 999), speed: range(0, 999), limit: range(0, 999) }),
  weapon: Object.freeze({ attack: range(0, 9999), hit: range(-99, 99), energy: range(0, 999) }),
});

export function screenFieldLimit(kind, field) {
  const table = Object.hasOwn(EDITOR_SCREEN_FIELD_LIMITS, kind) ? EDITOR_SCREEN_FIELD_LIMITS[kind] : null;
  return table && typeof field === "string" && Object.hasOwn(table, field) ? table[field] : null;
}

export function isScreenFieldEditAllowed(kind, field, next, stored) {
  const limit = screenFieldLimit(kind, field);
  if (!limit || next === stored) return true;
  return Number.isSafeInteger(next) && next >= limit[0] && next <= limit[1];
}

// Whether `value` may stand in `field` of a record of `kind` at all (an own entry of the table, an integer in range).
export function isFieldValueInBounds(kind, field, value) {
  if(kind==='dialogue'&&field==='afterDialogueJson'){try{readAfterDialogueJson(value);return true;}catch{return false;}}
  if(kind==='glyph'&&field==='characters')return typeof value==='string'&&[...value].length<=64&&[...value].every(ch=>/[가-힣]/u.test(ch))&&new Set(value).size===[...value].length;
  if(kind==='dialogue'&&field==='pagesJson'){if(value==='')return true;if(typeof value!=='string'||value.length>8192)return false;try{const pages=JSON.parse(value);return Array.isArray(pages)&&pages.length>=2&&pages.length<=4&&pages.every(text=>typeof text==='string'&&text.length<=4096&&!/[\u0000-\u001f\u007f]/.test(text));}catch{return false;}}
  if(kind==='dialogue'&&field==='text')return typeof value==='string'&&value.length<=4096&&!/[\u0000-\u001f\u007f]/.test(value);
  if(kind==='weapon'&&field==='name')return typeof value==='string'&&value.trim()===value&&value.length>0&&[...value].length<=80&&!/[\u0000-\u001f\u007f]/.test(value);
  const table = Object.hasOwn(EDITOR_FIELD_BOUNDS, kind) ? EDITOR_FIELD_BOUNDS[kind] : null;
  if (!table || typeof field !== "string" || !Object.hasOwn(table, field)) return false;
  if(kind==='event'&&/^eventRule[123]$/.test(field))return isEventRuleValueInBounds(value)&&(field!=='eventRule1'||value!==0);
  if(kind==='objective'&&/^(victory|defeat)Rule[123]$/.test(field))return isObjectiveRuleValueInBounds(value);
  if (table[field] === "boolean") return typeof value === "boolean";
  const [minimum, maximum] = table[field];
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

// Old personal BINs can already contain the full signed-byte range. Reading
// and comparing their baseline must still allow a correction to the new range;
// this is never permission to submit a new out-of-range value.
export function isStoredFieldValueInBounds(kind, field, value) {
  return kind === 'weapon' && field === 'hit'
    ? Number.isSafeInteger(value) && value >= -128 && value <= 127
    : isFieldValueInBounds(kind, field, value);
}
