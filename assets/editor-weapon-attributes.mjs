// Root29's BE attribute word. Original TSRViewer weaponload and
// weaponsclassupdate bind P/shot/parry-target to bits6/4/5 respectively.
// Existing native combat decoding independently consumes byte1 bits4/5.
// This codec does not grant record/extent write authority or MAP editing.
const MASK=0x70;
function word(value){if(!Number.isInteger(value)||value<0||value>65535)throw new RangeError('Weapon attribute word must be a uint16.');return value;}
export function readWeaponCombatAttributes(value){
 word(value);return {ranged:Boolean(value&0x10),postMove:Boolean(value&0x40),parryable:Boolean(value&0x20)};
}
export function writeWeaponCombatAttributes(original,values){
 word(original);
 if(!values||typeof values!=='object')throw new TypeError('Weapon combat attributes required.');
 const fields=['ranged','postMove','parryable'],next={};
 for(const field of fields){const own=Object.getOwnPropertyDescriptor(values,field);
  if(!own||typeof own.value!=='boolean')throw new TypeError('Weapon combat attributes must be explicit booleans.');
  next[field]=own.value;
 }
 return(original&~MASK)|(next.ranged?0x10:0)|(next.postMove?0x40:0)|(next.parryable?0x20:0);
}
