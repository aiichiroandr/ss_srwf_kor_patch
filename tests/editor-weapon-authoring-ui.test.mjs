import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom} from './helpers/fake-dom.mjs';
import {createWeaponAuthoringUI} from '../assets/editor-weapon-authoring-ui.mjs';
function fixture(inspection=null,{onPreview,onPreviewEffect,onDraftChange,duringApply,followSelection=false,unlinkedCatalog=false,sourceName='빔사벨',gameId='srwf-final',baseHash=null}={}){
 const doc=installFakeDom(),container=doc.createElement('div');doc.body.append(container);
 const newId=gameId==='srwf-f'?1248:1331;let entries=[{weaponIndex:newId,sourceWeapon:1,unitIndex:1,edits:[]}],calls=0;
 const weapons=[{recordIndex:1,name:sourceName,editable:true,owners:[{unit:1}]},
  {recordIndex:245,name:'돌격',editable:true,owners:[{unit:54}]},
  {recordIndex:newId,name:sourceName,editable:true,owners:[{unit:1}],authoring:{isNew:true,sourceWeapon:1}}];
 if(unlinkedCatalog)weapons.push({recordIndex:4,name:'미연결 효과',editable:true,owners:[],ownership:'unowned'},{recordIndex:5,name:'기본 연출뿐',editable:true,owners:[],ownership:'unowned'});
 const ui=createWeaponAuthoringUI({container,getEntries:()=>entries,getOwner:()=>1,
  readMotionCatalog:unlinkedCatalog?async()=>({entries:[{recordIndex:4,name:'미연결 효과',ownership:'unowned',previewEligible:true},{recordIndex:5,name:'기본 연출뿐',ownership:'unowned',previewEligible:false}],counts:{unlinkedPrograms:1}}):undefined,
  onPreview,onPreviewEffect,onDraftChange,getWeapons:()=>followSelection?weapons.filter(w=>!w.authoring?.isNew||entries.some(e=>e.weaponIndex===w.recordIndex)):weapons,getUnits:()=>[{recordIndex:1,name:'건담'}],getGame:()=>gameId,getBaseHash:()=>baseHash,
  inspect:async request=>{if(typeof inspection==='function')return inspection(request);if(inspection)return inspection;throw Error('No inspection requested');},
  apply:async next=>{calls++;entries=next;duringApply?.();},onToggle(){},onSelect(id){if(followSelection)ui.select(weapons.find(w=>w.recordIndex===id));}});
 ui.select(weapons[2]);
 return {ui,container,input:container.querySelector('input'),select:container.querySelector('select'),
  button:[...container.querySelectorAll('button')].find(node=>node.textContent==='무기 설정 적용'),
  entries:()=>entries,calls:()=>calls};
}
test('unchanged configuration does not create a spurious project update',async()=>{
 const f=fixture();f.button.click();await Promise.resolve();
 assert.equal(f.calls(),0);assert.equal(await f.ui.flush(),true);
 assert.equal(f.calls(),0);
});
test('invalid glyph prevents writes; valid name and donor flush together without old operands',async()=>{
 const f=fixture();f.input.value='🚀';assert.equal(await f.ui.flush(),false);
 assert.equal(f.calls(),0);assert.equal(f.input.getAttribute('aria-invalid'),'true');
 f.input.value='웨이브라이더어택';f.select.value='245';
 assert.equal(await f.ui.flush(),true);assert.equal(f.calls(),1);
 assert.equal(f.entries()[0].name,'웨이브라이더어택');
 assert.equal(f.entries()[0].animationWeapon,245);assert.deepEqual(f.entries()[0].edits,[]);
 assert.equal(f.container.querySelector('[role="status"]').textContent,'무기 이름과 공격 연출을 적용했습니다.');
});

test('reselecting the same weapon preserves pending name and motion inputs',async()=>{
 const f=fixture();f.input.value='웨이브라이더어택';f.select.value='245';
 f.ui.select({recordIndex:1331,name:'빔사벨',editable:true,owners:[{unit:1}],authoring:{isNew:true,sourceWeapon:1}});
 assert.equal(f.input.value,'웨이브라이더어택');assert.equal(f.select.value,'245');
 assert.equal(await f.ui.flush(),true);assert.equal(f.entries()[0].animationWeapon,245);
});

test('switching weapons retains pending configuration and export flushes it from another selection',async()=>{
 const f=fixture();f.input.value='웨이브라이더어택';f.select.value='245';
 f.ui.select({recordIndex:1,name:'빔사벨',editable:true,owners:[{unit:1}]});
 assert.equal(await f.ui.flush(),true);assert.equal(f.entries()[0].name,'웨이브라이더어택');assert.equal(f.entries()[0].animationWeapon,245);
});
test('returning to a new weapon restores its unapplied draft',()=>{
 const f=fixture();f.input.value='웨이브라이더어택';f.select.value='245';
 f.ui.select({recordIndex:1,name:'빔사벨',editable:true,owners:[{unit:1}]});
 f.ui.select({recordIndex:1331,name:'빔사벨',editable:true,owners:[{unit:1}],authoring:{isNew:true,sourceWeapon:1}});
 assert.equal(f.input.value,'웨이브라이더어택');assert.equal(f.select.value,'245');assert.equal(f.calls(),0);
});

