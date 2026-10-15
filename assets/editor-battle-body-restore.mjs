import {applyBattleActorAttributes} from './editor-battle-clock.mjs?v=20261015-stocknames2';

// Main680E: F06040B7C..06040E12 / Final060461BC onward.
// The native9000 return requests another invocation without advancing PC;
// pause2 completes the second palette transfer and returns6001.
export function restoreBattleSceneBodies(shared){
 const byte=n=>Number.isInteger(n)&&n>=0&&n<=255;
 if(!shared||!Number.isInteger(shared.mainPauseWord)||shared.mainPauseWord<0||shared.mainPauseWord>0xffffffff
  ||!byte(shared.sceneFlagsByte)||typeof shared.actorAt!=='function')
  return {status:'blocked',reason:'body-restore-context-missing'};
 const pause=shared.mainPauseWord;
 if(pause!==0&&pause!==2)return {status:'waiting',nativeReturn:0x9000};
 if(typeof shared.initializeGraphics!=='function')return {status:'blocked',reason:'body-restore-palette-context-missing'};
 const actors=[1,4,5,6,7].map(slot=>shared.actorAt(slot));
 if(actors.some(a=>!a||!byte(a.flags1)||!byte(a.flags2)||!Number.isInteger(a.x)||!Number.isInteger(a.depth)))
  return {status:'blocked',reason:'body-restore-actor-context-missing'};
 const [attacker,defender,support,firstAux,secondAux]=actors;
 const low=shared.sideSecondaryStatusFlags,alternate=shared.alternateAnimationFlagsBytes;
 if(pause===0&&(!low||low.length!==2||![...low].every(byte)
  ||!alternate||alternate.length!==2||![...alternate].every(byte)))
  return {status:'blocked',reason:'body-restore-side-context-missing'};
 const copies=pause===0?[[128,62],[384,63]]:[[144,58],[400,59]];
 for(const [request,bank]of copies)if(shared.initializeGraphics({request,count:16,bank,selector:0})!==true)
  return {status:'blocked',reason:'body-restore-palette-copy-unresolved'};
 shared.graphicsCompletionWord=1;
 if(pause===2){shared.sceneFlagsByte&=231;return {status:'ready',nativeReturn:0x6001};}
 const mirrored=Boolean(shared.sceneFlagsByte&64)!==Boolean(shared.sceneFlagsByte&128);
 attacker.selector=0x0900;attacker.flags2=(attacker.flags2&253)|(mirrored?2:0);attacker.flags1|=128;
 attacker.x=defender.x;attacker.depth=defender.depth;
 applyBattleActorAttributes(attacker,mirrored?0xa131:0xa031);attacker.removed=false;
 if((low[1]&16)&&!(low[1]&4)){
  support.selector=0x0907;support.flags2=(support.flags2&253)|(mirrored?2:0);
  support.flags1|=64;support.x=support.depth=0;support.parentIndex=1;
  applyBattleActorAttributes(support,mirrored?0xa173:0xa073);support.removed=false;
 }else support.flags1&=191;
 defender.selector=0x0800;defender.flags2=(defender.flags2&253)|(mirrored?0:2);defender.flags1|=128;
 defender.x=0x0500;defender.depth=0x0440;
 applyBattleActorAttributes(defender,mirrored?0xa311:0xa211);defender.removed=false;
 firstAux.selector=0x100c+((alternate[0]>>>5)&3);firstAux.flags1&=191;
 secondAux.selector=0x100c+((alternate[1]>>>5)&3);
 return {status:'waiting',nativeReturn:0x9000};
}
