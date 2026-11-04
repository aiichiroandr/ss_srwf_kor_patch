import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {createScenarioDialogueEditor} from '../assets/editor-scenario-dialogue-ui.mjs';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function setup({canEdit=true,validator=true}={}){
 const document=installFakeDom();loadHtml(document,html);const $=id=>document.getElementById(id),changes=[];
 const rows=[{recordIndex:'0:64',physicalIndex:0,text:'여긴 어디야',original:{text:'여긴 어디야'},maxBytes:24,editable:true,owners:[{recordIndex:'0:1'},{recordIndex:'0:2'}],controlTokens:[{kind:'F6',label:'화자 #3'}]},{recordIndex:'0:128',physicalIndex:0,text:'일단 도와줘',originalText:'일단 도와줘',maxBytes:20,editable:true,owners:[],controlTokens:[]}];
 const calls=[];let ui;
 const validateText=(row,text)=>{calls.push({row,text});const bytes=Array.from(text).reduce((n,char)=>n+(char.charCodeAt(0)>127?2:1),0);return text.includes('\n')?{valid:false,bytes,message:'제어 명령을 유지하려면 줄바꿈을 넣을 수 없습니다.'}:bytes>row.maxBytes?{valid:false,bytes,message:'원래 본문 공간을 넘었습니다.'}:{valid:true,bytes,addedGlyphs:text.includes('힣')?['힣']:[]};};
 ui=createScenarioDialogueEditor({el:$,rows:()=>rows,canEdit:()=>canEdit,validateText:validator?validateText:undefined,onChange:(kind,row)=>{changes.push({kind,row});ui.refresh(0);}});ui.refresh(0);
 const input=(id,value)=>{const el=$(id);el.value=value;el.dispatchEvent({type:'input',target:el});};
 return {document,$,ui,rows,changes,calls,input};
}
test('validated dialogue commits through the host, retains input focus and shows byte and glyph feedback',()=>{
 const {document,$,ui,rows,changes,calls,input}=setup(),text=$('scenarioDialogueText');text.focus();
 input('scenarioDialogueText','여긴 힣');
 assert.equal(rows[0].text,'여긴 힣');assert.equal(changes.length,1);assert.equal(changes[0].kind,'dialogue');assert.ok(changes[0].row===rows[0]);
 assert.ok(calls.at(-1).row===rows[0]);assert.equal(calls.at(-1).text,'여긴 힣');assert.ok(document.activeElement===text);assert.ok($('scenarioDialogueText')===text);
 assert.equal(text.value,'여긴 힣');assert.equal(text.getAttribute('aria-invalid'),null);assert.equal($('scenarioDialogueChanged').hidden,false);
 assert.equal($('scenarioDialogueBytes').textContent,'7 / 24 바이트');assert.match($('scenarioDialogueStatus').textContent,/글자 1개 추가/);
 assert.match($('scenarioDialogueOwners').textContent,/연결 2곳/);assert.match($('scenarioDialogueTokens').textContent,/화자 #3/);assert.equal(ui.validate(),true);
 $('scenarioDialogueReset').click();assert.equal(rows[0].text,rows[0].original.text);assert.equal(changes.length,2);assert.equal($('scenarioDialogueChanged').hidden,true);assert.ok(document.activeElement===text);
});
test('invalid drafts survive refresh, never reach rows and block record navigation until repaired or reset',()=>{
 const {document,$,ui,rows,changes,input}=setup(),original=rows[0].text;
 input('scenarioDialogueText','너무 긴 본문 '.repeat(20));const draft=$('scenarioDialogueText').value;
 assert.equal(rows[0].text,original);assert.equal(changes.length,0);assert.equal($('scenarioDialogueText').getAttribute('aria-invalid'),'true');
 ui.refresh(0);assert.equal($('scenarioDialogueText').value,draft);assert.equal(ui.validate({report:true}),false);assert.ok(document.activeElement===$('scenarioDialogueText'));
 $('scenarioDialogueList').querySelectorAll('button')[1].click();assert.equal($('scenarioDialogueText').value,draft);assert.match($('scenarioDialogueTitle').textContent,/#0:64/);
 assert.equal(ui.focus('0:128'),false);$('scenarioDialogueNext').click();assert.match($('scenarioDialogueTitle').textContent,/#0:64/);
 $('scenarioDialogueReset').click();assert.equal($('scenarioDialogueText').value,original);assert.equal(ui.validate(),true);assert.equal(changes.length,0);
 $('scenarioDialogueNext').click();assert.match($('scenarioDialogueTitle').textContent,/#0:128/);
 input('scenarioDialogueText','새 본문');assert.equal(rows[1].text,'새 본문');$('scenarioDialogueReset').click();assert.equal(rows[1].text,rows[1].originalText);
});
test('protected layout errors, read-only rows and unavailable encoders cannot write text',()=>{
 const fixture=setup();fixture.input('scenarioDialogueText','첫줄\n둘째줄');assert.equal(fixture.changes.length,0);assert.match(fixture.$('scenarioDialogueStatus').textContent,/줄바꿈/);
 fixture.$('scenarioDialogueReset').click();fixture.rows[0].editable=false;fixture.rows[0].readOnlyReason='문맥이 확정되지 않았습니다.';fixture.ui.refresh(0);
 assert.equal(fixture.$('scenarioDialogueText').disabled,true);fixture.input('scenarioDialogueText','변경');assert.equal(fixture.rows[0].text,fixture.rows[0].original.text);assert.match(fixture.$('scenarioDialogueStatus').textContent,/문맥/);
 const unavailable=setup({validator:false});assert.equal(unavailable.$('scenarioDialogueText').disabled,true);unavailable.input('scenarioDialogueText','변경');assert.equal(unavailable.changes.length,0);
 const busy=setup({canEdit:false});assert.equal(busy.$('scenarioDialogueText').disabled,true);busy.input('scenarioDialogueText','변경');assert.equal(busy.changes.length,0);
});
test('explicit same-speaker pages add, navigate, validate and remove without writing raw control tokens',()=>{
 const document=installFakeDom();loadHtml(document,html);const $=id=>document.getElementById(id),changes=[];
 const row={recordIndex:'0:64',text:'첫 문구',originalText:'첫 문구',pagesJson:'',original:{text:'첫 문구',pagesJson:''},maxBytes:12,maxExpandedBytes:107,editable:true,expandable:true,pagesEditable:true};
 const validatePages=(_row,json)=>{const pages=json?JSON.parse(json):[];return pages.some(text=>text.includes('\n')||text.length>50)?{valid:false,message:'페이지를 확인하세요.'}:{valid:true,bytes:pages.join('').length*2};};
 let ui;ui=createScenarioDialogueEditor({el:$,rows:()=>[row],canEdit:()=>true,validateText:(_r,text)=>({valid:true,bytes:text.length*2}),validatePages,onChange:()=>{changes.push(row.pagesJson);ui.refresh(0);}});ui.refresh(0);
 $('scenarioDialoguePageAdd').click();assert.deepEqual(JSON.parse(row.pagesJson),['첫 문구','']);assert.equal($('scenarioDialogueText').value,'');
 $('scenarioDialogueText').value='다음 문구';$('scenarioDialogueText').dispatchEvent({type:'input'});assert.deepEqual(JSON.parse(row.pagesJson),['첫 문구','다음 문구']);assert.equal(row.text,'첫 문구');
 $('scenarioDialoguePagePrevious').click();assert.equal($('scenarioDialogueText').value,'첫 문구');
 $('scenarioDialogueText').value='수정 첫쪽';$('scenarioDialogueText').dispatchEvent({type:'input'});assert.match($('scenarioDialogueList').querySelector('button').textContent,/수정 첫쪽/);$('scenarioDialogueSearch').value='다음 문구';$('scenarioDialogueSearch').dispatchEvent({type:'input'});assert.equal($('scenarioDialogueList').querySelectorAll('button').length,1);$('scenarioDialogueText').value='첫 문구';$('scenarioDialogueText').dispatchEvent({type:'input'});
 $('scenarioDialogueText').value='틀린\n문구';$('scenarioDialogueText').dispatchEvent({type:'input'});assert.equal(ui.validate(),false);$('scenarioDialoguePageNext').click();assert.equal($('scenarioDialogueText').value,'틀린\n문구');assert.deepEqual(JSON.parse(row.pagesJson),['첫 문구','다음 문구']);$('scenarioDialoguePageRemove').click();assert.equal($('scenarioDialogueText').value,'틀린\n문구');assert.deepEqual(JSON.parse(row.pagesJson),['첫 문구','다음 문구']);
 $('scenarioDialogueReset').click();assert.equal(row.pagesJson,'');assert.equal(row.text,'첫 문구');assert.equal(ui.validate(),true);
 $('scenarioDialoguePageAdd').click();$('scenarioDialogueText').value='남길 문구';$('scenarioDialogueText').dispatchEvent({type:'input'});$('scenarioDialoguePagePrevious').click();$('scenarioDialoguePageRemove').click();assert.equal(row.pagesJson,'');assert.equal(row.text,'남길 문구');
});
function speakerSetup({canEdit=true,textEditable=true}={}){
 const document=installFakeDom();loadHtml(document,html);const $=id=>document.getElementById(id),changes=[],speakerCalls=[],artCalls=[];
 const rows=[{recordIndex:'0:64',physicalIndex:0,text:'첫 문구',original:{text:'첫 문구',pagesJson:'',speakerId:10},pagesJson:'',maxBytes:24,editable:textEditable,speakerId:10,speakerVariant:2,speakerEditable:true,speakerIdentity:'shared-b1',owners:[{recordIndex:'0:1'},{recordIndex:'0:2'}],controlTokens:[]},{recordIndex:'0:128',physicalIndex:0,text:'둘째 문구',originalText:'둘째 문구',originalSpeakerId:10,maxBytes:24,editable:true,speakerId:10,speakerVariant:2,speakerEditable:true,speakerIdentity:'shared-b1',owners:[{recordIndex:'0:1'}],controlTokens:[]},{recordIndex:'0:192',physicalIndex:0,text:'다른 문구',originalText:'다른 문구',originalSpeakerId:10,maxBytes:24,editable:true,speakerId:10,speakerVariant:0,speakerEditable:false,speakerReadOnlyReason:'공유 명령의 표정이 서로 다릅니다.',speakerIdentity:'other-b1',owners:[],controlTokens:[]}];
 const options=[{pilotId:10,faceId:10,variantCount:4,identity:'pilot-10',name:'아무로'},{pilotId:71,faceId:71,variantCount:4,identity:'pilot-71',name:'시북'},{pilotId:72,faceId:72,variantCount:1,identity:'pilot-72',name:'샤아'}];let ui;
 ui=createScenarioDialogueEditor({el:$,rows:()=>rows,canEdit:()=>canEdit,speakerOptions:()=>options,validateSpeaker:(row,id)=>({valid:row.speakerEditable&&options.some(o=>o.pilotId===id&&o.variantCount>row.speakerVariant),message:'이 화자는 원래 표정 슬롯을 표시할 수 없습니다.'}),setSpeaker:(row,id)=>{speakerCalls.push({row,id});for(const other of rows)if(other.speakerIdentity===row.speakerIdentity)other.speakerId=id;},appendArtwork:(box,reference)=>{artCalls.push(reference.pilotId);const canvas=document.createElement('canvas');canvas.dataset.pilotId=String(reference.pilotId);box.append(canvas);},validateText:(_row,text)=>({valid:!text.includes('\n'),bytes:text.length*2,message:text.includes('\n')?'줄바꿈을 넣을 수 없습니다.':''}),onChange:(kind,row)=>{changes.push({kind,row});ui.refresh(0);}});ui.refresh(0);
 const change=id=>{const select=$('scenarioDialogueSpeaker');select.value=String(id);select.dispatchEvent({type:'change'});};return{document,$,rows,options,changes,speakerCalls,artCalls,ui,change};
}
test('speaker changes keep the existing select focused, disable absent expressions, propagate shared rows and restore all original fields',()=>{
 const f=speakerSetup(),select=f.$('scenarioDialogueSpeaker');assert.equal(select.disabled,false);assert.equal(select.value,'10');assert.equal(select.children.find(o=>o.value==='72').disabled,true);assert.match(f.$('scenarioDialogueSpeakerVariant').textContent,/#2/);assert.deepEqual(f.artCalls,[10]);
 select.focus();f.change(71);assert.equal(f.document.activeElement,select);assert.equal(f.$('scenarioDialogueSpeaker'),select);assert.deepEqual(f.rows.map(r=>r.speakerId),[71,71,10]);assert.equal(f.changes.length,1);assert.equal(f.changes[0].kind,'dialogue');assert.equal(f.$('scenarioDialogueChanged').hidden,false);assert.match(f.$('scenarioDialogueCount').textContent,/수정 2개/);assert.match(f.$('scenarioDialogueOwners').textContent,/모든 구간/);assert.deepEqual(f.artCalls,[10,71]);assert.equal(f.$('scenarioDialogueSpeakerArt').querySelector('canvas').dataset.pilotId,'71');
 f.$('scenarioDialogueText').value='수정한 본문';f.$('scenarioDialogueText').dispatchEvent({type:'input'});f.$('scenarioDialogueReset').click();assert.equal(f.rows[0].text,'첫 문구');assert.deepEqual(f.rows.map(r=>r.speakerId),[10,10,10]);assert.equal(f.speakerCalls.length,2);assert.equal(f.changes.length,3,'text+speaker reset commits as one host change');assert.equal(f.$('scenarioDialogueChanged').hidden,true);assert.match(f.$('scenarioDialogueCount').textContent,/수정 0개/);
});
test('invalid body drafts and incompatible speaker selections cannot mutate the shared speaker',()=>{
 const f=speakerSetup();f.change(72);assert.equal(f.rows[0].speakerId,10);assert.equal(f.speakerCalls.length,0);assert.equal(f.$('scenarioDialogueSpeaker').value,'10');assert.equal(f.$('scenarioDialogueSpeaker').getAttribute('aria-invalid'),'true');assert.match(f.$('scenarioDialogueSpeakerStatus').textContent,/표정/);
 f.change(71);assert.equal(f.speakerCalls.length,1);assert.equal(f.$('scenarioDialogueSpeaker').getAttribute('aria-invalid'),null);
 f.$('scenarioDialogueText').value='잘못된\n초안';f.$('scenarioDialogueText').dispatchEvent({type:'input'});f.change(10);assert.equal(f.speakerCalls.length,1);assert.equal(f.$('scenarioDialogueSpeaker').value,'71');assert.equal(f.document.activeElement,f.$('scenarioDialogueText'));assert.equal(f.$('scenarioDialogueText').value,'잘못된\n초안');assert.equal(f.ui.validate(),false);
 f.$('scenarioDialogueReset').click();assert.deepEqual(f.rows.map(r=>r.speakerId),[10,10,10]);assert.equal(f.ui.validate(),true);assert.equal(f.$('scenarioDialogueText').value,'첫 문구');
 f.ui.focus('0:192');assert.equal(f.$('scenarioDialogueSpeaker').disabled,true);f.change(71);assert.equal(f.rows[2].speakerId,10);assert.match(f.$('scenarioDialogueSpeakerStatus').textContent,/공유/);
 const busy=speakerSetup({canEdit:false});busy.change(71);assert.equal(busy.speakerCalls.length,0);assert.equal(busy.$('scenarioDialogueSpeaker').disabled,true);
});
test('a speaker-only row can change and restore its speaker while its text remains read-only',()=>{
 const f=speakerSetup({textEditable:false});assert.equal(f.$('scenarioDialogueText').disabled,true);assert.equal(f.$('scenarioDialogueSpeaker').disabled,false);f.change(71);assert.equal(f.$('scenarioDialogueReset').disabled,false);f.$('scenarioDialogueReset').click();assert.equal(f.rows[0].speakerId,10);assert.equal(f.rows[0].text,'첫 문구');assert.equal(f.changes.length,2);assert.equal(f.document.activeElement,f.$('scenarioDialogueSpeaker'));
});