test('cloning a pending configuration first applies its name and donor',async()=>{
 const f=fixture({sourceWeapon:1,freeWeaponIndices:[1332],instructions:[]});
 f.input.value='웨이브라이더어택';f.select.value='245';
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='무기 추가').click();
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.equal(f.entries().length,2);assert.equal(f.entries()[1].weaponIndex,1332);
 assert.equal(f.entries()[1].name,'웨이브라이더어택');assert.equal(f.entries()[1].animationWeapon,245);
});

test('effect selector shows source picture identities instead of unexplained sequence numbers',async()=>{
 const f=fixture({sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[{name:'spawnSequence',editable:true,choices:[1,2],min:0,max:2,value:1,originalValue:1}]}],effectCatalog:[{sequenceIndex:1,pictureSelectors:[7,9]},{sequenceIndex:2,pictureSelectors:[]}]});
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='연출 편집').click();
 for(let i=0;i<10;i++)await Promise.resolve();
 const select=f.container.querySelector('[data-weapon-motion-field="spawnSequence"]');
 assert.ok(select);assert.equal(select.options[0].textContent,'2 · 그림 8·10 · 기본');
 assert.equal(select.options[1].textContent,'3 · 그림 연결 미확인');
});
test('screen-effect clips are labelled before selection, including clips without sprite pictures',async()=>{
 const f=fixture({sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[{name:'spawnSequence',editable:true,choices:[1,2],min:0,max:2,value:1,originalValue:1}]}],effectCatalog:[
  {sequenceIndex:1,pictureSelectors:[7],screenEffects:1},
  {sequenceIndex:2,pictureSelectors:[],screenEffects:1}]});
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='연출 편집').click();
 for(let i=0;i<10;i++)await Promise.resolve();
 const select=f.container.querySelector('[data-weapon-motion-field="spawnSequence"]');
 assert.equal(select.options[0].textContent,'2 · 그림 8 · 화면 효과 포함 · 기본');
 assert.equal(select.options[1].textContent,'3 · 화면 효과 포함');assert.equal(f.calls(),0);
});
test('sound-bearing clips expose their audio dependency before selection',async()=>{
 const f=fixture({sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[{name:'spawnSequence',editable:true,choices:[1],min:0,max:1,value:1,originalValue:1}]}],effectCatalog:[{sequenceIndex:1,pictureSelectors:[7],soundCues:2}]});
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='연출 편집').click();
 for(let i=0;i<10;i++)await Promise.resolve();
 const select=f.container.querySelector('[data-weapon-motion-field="spawnSequence"]');
 assert.equal(select.options[0].textContent,'2 · 그림 8 · 효과음 포함 · 기본');
 assert.equal(f.calls(),0);
});

test('foreign effect selection applies portable donor identity, keeps unrelated edits and supports removal',async()=>{
 const inspection={start:100,sourceWeapon:1,freeWeaponIndices:[],sequences:[{start:100,end:120},{start:160,end:184}],instructions:[{recordOffset:48,fields:[{name:'spawnSequence',editable:true,choices:[1],min:0,max:1,value:1,originalValue:1}]}],effectCatalog:[],importOptions:[{targetSequence:1,donorWeapon:245,donorSequence:2,dependencies:{pictureSelectors:[9]}}]};
 const f=fixture(request=>request.effectChange?{effectChange:{edits:[{recordOffset:90,field:'holdDuration',value:9}],imports:request.effectChange.remove?[]:[{targetSequence:1,donorWeapon:245,donorSequence:2,placement:'append'}]}}:inspection);
 f.entries()[0].edits=[{recordOffset:70,field:'holdDuration',value:8},{recordOffset:90,field:'holdDuration',value:9}];
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='연출 편집').click();for(let i=0;i<10;i++)await Promise.resolve();
 const donor=[...f.container.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')==='효과 원본 무기');donor.value='245';donor.dispatchEvent({type:'change'});for(let i=0;i<10;i++)await Promise.resolve();
 const effect=[...f.container.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')==='가져올 효과');assert.equal(effect.options[0].textContent,'효과 3 · 그림 10');effect.value='2';
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='효과 가져오기').click();for(let i=0;i<40;i++)await Promise.resolve();
 assert.deepEqual(f.entries()[0].imports,[{targetSequence:1,donorWeapon:245,donorSequence:2,placement:'append'}]);
 assert.deepEqual(f.entries()[0].edits,[{recordOffset:90,field:'holdDuration',value:9}]);
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='가져온 효과 해제').click();for(let i=0;i<40;i++)await Promise.resolve();
 assert.equal(f.entries()[0].imports,undefined);assert.equal(f.entries()[0].edits.length,1);
});

