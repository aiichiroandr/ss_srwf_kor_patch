// Source-owned actor clips, converted to a relocatable local program. This
// module grants no resource allocation or disc-write authority.
const dv=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const word=(b,p)=>dv(b).getUint16(p,false),signed=n=>n<<16>>16;
function fail(message,details){const error=new Error(message);error.code='EDITOR_WEAPON_AUTHORING_INVALID';if(details)error.details=details;throw error;}
export function compileWeaponEffectTrack(bytes,record,sequenceIndex){return compileTrack(bytes,record,sequenceIndex,false);}
export function assertWeaponEffectRecipientSafe(bytes,record,sequenceIndex){
 // Replacing the recipient must not erase a completion signal, numeric/HUD
 // publication, sound cue or nested controller. Context-only anchor reads
 // may be discarded, but this does not authorize importing those anchors.
 try{return compileTrack(bytes,record,sequenceIndex,true);}
 catch(error){if(error?.code!=='EDITOR_WEAPON_AUTHORING_INVALID')throw error;
  fail('Recipient effect requires its original state or audio protocol.',{reason:'recipient-state-required',cause:error.message});}
}
function compileTrack(bytes,record,sequenceIndex,recipientAnalysis){
 const span=record?.sequences?.[sequenceIndex];
 if(!(bytes instanceof Uint8Array)||!Array.isArray(record?.sequences)||!Number.isInteger(sequenceIndex)||!span||span.sentinel||!Number.isInteger(record.start)||!Number.isInteger(record.end)
  ||record.start<0||record.end>bytes.length||span.start<record.start||span.start>=record.end)fail('Invalid effect track source.');
 const lowerBound=Math.min(...record.sequences.filter(row=>!row.sentinel&&row.start<row.end).map(row=>row.start));
 const output=[],banks=[],pictures=new Set(),bodyBindings=new Set(),tracks=[],primary=new Map();let pc=span.start,bank=null,low=0,secondaryActive=false,terminal=false,pictureSteps=0,motionTimersKnown=false,countedLoops=0,screenEffects=0,soundCues=0;
 const requireBytes=(at,length)=>{if(at<lowerBound||at+length>record.end)fail('Effect track leaves its source record.');};
 const backwardEntry=(next,from)=>{
  const entry=primary.get(next),resetBank=bytes[next]===0xbf,resetLow=bytes[next]===0xc0;
  if(!entry||(!resetBank&&entry.bank!==bank)||(!resetLow&&entry.low!==low)||entry.secondaryActive!==secondaryActive)
    fail('Effect loop has an unresolved picture context.');
  if(![...primary].some(([at,state])=>at>=next&&at<from&&(bytes[at]<=0xbe
    ||[0xc9,0xca].includes(bytes[at])||bytes[at]===0xcb&&state.motionTimersKnown)))fail('Effect loop has no verified wait.');
  return entry;
 };
 function secondary(entry){
  const commands=new Map(),occupied=new Map();let cursor=entry,min=entry,max=entry,steps=0;
  while(steps++<4096){
   requireBytes(cursor,1);
   if(commands.has(cursor)){
    let loop=cursor,yields=false;
    do{const command=commands.get(loop);if(!command)fail('Unresolved picture track loop.');yields||=command.opcode<0xf8;loop=command.next;}while(loop!==cursor);
    if(!yields)fail('Picture track has a zero-time loop.');break;
   }
   if(occupied.has(cursor))fail('Picture track enters an operand.');
   const opcode=bytes[cursor],size=opcode<0xf8?1:({248:2,249:2,250:2,251:1,252:1,253:2,254:3,255:1})[opcode];
   requireBytes(cursor,size);
   for(let at=cursor;at<cursor+size;at++){if(occupied.has(at))fail('Picture track instructions overlap.');occupied.set(at,cursor);}
   if(opcode===0xf8&&(bytes[cursor+1]&63))fail('Picture track changes its resource bank.');
   let next=cursor+size;
   if(opcode===0xfd)next=cursor+(bytes[cursor+1]<<24>>24);
   if(opcode===0xfe)next=cursor+1+signed(word(bytes,cursor+1));
   commands.set(cursor,{opcode,next});if(opcode<0xf8)pictures.add(opcode);
   min=Math.min(min,cursor);max=Math.max(max,cursor+size);
   if(opcode===0xff)break;
   cursor=next;
  }
  if(steps>4096)fail('Picture track exceeds its instruction bound.');
  if(max-min>32767)fail('Picture track exceeds relocation bounds.');
  return {entry,min,max,bytes:bytes.slice(min,max)};
 }
 for(let steps=0;steps<4096;steps++){
  requireBytes(pc,1);const opcode=bytes[pc];
  // Native F9 is a zero-time jump relative to its operand (opcode+1).
  // Flatten forward paths and rebase closed, yielding local loops. A loop
  // must re-enter a decoded boundary with the same picture context; no
  // global flag/counter is imported.
  if(opcode===0xf9){
   requireBytes(pc,3);const next=pc+1+signed(word(bytes,pc+1));
   if(next<pc+3){
    const entry=backwardEntry(next,pc);
    const relative=entry.offset-output.length-1;
    if(relative<-32768)fail('Effect loop exceeds relocation bounds.');
    output.push(0xf9,(relative>>>8)&255,relative&255);terminal=true;break;
   }
   requireBytes(next,1);pc=next;continue;
  }
  if(opcode===0xf8){
   // F06038558 / Final0603D824: the actor-local byte66 counter is
   // shared by its F8 commands. Keep the original count/reuse byte and
   // runtime counter semantics; only the operand-relative pointer moves.
   requireBytes(pc,4);const next=pc+2+signed(word(bytes,pc+2));
   if(next>=pc)fail('Effect counted loop requires a decoded backwards target.',{opcode});
   const entry=backwardEntry(next,pc),relative=entry.offset-output.length-2;
   if(relative<-32768)fail('Effect counted loop exceeds relocation bounds.');
   output.push(0xf8,bytes[pc+1],(relative>>>8)&255,relative&255);countedLoops++;pc+=4;continue;
  }
  primary.set(pc,{offset:output.length,bank,low,secondaryActive,motionTimersKnown});
  const size=opcode<=0xbe?1:({191:2,192:2,193:1,194:1,195:1,196:1,197:1,198:1,200:4,201:6,202:6,203:1,204:3,205:3,206:3,207:3,208:1,209:1,210:1,211:1,212:2,213:2,214:2,215:2,216:3,237:1,254:1,255:1})[opcode]
   ??(opcode===0xfa?({16:4,17:4,44:2,45:2,68:6,186:4})[bytes[pc+1]]
     ??(recipientAnalysis&&[0x45,0x46].includes(bytes[pc+1])?3:null):!recipientAnalysis?({253:4,229:2})[opcode]:null);
  if(!size)fail('Effect import requires a closed actor track.',{recordOffset:pc-record.start,opcode,...(opcode===0xfa?{subopcode:bytes[pc+1]}:{})});requireBytes(pc,size);
  // A hold, movement yield or frozen FE can display the constructor's
  // initial picture. Its donor bank must be bound before that happens.
  if((opcode<=0xbe||[0xc9,0xca,0xcb,0xfe].includes(opcode))&&bank===null)
    fail('Effect depends on an unbound initial picture.');
  // CB waits for this actor's remaining movement, not another actor or
  // shared completion counter. Require this copied path to establish both
  // timers first; constructor/reused-slot timing cannot authorize a copy.
  if(opcode===0xcb&&!motionTimersKnown)fail('Effect movement wait depends on inherited timers.');
  if(opcode===0xc9||opcode===0xca)motionTimersKnown=true;
  // Admitted F0/F1 child constructors clear the selector to bank0. Make
  // that implicit binding explicit so a foreign bank can be remapped.
  if([0xc0,0xc1,0xc2,0xc8].includes(opcode)&&bank===null){
   banks.push({offset:output.length+1,bank:0});output.push(0xbf,0);bank=0;
   // A source back-edge targets the original opcode, after this one-time
   // constructor binding. Repeating the inserted BF could change a loop.
   Object.assign(primary.get(pc),{offset:output.length,bank});
  }
  const offset=output.length;output.push(...bytes.subarray(pc,pc+size));
  // F06033504 / Final06038790 publish a complete screen-effect preset.
  // All operands are immediate: retain the flash/strength/channel setup,
  // not an inherited flag, palette pointer or guessed resource binding.
  if(opcode===0xfa&&bytes[pc+1]===0xba)screenEffects++;
  // F0603869C / Final0603D96C publish an immediate sound request.
  // Keep its control/bank/song operands and original scheduling. The caller
  // must prove the recipient loads the same animation SE file bank before
  // this donor can be transplanted. Recipient analysis deliberately refuses
  // FD: admitting a new cue does not authorize deleting an existing one.
  // E5 uses the same source control number to stop an active sequence.
  // It must travel with its timing rather than being silently discarded.
  if(opcode===0xfd||opcode===0xe5)soundCues++;
  if(opcode===0xbf){bank=bytes[pc+1];banks.push({offset:offset+1,bank});}
  if(opcode===0xfa&&[0x2c,0x2d].includes(bytes[pc+1])){
   bank=bytes[pc+1]===0x2c?'attacker':'defender';low=null;bodyBindings.add(bank);
  }
  if(opcode===0xc0){low=bytes[pc+1];pictures.add(low);}
  if(opcode===0xc1||opcode===0xc2){
   if(secondaryActive||low===null)fail('Effect picture step depends on concurrent or live body timing.');pictureSteps++;
   low+=opcode===0xc1?1:-1;if(low<0||low>255)fail('Effect picture step crosses a resource bank.');pictures.add(low);
  }
  if(opcode===0xc8){
   if(bank===null)fail('Effect import has no explicit picture bank.');
   tracks.push({offset,track:secondary(pc+1+signed(word(bytes,pc+1)))});secondaryActive=true;
  }
  pc+=size;
  if(opcode===0xfe||opcode===0xff){terminal=true;break;}
 }
 if(!terminal)fail('Effect import has no verified terminal instruction.');
 for(const {offset,track}of tracks){
  const at=output.length,relative=at+track.entry-track.min-offset-1;
  if(relative<-32768||relative>32767)fail('Picture track pointer exceeds relocation bounds.');
  output[offset+1]=(relative>>>8)&255;output[offset+2]=relative&255;output.push(...track.bytes);
 }
 if(output.length>65535)fail('Effect clip exceeds its relative pointer bounds.');
 return {program:Uint8Array.from(output),bankOperands:banks,pictureSelectors:[...pictures].sort((a,b)=>a-b),secondaryTracks:tracks.length,pictureSteps,countedLoops,screenEffects,soundCues,bodyBindings:[...bodyBindings]};
}
