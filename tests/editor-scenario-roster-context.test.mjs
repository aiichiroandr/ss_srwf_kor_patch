import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {readScenarioRosterBodyCatalog} from '../assets/editor-scenario-roster-catalog.mjs';
import {formatRosterContext} from '../assets/editor-scenario-roster-context.mjs';
import {createScenarioRosterEditor} from '../assets/editor-scenario-roster-ui.mjs';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function fixture(){
 const decoded=new Uint8Array(512),view=new DataView(decoded.buffer),roots=Array(14).fill(64);
 roots.forEach((offset,index)=>view.setInt32(index*4,offset-index*4));
 decoded.set([0xd0,2,0,26,0xf0,0,0,26,0xc7,0,100,0x64,200,0xc1,6,0x60,101,0xc1,11,0,100,0,101,0xb1,0,0,1,0x93,0xea],64);
 view.setInt16(88,400-88);decoded[96]=0xea;
 const catalog=readScenarioRosterBodyCatalog({physicalIndex:1,decoded,roots,slots:[101]},'srwf-final',{pilotCount:400,unitCount:448});
 const row={...catalog.joins[0],name:'코스모 · 이데온',initialLevel:50,original:{initialLevel:50},editable:true,rosterContext:catalog.joins[0]};
 const pilots=[{recordIndex:100,name:'코스모'},{recordIndex:101,name:'카샤'}],units=[{recordIndex:200,name:'이데온'}];
 const dialogues=[{recordIndex:'1:400',physicalIndex:1,byteOffset:400,speakerId:100,text:'여긴 어디야?',owners:[{recordIndex:'1:87'}]}];
 return {row,pilots,units,dialogues,catalog:{...catalog,pilotFamilies:[{id:100,recordIndices:['roster:1:72','roster:2:64']}],unitFamilies:[]}};
}

test('roster context joins proved commands and B1 owners to current actor names and dialogue, without moving data',()=>{
 const f=fixture(),before=JSON.stringify(f),data=formatRosterContext(f.row,f);
 assert.equal(data.conditions[0].text,'플래그 #26 검사 · F0 분기 비이동 경로');
 assert.deepEqual(data.commands.map(item=>item.text),['코스모 + 이데온 생성 · 초기 Lv50','카샤 생성 · 초기 Lv48','코스모 → 카샤 연결']);
 assert.equal(data.calls.length,1);assert.equal(data.calls[0].recordIndex,'1:400');assert.equal(data.calls[0].text,'코스모 · 여긴 어디야?');assert.equal(data.calls[0].relation,'생성 뒤 도달 가능한 경로');
 assert.match(data.source,/동일 파일럿 생성 2곳/u);assert.match(data.sourceTitle,/진행 순서를 뜻하지/u);assert.match(data.notice,/조기 이동 편집 미지원/u);assert.match(data.calls[0].title,/필수 연출 여부 미확인/u);assert.equal(JSON.stringify(f),before);
 f.row.initialLevel=33;f.dialogues[0].text='도와줘!';f.dialogues[0].speakerId=101;
 const edited=formatRosterContext(f.row,f);assert.match(edited.commands[0].text,/Lv33/u);assert.equal(edited.calls[0].text,'카샤 · 도와줘!');
 // Equal target bytes are not sufficient: only the actual B1 owner binds it.
 f.dialogues[0].owners=[{recordIndex:'1:88'}];const unresolved=formatRosterContext(f.row,f);assert.equal(unresolved.calls[0].recordIndex,null);assert.match(unresolved.calls[0].text,/본문 연결 미확인/u);
});

