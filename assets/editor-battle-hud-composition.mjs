// Preparation-only translation of the proved NBG2 top-ratio display mode.
// F0603C788..0603C80E / Final06041B84..06041C0A select CCRNB's
// NBG2 byte from HUD+12, clear CCRTMD when HUD byte1 bit3 is set,
// and replace CCCTL's low enable byte with HUD's BE16 word+2.
// FA52 supplies words+2=4/+4=7. Other display modes are not inferred.
// SEGA VDP2 User's Manual ST-058-R2 p244: ratio r = (31-r):(r+1).
export function resolveBattleHudTopPlaneComposition(state,{gameId}={}){
 if(!['srwf-f','srwf-final'].includes(gameId))
  throw new Error('Battle HUD composition: missing supported game context');
 if(!(state instanceof Uint8Array)||state.length<13||state.length>1024)
  throw new Error('Battle HUD composition: invalid display state');
 const view=new DataView(state.buffer,state.byteOffset,state.byteLength);
 const enabledPlanes=view.getUint16(2),modeFlags=view.getUint16(4);
 if(enabledPlanes===0)return {status:'inactive',reason:'color-calculation-disabled'};
 // Request18 F0603CE94 / Final06042290 publishes CCMD bit8
 // (literal0100), then replaces the low enable byte with4. The original
 // manual specifies saturated unweighted top+second addition in this mode.
 // Keep rear/effect ordering guarded unless the existing top flag is set.
 if(enabledPlanes===4&&(modeFlags===67||state[0]===18&&(state[1]&64)&&modeFlags===7
   // Cached request19, like18, publishes only the low enable byte;
   // a later FA54 word rewrite leaves the additive CCMD bit intact.
   ||state[0]===19&&(state[1]&64)&&[3,7].includes(modeFlags))
   ||(enabledPlanes===68||enabledPlanes===4)&&[1,4].includes(state[0])&&(state[1]&64)&&[3,7].includes(modeFlags)){
  // The cached request18 consumer rewrites only CCCTL's low enable byte.
  // Later FA54 edits do not clear its retained CCMD additive bit.
  const top=Boolean(state[1]&8);
  return {status:'ready',planeIndex:2,opacity:1,blend:'add',layerPriority:top?6:3,
   scope:top?'owned-nbg2-top-additive-mode':'owned-nbg2-rear-additive-mode'};
 }
 if(enabledPlanes!==4||modeFlags!==7)
  return {status:'partial',reason:'display-color-mode-unresolved'};
 if(!(state[1]&8))return {status:'partial',reason:'second-image-ratio-mode-unresolved'};
 const ratio=state[12];
 if(ratio>31)throw new Error('Battle HUD composition: color ratio outside source range');
 // Display-mode updates assign NBG2 priority6 for this flag, compared with
 // the ordinary unit's sprite priority4. F0603DC24..36 / Final06043020..32.
 // The source caches the flag between display updates; this helper describes
 // the resolved top-mode composition, not the native callback scheduling.
 return {status:'ready',planeIndex:2,opacity:(31-ratio)/32,blend:'normal',
  layerPriority:6,ratio,scope:'owned-nbg2-top-ratio-mode'};
}