test('effect combination preview keeps saved recipes and pending inputs unchanged without any apply call',async()=>{
 const inspection={sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[{name:'spawnSequence',editable:true,choices:[1],min:0,max:1,value:1,originalValue:1},{name:'spawnX',editable:true,min:-100,max:100,value:4,originalValue:4}]}],effectCatalog:[],importOptions:[{targetSequence:1,donorWeapon:245,donorSequence:2,dependencies:{pictureSelectors:[9]}}]};
 let preview;
 const f=fixture(request=>request.effectChange?{effectChange:{edits:request.weaponAuthoring[0].edits,imports:[{targetSequence:1,donorWeapon:245,donorSequence:2,placement:'append'}]}}:inspection,{onPreviewEffect:value=>{preview=value;}});
 f.entries()[0].edits=[{recordOffset:90,field:'holdDuration',value:9}];const before=JSON.stringify(f.entries());
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='연출 편집').click();for(let i=0;i<10;i++)await Promise.resolve();
 const pending=f.container.querySelector('[data-weapon-motion-field="spawnX"]');pending.value='99';
 const donor=[...f.container.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')==='효과 원본 무기');donor.value='245';donor.dispatchEvent({type:'change'});for(let i=0;i<10;i++)await Promise.resolve();
 const effect=[...f.container.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')==='가져올 효과');effect.value='2';
 const button=[...f.container.querySelectorAll('button')].find(b=>b.textContent==='조합 미리보기');assert.equal(button.hidden,false);assert.equal(button.disabled,false);button.click();for(let i=0;i<25;i++)await Promise.resolve();
 assert.equal(preview.weaponIndex,1331);assert.deepEqual(preview.entries[0].imports,[{targetSequence:1,donorWeapon:245,donorSequence:2,placement:'append'}]);
 assert.ok(preview.entries[0].edits.some(e=>e.recordOffset===48&&e.field==='spawnX'&&e.value===99));
 assert.equal(f.calls(),0);assert.equal(JSON.stringify(f.entries()),before);assert.equal(pending.value,'99');
 preview.entries[0].edits[0].value=20;assert.equal(JSON.stringify(f.entries()),before);
 preview=null;pending.value='';button.click();for(let i=0;i<10;i++)await Promise.resolve();
 assert.equal(preview,null);assert.equal(f.calls(),0);assert.equal(JSON.stringify(f.entries()),before);
});

test('a pending combination preview cannot open for a weapon selected later',async()=>{
 let resolvePlan,opened=0;const plan=new Promise(resolve=>{resolvePlan=resolve;});
 const inspection={sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[{name:'spawnSequence',editable:true,choices:[1],min:0,max:1,value:1,originalValue:1}]}],effectCatalog:[],importOptions:[{targetSequence:1,donorWeapon:245,donorSequence:2,dependencies:{pictureSelectors:[9]}}]};
 const f=fixture(request=>request.effectChange?plan:inspection,{onPreviewEffect:()=>{opened++;}});
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='연출 편집').click();for(let i=0;i<10;i++)await Promise.resolve();
 const donor=[...f.container.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')==='효과 원본 무기');donor.value='245';donor.dispatchEvent({type:'change'});for(let i=0;i<10;i++)await Promise.resolve();
 [...f.container.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')==='가져올 효과').value='2';
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='조합 미리보기').click();await Promise.resolve();
 f.ui.select({recordIndex:1,name:'빔사벨',editable:true,owners:[{unit:1}]});
 resolvePlan({effectChange:{edits:[],imports:[{targetSequence:1,donorWeapon:245,donorSequence:2,placement:'append'}]}});for(let i=0;i<25;i++)await Promise.resolve();
 assert.equal(opened,0);assert.equal(f.calls(),0);assert.equal(f.entries()[0].imports,undefined);
});

test('switching weapons while relocation is planned cannot apply the donor to another selection',async()=>{
 let resolvePlan;const pending=new Promise(resolve=>{resolvePlan=resolve;});
 const inspection={start:100,sourceWeapon:1,freeWeaponIndices:[],sequences:[{start:100,end:120},{start:160,end:184}],instructions:[{recordOffset:48,fields:[{name:'spawnSequence',editable:true,choices:[1],min:0,max:1,value:1,originalValue:1}]}],effectCatalog:[],importOptions:[{targetSequence:1,donorWeapon:245,donorSequence:2,dependencies:{pictureSelectors:[9]}}]};
 const f=fixture(request=>request.effectChange?pending:inspection);
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='연출 편집').click();for(let i=0;i<10;i++)await Promise.resolve();
 const donor=[...f.container.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')==='효과 원본 무기');donor.value='245';donor.dispatchEvent({type:'change'});for(let i=0;i<10;i++)await Promise.resolve();
 const effect=[...f.container.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')==='가져올 효과');effect.value='2';
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='효과 가져오기').click();for(let i=0;i<25;i++)await Promise.resolve();
 const calls=f.calls();f.ui.select({recordIndex:1,name:'빔사벨',editable:true,owners:[{unit:1}]});
 resolvePlan({effectChange:{edits:[],imports:[{targetSequence:1,donorWeapon:245,donorSequence:2,placement:'append'}]}});
 for(let i=0;i<25;i++)await Promise.resolve();
 assert.equal(f.calls(),calls);assert.equal(f.entries()[0].imports,undefined);assert.equal(f.ui.snapshot().weaponIndex,1);
});

test('contextual body references are labelled as body references rather than missing sprites',async()=>{
 const f=fixture({sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[{name:'spawnSequence',editable:true,choices:[1],min:0,max:1,value:1,originalValue:1}]}],effectCatalog:[{sequenceIndex:1,bodyBindings:['defender'],pictureSelectors:[]}]});
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='연출 편집').click();for(let i=0;i<10;i++)await Promise.resolve();
 const picker=f.container.querySelector('[data-weapon-motion-field="spawnSequence"]');assert.equal(picker.options[0].textContent,'2 · 대상 기체 참조 · 기본');
});

