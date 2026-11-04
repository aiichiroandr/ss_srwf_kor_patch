// Test-only fixtures standing in for the user's own empty records. Browser code
// recognizes these by SHA-256 and copies them from the loaded image instead.
const WEAPON={'srwf-f':'0020000000270ff601010fff0000000000','srwf-final':'00200000000000f601010fff0000000000'};
export function weaponFiller(gameId){return Uint8Array.from(WEAPON[gameId].match(/../g),s=>parseInt(s,16));}
export function unitFiller(gameId){
 const bytes=new Uint8Array(54);
 for(const [offset,value] of [[6,64],[8,128],[9,gameId==='srwf-f'?128:0],[10,101],
  [12,1],[13,134],[14,160],[16,1],[17,134],[18,160],[21,100],[23,100],[24,1],
  [26,68],[27,68],[29,100],[33,100],[35,255],[36,8],[37,252],[46,1],[49,1]])bytes[offset]=value;
 return bytes;
}
export const ALICE_RESERVED_PILOT='00000000ff4460602f444404c800c803e703e703e703e700010000';
