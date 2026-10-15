// F06066000 / Final0606C910 mask the stored nibble with7 before
// reading the signed critical threshold table. This is a threshold modifier,
// not a damage multiplier or an unconditional final chance percentage.
export const WEAPON_CRITICAL_BONUSES=Object.freeze([-20,-10,0,10,20,0,0,0]);
export function weaponCriticalBonus(value){
 return Number.isInteger(value)&&value>=0&&value<=15?WEAPON_CRITICAL_BONUSES[value&7]:null;
}
export function weaponCriticalLabel(value){
 const bonus=weaponCriticalBonus(value);return bonus===null?`?${value}`:bonus>0?`+${bonus}`:String(bonus);
}
export const WEAPON_CRITICAL_CHOICES=Object.freeze(Array.from({length:5},(_,value)=>Object.freeze({value,label:weaponCriticalLabel(value)})));
export function canonicalWeaponCritical(value){
 const bonus=weaponCriticalBonus(value);return bonus===null?null:(bonus+20)/10;
}