test('unknown producers, native-only anchors and same-callback calls stay uncertain',()=>{
 const f=fixture(),original=f.row.rosterContext;
 f.row.rosterContext={...original,contexts:[{reachedFromRoot:true,complete:false,rootIndices:[1],start:64,guards:[{opcode:'F2',taken:true,comparison:'eq',value:3,producer:null}]}],dialogueCalls:original.dialogueCalls.map(call=>({...call,relation:'same-callback'}))};
 const data=formatRosterContext(f.row,f);assert.equal(data.conditions[0].text,'이전 조건 미확인 = 3 · F2 분기 이동 경로');assert.equal(data.conditions[1].text,'미해석 경로가 남아 있음');assert.equal(data.calls[0].relation,'동일 콜백 · 순서 미확인');assert.doesNotMatch(JSON.stringify(data),/필수 연출입니다|플래그.*합류 완료/u);
 f.row.rosterContext={...original,contexts:[{reachedFromRoot:false,complete:true,rootIndices:[2],start:64,guards:original.contexts[0].guards}]};
 assert.equal(formatRosterContext(f.row,f).conditions[0].text,'이전 조건 미확인 · 원래 생성 명령의 경계만 확인');
 assert.equal(formatRosterContext({...f.row,rosterContext:null},f),null);
});

test('roster links start closed, preserve input and navigation focus, block invalid drafts and open only a linked dialogue',()=>{
 const document=installFakeDom();loadHtml(document,html);const $=id=>document.getElementById(id),f=fixture(),changes=[],opened=[];
 const second={...f.row,recordIndex:'roster:1:172',name:'다른 생성 지점'},rows=[f.row,second];
 const ui=createScenarioRosterEditor({el:$,rows:()=>rows,context:()=>f,canEdit:()=>true,onChange:(kind,row)=>{changes.push([kind,row.recordIndex]);ui.refresh(1);},onOpenDialogue:id=>opened.push(id)});ui.refresh(1);
 const entries=$('scenarioRosterList').querySelectorAll('.scenario-roster-entry'),toggle=entries[0].querySelector('.scenario-roster-context-toggle'),context=entries[0].querySelector('.scenario-roster-context'),input=entries[0].querySelector('input'),otherToggle=entries[1].querySelector('.scenario-roster-context-toggle');
 assert.equal(context.hidden,true);assert.equal(context.children.length,0);toggle.click();assert.equal(context.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(changes.length,0);
 const link=context.querySelector('[data-dialogue="1:400"]');assert.ok(link);link.focus();ui.sync();assert.equal(context.querySelector('[data-dialogue="1:400"]'),link);assert.equal(document.activeElement,link);link.click();assert.deepEqual(opened,['1:400']);
 context.scrollTop=42;input.focus();input.value='33';input.dispatchEvent({type:'input'});assert.equal(document.activeElement,input);assert.equal(entries[0].querySelector('input'),input);assert.equal(context.scrollTop,42);assert.match(context.textContent,/Lv33/u);assert.equal(changes.length,1);
 input.value='100';input.dispatchEvent({type:'input'});otherToggle.click();assert.equal(context.hidden,false);assert.equal(entries[1].querySelector('.scenario-roster-context').hidden,true);context.querySelector('[data-dialogue="1:400"]').click();assert.equal(opened.length,1);assert.equal(document.activeElement,input);
 entries[0].querySelector('.scenario-roster-row button').click();assert.equal(f.row.initialLevel,50);assert.equal(ui.validate(),true);otherToggle.click();assert.equal(context.hidden,true);assert.equal(entries[1].querySelector('.scenario-roster-context').hidden,false);
 ui.refresh(2);assert.equal($('scenarioRosterList').querySelector('.scenario-roster-context').hidden,true);
});

test('unread context and unresolved B1 calls expose no false navigation action',()=>{
 const document=installFakeDom();loadHtml(document,html);const $=id=>document.getElementById(id),f=fixture();f.dialogues=[];
 const missing={...f.row,recordIndex:'roster:1:90',rosterContext:null},ui=createScenarioRosterEditor({el:$,rows:()=>[f.row,missing],context:()=>f,canEdit:()=>true,onChange:()=>{},onOpenDialogue:()=>assert.fail('Unresolved call must not navigate')});ui.refresh(1);
 const toggles=$('scenarioRosterList').querySelectorAll('.scenario-roster-context-toggle');assert.equal(toggles[1].disabled,true);toggles[0].click();const button=$('scenarioRosterList').querySelector('.scenario-roster-dialogues button');assert.equal(button.disabled,true);assert.match(button.textContent,/본문 연결 미확인/u);
});
