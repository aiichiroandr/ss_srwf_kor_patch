// The values the editor writes per record and the range each one has in the record: the writers of the data core
// (assets/editor-core.mjs) check every submitted value against these bounds, and a loaded preset file is checked
// against the same table before anything of it reaches an edit. Pure data, no imports, no game text.
//
// Unit and pilot terrain grades are nibbles here (0..15, what the record can hold); the narrower rule for a CHANGED
// grade (0..4) is isGradeEditAllowed in editor-grades.mjs, which the writers and the preset check share as well.
import {isRegionRuleWireValue,decodeRegionRule} from './editor-scenario-region-context.mjs?v=20261011-public11';
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
  unit: Object.freeze({
    hp: WORD, en: WORD, armor: WORD, speed: WORD, limit: WORD,
    move: BYTE, ground: NIBBLE, sea: NIBBLE, air: NIBBLE, space: NIBBLE,
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
    attack: WORD, hit: range(-128, 127), critical: NIBBLE,
    minRange: BYTE, maxRange: BYTE, terrain: BYTE, energy: WORD,
    ammo: BYTE, requiredMorale: BYTE, requiredSkill: BYTE,
  }),
  terrain: Object.freeze({ avoidanceBonus: range(0, 100), defenseBonus: range(0, 100), hpRecovery: range(0, 100), enRecovery: range(0, 100) }),
  reward: Object.freeze({ part1: range(1, 22), chance1: range(0, 100), part2: range(1, 22), chance2: range(0, 100) }),
  deployment: Object.freeze({ x: range(0, 63), y: range(0, 63), rewardSelector: BYTE }),
  event: Object.freeze({ turn: range(1,99),eventPhase:range(0,1),eventJoin:range(0,1),eventRule1:range(19,1599),eventRule2:range(0,1599),eventRule3:range(0,1599) }),
  objective: Object.freeze({ deadline: range(0,98),objectivePriority:range(0,1),victoryJoin:range(0,1),defeatJoin:range(0,1),
    victoryRule1:OBJECTIVE_RULE,victoryRule2:OBJECTIVE_RULE,victoryRule3:OBJECTIVE_RULE,defeatRule1:OBJECTIVE_RULE,defeatRule2:OBJECTIVE_RULE,defeatRule3:OBJECTIVE_RULE }),
  reinforcement: Object.freeze({enabled:range(0,1),templateOffset:range(56,262143),turn:range(2,99),x:range(0,63),y:range(0,63),rewardSelector:BYTE}),
  map: Object.freeze({ tileId: range(0, 1023) }),
});

// Whether `value` may stand in `field` of a record of `kind` at all (an own entry of the table, an integer in range).
export function isFieldValueInBounds(kind, field, value) {
  const table = Object.hasOwn(EDITOR_FIELD_BOUNDS, kind) ? EDITOR_FIELD_BOUNDS[kind] : null;
  if (!table || typeof field !== "string" || !Object.hasOwn(table, field)) return false;
  if(kind==='event'&&/^eventRule[123]$/.test(field))return isEventRuleValueInBounds(value)&&(field!=='eventRule1'||value!==0);
  if(kind==='objective'&&/^(victory|defeat)Rule[123]$/.test(field))return isObjectiveRuleValueInBounds(value);
  if (table[field] === "boolean") return typeof value === "boolean";
  const [minimum, maximum] = table[field];
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}