test('effect source search matches unit names and clears an excluded donor and its effects',async()=>{
 const f=fixture({sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[{name:'spawnSequence',editable:true,choices:[1],min:0,max:1,value:1,originalValue:1}]}],effectCatalog:[],importOptions:[{targetSequence:1,donorWeapon:245,donorSequence:2,dependencies:{pictureSelectors:[9]}}]});
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='연출 편집').click();for(let i=0;i<10;i++)await Promise.resolve();
 const labelled=name=>[...f.container.querySelectorAll('input'),...f.container.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')===name);
 const search=labelled('효과 원본 기체·무기 검색'),donor=labelled('효과 원본 무기'),effect=labelled('가져올 효과');
 search.value='건 담';search.dispatchEvent({type:'input'});
 assert.deepEqual(donor.options.map(o=>o.value),['','1']);assert.match(donor.options[1].textContent,/건담/);
 search.value='돌격';search.dispatchEvent({type:'input'});donor.value='245';donor.dispatchEvent({type:'change'});for(let i=0;i<10;i++)await Promise.resolve();
 assert.equal(effect.options.length,1);
 search.value='없는 무기';search.dispatchEvent({type:'input'});
 assert.equal(donor.value,'');assert.equal(donor.options[0].textContent,'검색 결과 없음');assert.equal(effect.options.length,0);
 assert.equal([...f.container.querySelectorAll('button')].find(b=>b.textContent==='효과 가져오기').disabled,true);
 assert.equal(f.calls(),0);
});

test('effect rejection notice follows the selected target instead of another compatible target',async()=>{
 const f=fixture({sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[{name:'spawnSequence',editable:true,choices:[1,2],min:0,max:2,value:1,originalValue:1}]}],effectCatalog:[],importOptions:[{targetSequence:2,donorWeapon:245,donorSequence:3}],importBlocked:[{targetSequence:1,donorSequence:3,reason:'picture-resource-missing'}]});
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='연출 편집').click();for(let i=0;i<10;i++)await Promise.resolve();
 const donor=[...f.container.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')==='효과 원본 무기');donor.value='245';donor.dispatchEvent({type:'change'});for(let i=0;i<10;i++)await Promise.resolve();
 const notice=[...f.container.querySelectorAll('p')].find(e=>e.textContent.includes('별도 그림 자료'));
 assert.ok(notice);assert.equal(notice.hidden,false);
 const target=f.container.querySelector('[data-weapon-motion-field="spawnSequence"]');target.value='2';
 f.container.querySelector('.weapon-authoring-fields').dispatchEvent({type:'change'});
 assert.equal(notice.hidden,true);assert.equal(f.calls(),0);
});

test('original weapon changes only its motion, retains drafts across selection and resets without a project row',async()=>{
 const f=fixture();f.ui.select({recordIndex:1,name:'빔사벨',editable:true,owners:[{unit:1}]});
 f.select.value='245';
 f.ui.select({recordIndex:245,name:'돌격',editable:true,owners:[{unit:54}]});
 assert.equal(await f.ui.flush(),true);
 const entry=f.entries().find(e=>e.weaponIndex===1);assert.equal(entry.animationWeapon,245);assert.equal(entry.sourceWeapon,1);assert.equal(entry.unitIndex,1);assert.equal(entry.name,undefined);
 f.ui.select({recordIndex:1,name:'빔사벨',editable:true,owners:[{unit:1}],authoring:{isNew:false,sourceWeapon:1}});
 assert.equal(f.select.value,'245');f.select.value='1';assert.equal(await f.ui.flush(),true);
 assert.equal(f.entries().some(e=>e.weaponIndex===1),false);
});

test('external reset of the selected weapon cannot silently restore its previously applied motion on the next save',async()=>{
 const f=fixture(),row={recordIndex:1,name:'빔사벨',editable:true,owners:[{unit:1}]};f.ui.select(row);
 f.select.value='245';assert.equal(await f.ui.flush(),true);assert.equal(f.select.value,'245');
 const index=f.entries().findIndex(e=>e.weaponIndex===1);f.entries().splice(index,1);
 f.ui.select({...row});assert.equal(f.select.value,'1');const calls=f.calls();
 assert.equal(await f.ui.flush(),true);assert.equal(f.calls(),calls);assert.equal(f.entries().some(e=>e.weaponIndex===1),false);
});

test('an unrelated rerender preserves an unapplied motion selection',()=>{
 const f=fixture(),row={recordIndex:1,name:'빔사벨',editable:true,owners:[{unit:1}]};f.ui.select(row);
 f.select.value='245';f.ui.select({...row});assert.equal(f.select.value,'245');assert.equal(f.calls(),0);
});

test('whole motion reset removes only the selected original recipe and leaves other weapons intact',async()=>{
 const f=fixture(),row={recordIndex:1,name:'빔사벨',editable:true,owners:[{unit:1}]};f.ui.select(row);
 f.entries().push({weaponIndex:1,sourceWeapon:1,unitIndex:1,animationWeapon:245,edits:[{recordOffset:50,field:'holdDuration',value:5}],imports:[{targetSequence:1,donorWeapon:245,donorSequence:2}]});f.ui.select({...row});
 const button=[...f.container.querySelectorAll('button')].find(b=>b.textContent==='원본 연출로');assert.equal(button.disabled,false);button.click();for(let i=0;i<20;i++)await Promise.resolve();
 assert.equal(f.entries().length,1);assert.equal(f.entries()[0].weaponIndex,1331);assert.equal(f.select.value,'1');assert.equal(button.disabled,true);
});

