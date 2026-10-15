import test from'node:test';import assert from'node:assert/strict';import{installFakeDom,FakeElement}from'./helpers/fake-dom.mjs';import{createBattleSimulationUI}from'../assets/editor-battle-simulation-ui.mjs';
Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});
const d=installFakeDom();d.defaultView={matchMedia:()=>({matches:false,addEventListener(){}})};
const root=d.createElement('div'),transport=d.createElement('div'),main=d.createElement('div'),viewer=d.createElement('div');transport.className='bp-transport';main.className='bp-main';viewer.className='bp-viewer';main.append(viewer);root.append(transport,main);d.body.append(root);
let selected={attacker:{unit:{recordIndex:253,hp:4000,en:200},pilot:{recordIndex:300,specialAbilities:[{id:79,level:174,name:'명경지수'}]}},defender:{unit:{recordIndex:21,hp:3400,en:140},pilot:{recordIndex:323,specialAbilities:[]}}},applies=0;
const ui=createBattleSimulationUI({root,getActors:()=>selected,onApply:()=>applies++});
test('event skills require explicit preview selection and applying; repeated sync preserves checkbox focus and inputs',()=>{
 ui.sync();assert.deepEqual(ui.read().attackerEventFlags,[]);const input=root.querySelector('.bp-event-skills input');assert.equal(input.getAttribute('aria-label'),'사용 · 명경지수 적용');input.checked=true;input.dispatchEvent({type:'change'});assert.deepEqual(ui.read().attackerEventFlags,[]);root.querySelector('form').dispatchEvent({type:'submit'});assert.equal(applies,1);assert.deepEqual(ui.read().attackerEventFlags,[74]);ui.sync();assert.equal(root.querySelector('.bp-event-skills input'),input);assert.equal(selected.attacker.pilot.specialAbilities[0].level,174);
});
test('changing the selected pilot removes prior runtime flags and hides unnecessary controls',()=>{selected={...selected,attacker:{...selected.attacker,pilot:{recordIndex:10,specialAbilities:[]}}};ui.sync();assert.deepEqual(ui.read().attackerEventFlags,[]);assert.equal(root.querySelector('.bp-event-skills').hidden,true);ui.clear();});
test('loading another disc clears prior damage conditions and pending form input, while ordinary weapon changes retain them',()=>{
 ui.sync();ui.set({spirit:'soul',defense:'at-field',critical:true,attackerLevel:80,defenderHp:1,attackerEn:3,dialogueSeed:4321,attackerDomain:'space',lightCorrection:false});
 ui.sync();assert.equal(ui.read().spirit,'soul');assert.equal(ui.read().defenderHp,1);
 ui.result({status:'ready',damage:999,defender:{hpAfter:1}});
 ui.clear();
 selected={attacker:{unit:{recordIndex:1,hp:3500,en:180},pilot:{recordIndex:9,specialAbilities:[]}},defender:{unit:{recordIndex:21,hp:3400,en:140},pilot:{recordIndex:53,specialAbilities:[]}}};
 const values=ui.read();assert.equal(values.spirit,'none');assert.equal(values.defense,'none');assert.equal(values.critical,false);
 assert.equal(values.attackerLevel,1);assert.equal(values.defenderHp,3400);assert.equal(values.attackerEn,180);assert.equal(values.dialogueSeed,0);assert.equal(values.attackerDomain,'ground');assert.equal(values.lightCorrection,true);
 assert.equal(root.querySelector('.bp-conditions-result').textContent,'');assert.equal(root.dataset.combatStatus,undefined);
});
