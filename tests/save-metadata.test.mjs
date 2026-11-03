import test from 'node:test';import assert from 'node:assert/strict';
import {saveHeroName,saveDateLabel,saveSummary} from '../assets/save-metadata.mjs';
import {FINAL_PILOT_NAME_MAP} from '../assets/editor-pilot-name-map.mjs';
import {F_NAME_MAP} from '../assets/editor-name-map.mjs';
import {saveUnitGroup} from '../assets/save-unit-groups.mjs';
import {openSave} from '../assets/save-core.mjs';import {syntheticSave} from './helpers/synthetic-save.mjs';
test('slot summary uses completed counter, exact title index, stored name and console-clock timestamp',()=>{
 const code=[...F_NAME_MAP].find(([key,value])=>key.length===2&&value==='ア')[0];
 const row={gameId:'srwf-f',completedEpisode:33,completedTitleIndex:30,heroNameBytes:[parseInt(code,16),255],dateMinutes:1440};
 assert.deepEqual(saveSummary(row,[{titleIndex:30,status:'decoded',text:'합성 시나리오'}]),{progress:'제33화 클리어',title:'합성 시나리오',hero:'ア',date:'1980-01-02 00:00'});
 assert.equal(saveDateLabel(0),'저장 일시 미기록');assert.equal(saveDateLabel(0xffffffff),'저장 일시 확인 불가');
 assert.equal(saveSummary({...row,completedEpisode:null}).progress,'진행 정보 미확인');
 assert.equal(saveHeroName({...row,heroNameBytes:[0xeb]}),'이름 해독 불가');
});
const row=(id,kind=0,form=0)=>({recordIndex:id,saveUnitKind:kind,saveUnitForm:form,hp:3000,en:100});
test('all forms and linked families can be added; components get save-slot references',async()=>{
 const units=[...Array.from({length:13},(_,i)=>row(52+i,i===0?6:5,(i-1)%3)),...Array.from({length:6},(_,i)=>row(38+i,i===0?8:7,i-1)),row(2,9,2),row(3,9,0),row(4,9,1),row(24,4,0),row(25,4,1),row(26,4,2),row(100,0),row(101,1,1)];
 for(const id of [52,55,38,42,2,3,4,24,25,26,100,101]){
  const s=await openSave(syntheticSave().raw,{gameId:'srwf-final',units});const result=s.addUnit(2,id),group=saveUnitGroup(id,units);
  assert.ok(result.record.units.some(u=>u.id===id));
  for(const [child,parent] of group.links){const c=result.record.units.find(u=>u.id===child),p=result.record.units.find(u=>u.id===parent);assert.equal(c.linkedSlot,p.slot);}
  assert.equal((await openSave(await s.exportFile())).list()[0].editable,true);
 }
 assert.ok(saveUnitGroup(52,units,[55,58,61,64]).members.includes(55));
});

test('reject mismatched chapter presentation instead of labeling F reunion as episode 69',()=>{
 const row={gameId:'srwf-final',completedEpisode:69,completedTitleIndex:30,heroNameBytes:[],dateMinutes:0};
 assert.equal(saveSummary(row).progress,'화수·제목 불일치 (저장값 69화)');
 for(const episode of [33,34])assert.equal(saveSummary({...row,completedEpisode:episode}).progress,`제${episode}화 클리어`);
});

test('saved Final hero name uses the pilot glyph table and normalizes the full-width separator',()=>{
 const codes=['미','나','　','라'].flatMap(glyph=>{const key=[...FINAL_PILOT_NAME_MAP].find(([,v])=>v===glyph)?.[0];assert.ok(key);return key.match(/../g).map(n=>parseInt(n,16));});
 assert.equal(saveHeroName({gameId:'srwf-final',heroNameBytes:[...codes,255]}),'미나 라');
});
