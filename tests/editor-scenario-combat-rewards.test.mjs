import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {createScenarioCombatRewards,scenarioCombatRewardTargets} from '../assets/editor-scenario-combat-rewards.mjs';
import {makeBase,descriptorFor} from './helpers/synthetic-game.mjs';
import {echoRequest} from './helpers/synthetic-iso.mjs';
import {splitRootSegments,updateUnitRecords,exportEditedImage,editorDecodedMasks,createEditorInspector} from '../assets/editor-core.mjs';
import {immutableBytesHash} from '../assets/editor-provenance.mjs';
import {trustFor} from './helpers/synthetic-game.mjs';
import {buildPreset,parsePreset,applyPreset} from '../assets/editor-preset.mjs';

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: money and both EXP components survive output and fresh reopen`,async()=>{
 const base=await makeBase({gameId,units:2}),view=base.opened.view,request=echoRequest(base.opened.session,view);
 const unit=view.units.find(row=>row.editable),pilot=view.pilots.find(row=>row.editable&&row.statsValid!==false);
 Object.assign(request.unitEdits.find(row=>row.recordIndex===unit.recordIndex).fields,{killMoney:65535,killExp:255});
 request.pilotEdits.find(row=>row.recordIndex===pilot.recordIndex).fields.exp=254;
 const result=await exportEditedImage(base.opened.session,request),opened=await base.full.inspectPatchedImage(result.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
 const next=opened.view.units.find(row=>row.recordIndex===unit.recordIndex);
 assert.equal(next.killExp,255);assert.equal(next.killMoney,65535);assert.equal(next.identity,unit.identity);
 assert.equal(opened.view.pilots.find(row=>row.recordIndex===pilot.recordIndex).exp,254);
 const before=base.opened.session.root[27].bytes,after=opened.session.root[27].bytes;
 const allowed=new Set([unit.byteOffset+19,unit.byteOffset+20,unit.byteOffset+21]);
 for(let i=0;i<before.length;i++)if(!allowed.has(i))assert.equal(after[i],before[i]);
 // An older profile cannot admit the new byte through its narrower immutable digest.
 const oldMasks=editorDecodedMasks(splitRootSegments(base.decoded),gameId,{killExperience:false});
 const oldProfile={...base.profile,decodedMasks:oldMasks,immutableTsrSha256:immutableBytesHash(base.decoded,oldMasks)};
 const old=createEditorInspector(trustFor(base.disc,[oldProfile],gameId));
 await assert.rejects(()=>old.inspectPatchedImage(result.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'})));
 // Older request JSON without the optional new field is still accepted.
 await exportEditedImage(base.opened.session,echoRequest(base.opened.session,view));
});

test('EXP byte refuses overflow, fractions, accessors and read-only changes atomically',async()=>{
 const base=await makeBase({units:2}),source=base.opened.session.root[27].bytes,request=echoRequest(base.opened.session,base.opened.view).unitEdits;
 const id=base.opened.view.units.find(row=>row.editable).recordIndex;
 for(const value of [-1,256,1.5,'7',NaN]){
  const edits=structuredClone(request);edits.find(row=>row.recordIndex===id).fields.killExp=value;
  const bytes=source.slice();assert.throws(()=>updateUnitRecords(bytes,edits));assert.deepEqual(bytes,source);
 }
 const edits=structuredClone(request);edits.find(row=>row.recordIndex===id).fields.killExp=255;
 const locked=source.slice();assert.throws(()=>updateUnitRecords(locked,edits,new Map([[id,'locked']])));assert.deepEqual(locked,source);
});

test('scenario controls edit authenticated shared owners, preserve focus and unrelated changes, validate and reset',async()=>{
 const document=installFakeDom();loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
 const unit={recordIndex:7,name:'테스트 기체',editable:true,statsValid:true,hp:3000,killMoney:800,killExp:120,original:{hp:3000,killMoney:800,killExp:120}};
 const pilot={recordIndex:3,name:'테스트 파일럿',editable:true,statsValid:true,aliasIds:[4],exp:180,original:{exp:180}};
 let placement={unitId:7,pilotId:4},canEdit=true;const updates=[];
 const host={el:id=>document.getElementById(id),placement:()=>placement,rows:kind=>kind==='unit'?[unit]:[pilot],aliases:()=>[{recordIndex:4,aliasOf:3}],canEdit:()=>canEdit,onChange:(kind,row)=>updates.push([kind,row.recordIndex]),reveal:input=>input.focus()};
 const ui=createScenarioCombatRewards(host),$=host.el;
 const set=(id,value)=>{const input=$(id);input.value=String(value);input.dispatchEvent({type:'input',target:input});};
 ui.render();assert.equal($('scenarioCombatRewards').hidden,false);assert.equal($('scenarioPilotExp').value,'180');
 $('scenarioKillMoney').focus();set('scenarioKillMoney',65000);set('scenarioUnitExp',255);set('scenarioPilotExp',250);
 assert.equal(document.activeElement,$('scenarioKillMoney'));assert.equal(unit.killMoney,65000);assert.equal(unit.killExp,255);assert.equal(pilot.exp,250);
 assert.match($('scenarioCombatRewardScope').textContent,/다른 시나리오/);assert.deepEqual(updates,[['unit',7],['unit',7],['pilot',3]]);
 const preset=parsePreset(JSON.stringify(buildPreset({gameId:'srwf-final'},{unit:[unit],pilot:[pilot]})));
 const targetUnit={...unit,killMoney:800,killExp:120},targetPilot={...pilot,exp:180};
 const applied=applyPreset(preset,{gameId:'srwf-final',units:[targetUnit],pilots:[targetPilot],weapons:[]},'matching');
 assert.equal(applied.applied,3);assert.equal(targetUnit.killExp,255);assert.equal(targetPilot.exp,250);
 set('scenarioUnitExp',256);assert.equal(unit.killExp,255);assert.equal(ui.validate({report:true}),false);assert.equal($('scenarioUnitExp').getAttribute('aria-invalid'),'true');
 unit.hp=4000;$('scenarioCombatRewardReset').click();assert.equal(unit.hp,4000);assert.equal(unit.killMoney,800);assert.equal(unit.killExp,120);assert.equal(pilot.exp,180);assert.equal(ui.validate(),true);
 canEdit=false;ui.sync();set('scenarioKillMoney',1);assert.equal(unit.killMoney,800);assert.equal($('scenarioKillMoney').disabled,true);
 canEdit=true;placement={unitId:null,pilotId:null};ui.render();assert.equal($('scenarioCombatRewards').hidden,true);assert.equal($('scenarioKillMoney').value,'');assert.equal($('scenarioPilotExp').disabled,true);
 placement={unitId:7,pilotId:999};ui.render();assert.equal($('scenarioKillMoney').disabled,false);assert.equal($('scenarioPilotExp').disabled,true);
 assert.equal(scenarioCombatRewardTargets({unitId:null,pilotId:null},[unit],[pilot])[0].row,null);
});