test('whole motion reset keeps a new weapon and its pending name without keeping old effect edits',async()=>{
 const f=fixture(),entry=f.entries()[0];entry.animationWeapon=245;entry.edits=[{recordOffset:50,field:'holdDuration',value:5}];entry.imports=[{targetSequence:1,donorWeapon:245,donorSequence:2}];
 f.ui.select({recordIndex:1331,name:'빔사벨',editable:true,owners:[{unit:1}],authoring:{isNew:true,sourceWeapon:1}});
 f.input.value='웨이브라이더어택';[...f.container.querySelectorAll('button')].find(b=>b.textContent==='원본 연출로').click();for(let i=0;i<20;i++)await Promise.resolve();
 assert.equal(f.entries().length,1);assert.deepEqual(f.entries()[0].edits,[]);assert.equal(f.entries()[0].imports,undefined);assert.equal(f.select.value,'1');assert.equal(f.input.value,'웨이브라이더어택');
 assert.equal(await f.ui.flush(),true);assert.equal(f.entries()[0].name,'웨이브라이더어택');
});

test('source motion preview does not apply or validate pending name and motion changes',()=>{
 const previews=[],f=fixture(null,{onPreview:id=>previews.push(id)}),before=structuredClone(f.entries());
 f.input.value='🚀';f.select.value='245';
 [...f.container.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='공격 연출 원본 미리보기').click();
 assert.deepEqual(previews,[245]);assert.equal(f.calls(),0);assert.deepEqual(f.entries(),before);assert.equal(f.input.value,'🚀');assert.equal(f.select.value,'245');
});

test('player edit handoff opens and focuses the motion controls without writing or replacing pending input',async()=>{
 const f=fixture({sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[{name:'horizontalVelocity',editable:true,min:-32768,max:32767,value:5,originalValue:5}]}]});
 assert.equal(f.ui.show(),true);for(let i=0;i<10;i++)await Promise.resolve();
 assert.equal(f.ui.snapshot().open,true);
 const picker=[...f.container.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')==='편집할 원본 움직임');
 assert.equal(f.container.ownerDocument.activeElement,picker);
 const input=f.container.querySelector('[data-weapon-motion-field="horizontalVelocity"]');input.value='7';
 assert.equal(f.ui.show(),true);assert.equal(input.value,'7');assert.equal(f.calls(),0);
 f.ui.clear();assert.equal(f.ui.show(),false);
 f.ui.select({recordIndex:1,name:'미연결 무기',editable:true,owners:[]});assert.equal(f.ui.show(),false);
});

test('a donor blocked at the current call offers existing compatible calls without applying edits',async()=>{
 const field=value=>({name:'spawnSequence',editable:true,choices:[1,2],min:0,max:2,value,originalValue:value});
 const f=fixture({sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[field(1)]},{recordOffset:72,fields:[field(2)]}],effectCatalog:[],importOptions:[{targetSequence:2,donorWeapon:245,donorSequence:3,dependencies:{pictureSelectors:[9]}}],importBlocked:[{targetSequence:1,donorSequence:3,reason:'picture-resource-missing'}]});
 const find=label=>[...f.container.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')===label);
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='연출 편집').click();for(let i=0;i<10;i++)await Promise.resolve();
 const donor=find('효과 원본 무기');donor.value='245';donor.dispatchEvent({type:'change'});for(let i=0;i<10;i++)await Promise.resolve();
 assert.match(f.container.querySelector('[role="status"]').textContent,/현재 연결에는 가져올 수 없습니다/);
 const target=find('효과를 넣을 수 있는 기존 연결');assert.equal(target.options.length,2);assert.equal(target.options[1].textContent,'동작 2 · 연결 효과 3');
 assert.equal(find('가져올 효과').disabled,true);const before=structuredClone(f.entries());
 target.value='72';target.dispatchEvent({type:'change'});
 assert.equal(find('편집할 원본 움직임').value,'72');assert.equal(find('가져올 효과').disabled,false);
 assert.equal(f.container.querySelector('[data-weapon-motion-field="spawnSequence"]').value,'2');
 assert.deepEqual(f.entries(),before);assert.equal(f.calls(),0);
});

