// Source preparation only. The ordinary BMESS loader selects a record by the
// pilot ID, not by the robot, portrait, weapon ID or animation ID. Playback
// receives the selected text/glyph events; it does not run this selector.
import {readBattleDialogueSelectors} from './editor-battle-dialogue-source.mjs';

const slots={'srwf-f':384,'srwf-final':400};
const integer=(value,max)=>Number.isInteger(value)&&value>=0&&value<=max;
const missing=reason=>({status:'partial',reason});

// F060192D8 / Final060197B0, called by the BMESS loader. The two hero slots
// resolve to alternating records304..319 using the explicit profile variant.
// This variant belongs to the selected hero's profile, not its portrait ID.
export function resolveBattleDialogueOwner(gameId,pilotIndex,{heroVariant}={}){
  if(!slots[gameId]||!integer(pilotIndex,1023))
    throw new Error('Battle dialogue selection: invalid pilot ownership');
  let recordIndex=pilotIndex;
  if(pilotIndex===302||pilotIndex===303){
    if(heroVariant===undefined)return missing('hero-dialogue-profile-required');
    if(!integer(heroVariant,7))throw new Error('Battle dialogue selection: invalid hero profile');
    recordIndex=(pilotIndex===303?304:305)|(heroVariant<<1);
  }
  if(recordIndex>=slots[gameId])return missing('pilot-dialogue-record-unavailable');
  return {status:'ready',pilotIndex,recordIndex,
    ownership:pilotIndex===302||pilotIndex===303?'explicit-hero-profile':'ordinary-pilot-id'};
}

// F0602DEB8..0602DEC4 / Final06031CBC..06031CC8 publish this byte into
// weapon work+13. F06063BB2..06063BC8 / Final0606A012..0606A028 copy it
// into the battle-side attack key. It is unrelated to D_ANIME's selector.
export function readBattleDialogueWeaponKey(weaponRecord){
  if(!(weaponRecord instanceof Uint8Array)||weaponRecord.length!==17)
    throw new Error('Battle dialogue selection: bounded weapon record required');
  return weaponRecord[2]&63;
}

// Preview/edit preparation only: preserve animation selection and all unrelated
// weapon bytes. The authenticated disc writer grants its own narrower masks.
export function withBattleDialogueWeaponKey(weaponRecord,key){
  readBattleDialogueWeaponKey(weaponRecord);
  if(!integer(key,63))throw new Error('Battle dialogue selection: invalid weapon key');
  const result=weaponRecord.slice();
  result[2]=(result[2]&192)|key;
  return result;
}

// Show actual selector ownership before offering a donor's dialogue. A weapon
// name describes a donor, never a promise that every pilot has that spoken line.
export function listBattleDialogueWeaponChoices(bytes,gameId,{pilotIndex,heroVariant}={}){
  const owner=resolveBattleDialogueOwner(gameId,pilotIndex,{heroVariant});
  if(owner.status!=='ready')return {...owner,choices:[]};
  const selectors=readBattleDialogueSelectors(bytes,gameId,owner.recordIndex);
  const choices=Array.from({length:64},(_,key)=>{
    const attack=tableRoot(selectors,0,key),counter=tableRoot(selectors,1,key);
    return {key,attack:{...attack,explicit:attack.selector.matchedKey===key},
      counter:{...counter,explicit:counter.selector.matchedKey===key}};
  });
  return {...owner,choices};
}

function tableRoot(selectors,tableIndex,key){
  const entry=selectors.tables[tableIndex].find(entry=>entry.key===key||entry.key===65535);
  if(!entry)throw new Error('Battle dialogue selection: missing table fallback');
  return {root:entry.root,selector:{kind:'attack-key',tableIndex,key,matchedKey:entry.key}};
}