// FA53 F060356AC..060356D4 / Final0603A940..0603A968 sets words2/4
// to6/4 and clears flag8. The display consumer above then enables ordinary
// weighted color calculation for rear-background/effect with the ACTUAL
// second visible layer's ratio. HUD+12 publishes the effect's own ratio.
// Its resolved priority is3: F0603DC24..36 / Final06043020..32.
// Back ratio is not a HUD field and has no implicit default. Fresh source
// initialization F/Final06004086..96 clears the1024-byte SDK shadow, including
// Back ratio's high byte at+1CE. A fresh-profile caller can therefore supply0;
// a retained source display context must supply its independently proved value.
// Visibility, plane replacements, foreground/body priority and geometry are
// separate caller guards. This mode cannot be rendered as one global opacity.
export function resolveBattleHudSecondPlaneComposition(state,{gameId,backRatio}={}){
 if(!['srwf-f','srwf-final'].includes(gameId))
  throw new Error('Battle HUD second composition: missing supported game context');
 if(!(state instanceof Uint8Array)||state.length<13||state.length>1024)
  throw new Error('Battle HUD second composition: invalid display state');
 const view=new DataView(state.buffer,state.byteOffset,state.byteLength);
 const enabledPlanes=view.getUint16(2),modeFlags=view.getUint16(4);
 if(enabledPlanes===0)return {status:'inactive',reason:'color-calculation-disabled'};
 if(enabledPlanes!==6||modeFlags!==4)
  return {status:'partial',reason:'display-color-mode-unresolved'};
 if(state[1]&8)return {status:'partial',reason:'top-image-ratio-mode-unresolved'};
 const effectRatio=state[12];
 if(effectRatio>31)throw new Error('Battle HUD second composition: color ratio outside source range');
 if(backRatio===undefined)return {status:'partial',reason:'back-ratio-context-missing'};
 if(!Number.isInteger(backRatio)||backRatio<0||backRatio>31)
  throw new Error('Battle HUD second composition: Back ratio outside source range');
 return {status:'ready',planeIndex:2,effectRatio,backRatio,layerPriority:3,
  ratioSource:'second-visible-layer',calculatedLayers:['rear-background','effect'],
  scope:'owned-second-image-ratio-mode'};
}

// F0603DC54..66 / Final06043050..62 combine the four plane requests.
// The variant1 consumer ultimately passes that mask to SGL's auto-display
// routine. Its final store F060A851E..20 / Final060AE9FE..060AEA00 writes
// the low byte to BGON. NBG2's enable bit is4. FA54 writes00040000 to
// HUD+32, which contributes no low-byte enable bit: its previous pixels
// remain in the browser plane but must not be painted.
// Other presentation variants have a different publication path; no ratio
// or ordering information is inferred by this visibility-only translation.
export function resolveBattleHudPlaneVisibility(state,{gameId,presentationVariant}={}){
 if(!['srwf-f','srwf-final'].includes(gameId))
  throw new Error('Battle HUD visibility: missing supported game context');
 if(!(state instanceof Uint8Array)||state.length<40||state.length>1024)
  throw new Error('Battle HUD visibility: invalid display state');
 if(presentationVariant!==1)return {status:'partial',reason:'presentation-variant-unresolved'};
 const view=new DataView(state.buffer,state.byteOffset,state.byteLength);
 const enabledMask=(view.getUint32(24)|view.getUint32(28)|view.getUint32(32)|view.getUint32(36))&255;
 return {status:'ready',planeIndex:2,visible:Boolean(enabledMask&4),enabledMask,
  scope:'owned-variant1-plane-enable'};
}

// F request16 0603CD68 / Final06042164 set NBG0 priority6 and
// CCCTL additive mode with low enable byte1. Reset request0 restores
// NBG0 priority4. Priority publication persists across later requests.
export function resolveBattleForegroundDisplayComposition(state,{gameId,priority}={}){
 if(!['srwf-f','srwf-final'].includes(gameId)||!(state instanceof Uint8Array)||state.length<13
  ||![4,6].includes(priority))throw new Error('Battle foreground: unresolved display context');
 const view=new DataView(state.buffer,state.byteOffset,state.byteLength),enabled=view.getUint16(2),mode=view.getUint16(4);
 if(enabled&1){
  if(state[0]!==16||!(state[1]&64)||mode!==70)
   return {status:'partial',reason:'foreground-color-mode-unresolved'};
  return {status:'ready',planeIndex:0,layerPriority:priority,opacity:1,blend:'add',scope:'owned-nbg0-top-additive-mode'};
 }
 return {status:'ready',planeIndex:0,layerPriority:priority,opacity:1,blend:'normal',scope:'owned-nbg0-priority-publication'};
}