const renameAndMotionFixture=()=>fixture({sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[{name:'holdDuration',editable:true,min:1,max:256,value:5,originalValue:5}]}],effectCatalog:[]});
const openMotion=async f=>{[...f.container.querySelectorAll('button')].find(b=>b.textContent==='연출 편집').click();for(let i=0;i<10;i++)await Promise.resolve();return f.container.querySelector('[data-weapon-motion-field="holdDuration"]');};
test('saving a pending rename and same-source motion applies both in one commit before redraw',async()=>{
 const f=renameAndMotionFixture(),input=await openMotion(f);f.input.value='웨이브라이더어택';input.value='10';
 assert.equal(await f.ui.flush(),true);assert.equal(f.calls(),1);
 assert.equal(f.entries()[0].name,'웨이브라이더어택');assert.deepEqual(f.entries()[0].edits,[{recordOffset:48,field:'holdDuration',value:10}]);
});
test('an invalid pending motion prevents a rename-only save and preserves both drafts',async()=>{
 const f=renameAndMotionFixture(),input=await openMotion(f),before=structuredClone(f.entries());f.input.value='웨이브라이더어택';input.value='';
 assert.equal(await f.ui.flush(),false);assert.equal(f.calls(),0);assert.deepEqual(f.entries(),before);
 assert.equal(input.getAttribute('aria-invalid'),'true');assert.equal(f.input.value,'웨이브라이더어택');
 input.value='10';assert.equal(await f.ui.flush(),true);assert.equal(f.calls(),1);assert.equal(f.entries()[0].edits[0].value,10);
});
test('a different animation source never receives operands from the previously displayed source',async()=>{
 const f=renameAndMotionFixture(),input=await openMotion(f);f.input.value='웨이브라이더어택';f.select.value='245';input.value='10';
 assert.equal(await f.ui.flush(),true);assert.equal(f.calls(),1);assert.equal(f.entries()[0].animationWeapon,245);assert.deepEqual(f.entries()[0].edits,[]);
});

test('the configuration apply button also preserves pending same-source operands',async()=>{
 const f=renameAndMotionFixture(),input=await openMotion(f);f.input.value='웨이브라이더어택';input.value='10';f.button.click();
 for(let i=0;i<30;i++)await Promise.resolve();assert.equal(f.calls(),1);assert.equal(f.entries()[0].name,'웨이브라이더어택');assert.equal(f.entries()[0].edits[0].value,10);
});

test('cloning a renamed weapon retains its pending operand in both source and new weapon',async()=>{
 const f=fixture({sourceWeapon:1,freeWeaponIndices:[1332],instructions:[{recordOffset:48,fields:[{name:'holdDuration',editable:true,min:1,max:256,value:5,originalValue:5}]}],effectCatalog:[]}),input=await openMotion(f);f.input.value='웨이브라이더어택';input.value='10';
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='무기 추가').click();for(let i=0;i<60;i++)await Promise.resolve();
 assert.equal(f.entries().length,2);for(const entry of f.entries()){assert.equal(entry.name,'웨이브라이더어택');assert.equal(entry.edits[0].value,10);}
});

test('deleting a new weapon discards its pending name so a later save cannot resurrect its draft',async()=>{
 const f=fixture({sourceWeapon:1,freeWeaponIndices:[],instructions:[],effectCatalog:[]},{followSelection:true});
 f.input.value='웨이브라이더어택';[...f.container.querySelectorAll('button')].find(b=>b.textContent==='신규 무기 삭제').click();
 for(let i=0;i<40;i++)await Promise.resolve();assert.deepEqual(f.entries(),[]);const calls=f.calls();
 assert.equal(await f.ui.flush(),true);assert.deepEqual(f.entries(),[]);assert.equal(f.calls(),calls);
});

test('movement navigation retains pending values and flushes all edited movements atomically',async()=>{
 const field={name:'holdDuration',editable:true,min:1,max:256,value:5,originalValue:5};
 const f=fixture({sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[field]},{recordOffset:72,fields:[{...field}]}],effectCatalog:[]});
 let input=await openMotion(f);input.value='10';
 const picker=[...f.container.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')==='편집할 원본 움직임');
 picker.value='72';picker.dispatchEvent({type:'change'});f.container.querySelector('[data-weapon-motion-field="holdDuration"]').value='12';
 picker.value='48';picker.dispatchEvent({type:'change'});assert.equal(f.container.querySelector('[data-weapon-motion-field="holdDuration"]').value,'10');
 assert.equal(await f.ui.flush(),true);assert.equal(f.calls(),1);
 assert.deepEqual(f.entries()[0].edits,[{recordOffset:48,field:'holdDuration',value:10},{recordOffset:72,field:'holdDuration',value:12}]);
});

test('an invalid hidden movement prevents a partial save of another movement',async()=>{
 const field={name:'holdDuration',editable:true,min:1,max:256,value:5,originalValue:5};
 const f=fixture({sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[field]},{recordOffset:72,fields:[{...field}]}],effectCatalog:[]});
 const input=await openMotion(f);input.value='';
 const picker=[...f.container.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')==='편집할 원본 움직임');picker.value='72';picker.dispatchEvent({type:'change'});
 f.container.querySelector('[data-weapon-motion-field="holdDuration"]').value='12';
 assert.equal(await f.ui.flush(),false);assert.equal(f.calls(),0);assert.deepEqual(f.entries()[0].edits,[]);
 picker.value='48';picker.dispatchEvent({type:'change'});assert.equal(f.container.querySelector('[data-weapon-motion-field="holdDuration"]').value,'');
});

test('closing and reopening the editor retains unapplied movement values without committing',async()=>{
 const f=renameAndMotionFixture(),input=await openMotion(f);input.value='11';
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='연출 편집 닫기').click();
 assert.equal(f.calls(),0);assert.equal(f.ui.show(),true);for(let i=0;i<15;i++)await Promise.resolve();
 assert.equal(f.container.querySelector('[data-weapon-motion-field="holdDuration"]').value,'11');
 assert.equal(await f.ui.flush(),true);assert.equal(f.entries()[0].edits[0].value,11);
});