// F060479D8..06047AC4 / Final0604D1F0..0604D2DC: channel bit1 selects
// producer orientation. A response speaker is not necessarily the current
// unit in a condition: channels0/1 share the incoming attacker context.
export function createBattleDialogueUnitConditionContext({channel,attackerUnitId,defenderUnitId,
  attackerPilotId,defenderPilotId,attackerLinkedPilotIds,defenderLinkedPilotIds}={}){
  if(!integer(channel,3)||!integer(attackerUnitId,65535)||!integer(defenderUnitId,65535))
    throw new Error('Battle dialogue selection: explicit unit condition orientation required');
  const result=channel&2?{currentUnitId:defenderUnitId,opponentUnitId:attackerUnitId}
    :{currentUnitId:attackerUnitId,opponentUnitId:defenderUnitId};
  // F06047A94..AC4/Final0604D2AC..DC retain direct battle-side pilot IDs
  // and mark both linked-pilot chains absent (FF). The map-party producer at
  // F06047AFC..B8C instead traverses pilot work+8. Callers supply that chain
  // explicitly; omitted IDs/links never become a guessed single-pilot party.
  for(const [role,id,links]of [
    [channel&2?'opponent':'current',attackerPilotId,attackerLinkedPilotIds],
    [channel&2?'current':'opponent',defenderPilotId,defenderLinkedPilotIds],
  ]){
    if(id!==undefined){
      if(!integer(id,65535))throw new Error('Battle dialogue selection: invalid pilot condition context');
      result[role+'PilotId']=id;
    }
    if(links!==undefined){
      if(id===undefined||!Array.isArray(links)||links.length>255
        ||Array.from(links).some(value=>!integer(value,65535)))
        throw new Error('Battle dialogue selection: invalid linked pilot condition context');
      result[role+'LinkedPilotIds']=links.slice();
    }
  }
  return result;
}

// F06047810 / Final0604D014 prepare the four channels in this order:
// 0 attacker attack,1 defender response,2 defender counterattack,3 attacker
// response. IDs and outcome data are explicit preview inputs. The function
// does not infer the current pilot from the selected robot or calculate damage.
export function selectBattleDialogueChannelRoot(bytes,gameId,{pilotIndex,channel,
  weaponRecord,heroVariant,statusWord,responseTraitByte,remainingHpPercent,
  counterStatusWord}={}){
  if(!integer(channel,3))throw new Error('Battle dialogue selection: invalid channel');
  const owner=resolveBattleDialogueOwner(gameId,pilotIndex,{heroVariant});
  if(owner.status!=='ready')return {...owner,channel};
  const selectors=readBattleDialogueSelectors(bytes,gameId,owner.recordIndex);
  const result=selected=>({...owner,channel,...selected});
  if(channel===0)return result(tableRoot(selectors,0,readBattleDialogueWeaponKey(weaponRecord)));
  if(statusWord===undefined)return {...missing('dialogue-outcome-required'),channel,recordIndex:owner.recordIndex};
  if(!integer(statusWord,65535))throw new Error('Battle dialogue selection: invalid outcome word');
  const high=statusWord>>>8;
  if(channel===2){
    // F06047560 / Final0604CD64: the special counter-response path uses
    // header8/9; ordinary counterattacks use the second key table.
    if(((high>>>2)&3)>1){
      if(counterStatusWord===undefined)return {...missing('counter-dialogue-status-required'),channel,recordIndex:owner.recordIndex};
      if(!integer(counterStatusWord,65535))throw new Error('Battle dialogue selection: invalid counter status');
      const kind=(counterStatusWord>>>7)&3;
      if(kind){const headerIndex=kind===3?9:8;
        return result({root:selectors.header[headerIndex],selector:{kind:'response-header',headerIndex}});}
    }
    return result(tableRoot(selectors,1,readBattleDialogueWeaponKey(weaponRecord)));
  }
  // F060473E4 /06047694 and Final0604CBE8 /0604CE98 select the same
  // response headers from each incoming side's full outcome packet.
  let headerIndex;
  if(high&64){
    if(high&16)headerIndex=0;
    else{
      if(!(high&2)){
        if(responseTraitByte===undefined)return {...missing('dialogue-response-trait-required'),channel,recordIndex:owner.recordIndex};
        if(!integer(responseTraitByte,255))throw new Error('Battle dialogue selection: invalid response trait');
        if(responseTraitByte&31)headerIndex=6;
      }
      if(headerIndex===undefined){
        if(remainingHpPercent===undefined)return {...missing('dialogue-remaining-hp-required'),channel,recordIndex:owner.recordIndex};
        if(!integer(remainingHpPercent,65535))throw new Error('Battle dialogue selection: invalid remaining HP percent');
        headerIndex=remainingHpPercent>89?3:remainingHpPercent>29?2:1;
      }
    }
  }else headerIndex=((high>>>2)&3)===1?7:((statusWord>>>7)&3)!==0?5:4;
  return result({root:selectors.header[headerIndex],selector:{kind:'response-header',headerIndex}});
}