test('export flush includes pending operands while the movement panel is closed',async()=>{
 const f=renameAndMotionFixture(),input=await openMotion(f);input.value='11';
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='연출 편집 닫기').click();
 assert.equal(await f.ui.flush(),true);assert.equal(f.calls(),1);assert.equal(f.entries()[0].edits[0].value,11);
});

test('whole reset discards pending movements of an original weapon with no committed recipe',async()=>{
 const f=renameAndMotionFixture();f.ui.select({recordIndex:1,name:'빔사벨',editable:true,owners:[{unit:1}]});
 const input=await openMotion(f);input.value='11';input.dispatchEvent({type:'change'});
 // The fake DOM does not bubble field events; navigation captures the pending value.
 const picker=[...f.container.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')==='편집할 원본 움직임');picker.dispatchEvent({type:'change'});
 const reset=[...f.container.querySelectorAll('button')].find(b=>b.textContent==='원본 연출로');assert.equal(reset.disabled,false);reset.click();for(let i=0;i<10;i++)await Promise.resolve();
 assert.equal(f.container.querySelector('[data-weapon-motion-field="holdDuration"]').value,'5');assert.equal(await f.ui.flush(),true);assert.equal(f.calls(),0);
});

const originalSaber={recordIndex:1,name:'빔사벨',editable:true,owners:[{unit:1}]};
const newSaber={recordIndex:1331,name:'빔사벨',editable:true,owners:[{unit:1}],authoring:{isNew:true,sourceWeapon:1}};
const settleMotion=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
test('switching weapons restores movement drafts and export flushes both weapons in one commit',async()=>{
 const f=renameAndMotionFixture();(await openMotion(f)).value='11';f.ui.select(originalSaber);await settleMotion();
 f.container.querySelector('[data-weapon-motion-field="holdDuration"]').value='12';f.ui.select(newSaber);await settleMotion();
 assert.equal(f.container.querySelector('[data-weapon-motion-field="holdDuration"]').value,'11');assert.equal(f.calls(),0);
 assert.equal(await f.ui.flush(),true);assert.equal(f.calls(),1);
 assert.equal(f.entries().find(e=>e.weaponIndex===1331).edits[0].value,11);assert.equal(f.entries().find(e=>e.weaponIndex===1).edits[0].value,12);
});

test('invalid movement in another weapon prevents every pending configuration and motion write',async()=>{
 const f=renameAndMotionFixture();(await openMotion(f)).value='';f.input.value='웨이브라이더어택';f.ui.select(originalSaber);await settleMotion();
 f.container.querySelector('[data-weapon-motion-field="holdDuration"]').value='12';const before=structuredClone(f.entries());
 assert.equal(await f.ui.flush(),false);assert.equal(f.calls(),0);assert.deepEqual(f.entries(),before);
 assert.match(f.container.querySelector('[role="status"]').textContent,/1331/);assert.match(f.container.querySelector('[role="status"]').textContent,/동작 1/);assert.doesNotMatch(f.container.querySelector('[role="status"]').textContent,/동작 #48/);f.ui.select(newSaber);await settleMotion();
 assert.equal(f.container.querySelector('[data-weapon-motion-field="holdDuration"]').value,'');assert.equal(f.input.value,'웨이브라이더어택');
});

test('applying only one weapon does not discard unsaved motion in a different weapon',async()=>{
 const f=renameAndMotionFixture();(await openMotion(f)).value='11';f.ui.select(originalSaber);await settleMotion();
 f.container.querySelector('[data-weapon-motion-field="holdDuration"]').value='12';[...f.container.querySelectorAll('button')].find(b=>b.textContent==='적용').click();await settleMotion();
 assert.equal(f.entries().find(e=>e.weaponIndex===1331).edits.length,0);assert.equal(f.entries().find(e=>e.weaponIndex===1).edits[0].value,12);
 f.ui.select(newSaber);await settleMotion();assert.equal(f.container.querySelector('[data-weapon-motion-field="holdDuration"]').value,'11');
 assert.equal(await f.ui.flush(),true);assert.equal(f.entries().find(e=>e.weaponIndex===1331).edits[0].value,11);
});

test('changing another weapon animation source discards its invalid old-source draft while retaining other edits',async()=>{
 const f=renameAndMotionFixture();(await openMotion(f)).value='';f.select.value='245';f.ui.select(originalSaber);await settleMotion();
 f.container.querySelector('[data-weapon-motion-field="holdDuration"]').value='12';assert.equal(await f.ui.flush(),true);
 assert.deepEqual(f.entries().find(e=>e.weaponIndex===1331).edits,[]);assert.equal(f.entries().find(e=>e.weaponIndex===1331).animationWeapon,245);
 assert.equal(f.entries().find(e=>e.weaponIndex===1).edits[0].value,12);
});

test('a second export flush after a closed-panel save does not resubmit old DOM inputs',async()=>{
 const f=renameAndMotionFixture();(await openMotion(f)).value='11';[...f.container.querySelectorAll('button')].find(b=>b.textContent==='연출 편집 닫기').click();
 assert.equal(await f.ui.flush(),true);const calls=f.calls();assert.equal(await f.ui.flush(),true);assert.equal(f.calls(),calls);
});

test('deleting a new weapon also discards its pending movement rather than resurrecting it during selection',async()=>{
 const field={name:'holdDuration',editable:true,min:1,max:256,value:5,originalValue:5};
 const f=fixture({sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[field]}],effectCatalog:[]},{followSelection:true});
 (await openMotion(f)).value='11';[...f.container.querySelectorAll('button')].find(b=>b.textContent==='신규 무기 삭제').click();await settleMotion();
 assert.deepEqual(f.entries(),[]);const calls=f.calls();assert.equal(await f.ui.flush(),true);assert.equal(f.calls(),calls);assert.deepEqual(f.entries(),[]);
});


test('a first unapplied motion is pending and notifies the footer without applying a recipe',async()=>{
 let notifications=0;const field={name:'holdDuration',editable:true,min:1,max:256,value:5,originalValue:5};
 const f=fixture({sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[field]}],effectCatalog:[]},{onDraftChange:()=>notifications++});
 f.ui.select(originalSaber);const input=await openMotion(f);assert.equal(f.ui.hasPending(),false);
 input.value='11';f.container.querySelector('.weapon-authoring-fields').dispatchEvent({type:'input'});
 assert.equal(notifications,1);assert.equal(f.ui.hasPending(),true);assert.equal(f.calls(),0);
 input.value='5';f.container.querySelector('.weapon-authoring-fields').dispatchEvent({type:'input'});assert.equal(f.ui.hasPending(),false);
});

test('invalid pending values remain visible to save gating but cannot be committed',async()=>{
 const f=renameAndMotionFixture();(await openMotion(f)).value='';assert.equal(f.ui.hasPending(),true);
 assert.equal(await f.ui.flush(),false);assert.equal(f.calls(),0);
});


test('a footer pending-state read during whole reset cannot capture stale inputs and resurrect them',async()=>{
 let f;const inspection=()=>({sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[{name:'holdDuration',editable:true,min:1,max:256,value:f.entries().find(e=>e.weaponIndex===1)?.edits[0]?.value??5,originalValue:5}]}],effectCatalog:[]});
 f=fixture(inspection,{duringApply:()=>assert.equal(f.ui.hasPending(),false)});
 f.entries().push({weaponIndex:1,sourceWeapon:1,unitIndex:1,edits:[{recordOffset:48,field:'holdDuration',value:8}]});f.ui.select(originalSaber);
 const input=await openMotion(f);assert.equal(input.value,'8');input.value='12';assert.equal(f.ui.hasPending(),true);
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='원본 연출로').click();await settleMotion();
 assert.equal(f.container.querySelector('[data-weapon-motion-field="holdDuration"]').value,'5');assert.equal(f.ui.hasPending(),false);assert.equal(f.entries().some(e=>e.weaponIndex===1),false);
});

test('discovered unlinked source programs enter effect search while template-only records remain excluded',async()=>{
 const f=fixture({sourceWeapon:1,freeWeaponIndices:[],instructions:[{recordOffset:48,fields:[{name:'spawnSequence',editable:true,choices:[1],min:0,max:1,value:1,originalValue:1}]}]},{unlinkedCatalog:true});
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='연출 편집').click();
 for(let i=0;i<10;i++)await Promise.resolve();
 const donor=[...f.container.querySelectorAll('select')].find(e=>e.getAttribute('aria-label')==='효과 원본 무기');
 assert.ok(![...donor.options].some(o=>o.value==='4'));
 [...f.container.querySelectorAll('button')].find(b=>b.textContent==='연결 없는 연출 찾기').click();
 for(let i=0;i<10;i++)await Promise.resolve();
 assert.equal([...donor.options].find(o=>o.value==='4').textContent,'[미연결] 미연결 효과 · #4');
 assert.ok(![...donor.options].some(o=>o.value==='5'));assert.equal(f.calls(),0);
 const search=[...f.container.querySelectorAll('input')].find(e=>e.getAttribute('aria-label')==='효과 원본 기체·무기 검색');search.value='미연결';search.dispatchEvent({type:'input'});
 assert.deepEqual([...donor.options].map(o=>o.value),['','4']);
});

test('changing a copied native motion preserves its original name alias without trying to encode it in the Korean font',async()=>{
 const f=fixture(null,{sourceName:'格闘'});f.select.value='245';
 assert.equal(await f.ui.flush(),true);assert.equal(f.calls(),1);assert.equal(f.entries()[0].animationWeapon,245);
 assert.equal(f.entries()[0].name,undefined);assert.equal(f.input.value,'格闘');
 assert.equal(f.container.querySelector('[role="status"]').textContent,'공격 연출을 적용했습니다.');
});

test('native F renaming validates with the authenticated base font instead of Korean glyph codes',async()=>{
 const f=fixture(null,{gameId:'srwf-f',baseHash:'c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8',sourceName:'ビームサーベル'});
 f.input.value='格闘';assert.equal(await f.ui.flush(),true);assert.equal(f.entries()[0].weaponIndex,1248);assert.equal(f.entries()[0].name,'格闘');
 f.input.value='격투';assert.equal(await f.ui.flush(),false);assert.equal(f.calls(),1);
});
