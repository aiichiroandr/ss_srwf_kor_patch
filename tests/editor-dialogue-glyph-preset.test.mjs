import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPreset,serializePreset,parsePreset,planPresetApplication,applyPresetPlan,applyPreset,presetChangeCount} from '../assets/editor-preset.mjs';
import {editorTextMetrics} from '../assets/editor-text-codec.mjs';
const gameId='srwf-final',first='힣',second='뿕';
const identity=(kind,char)=>`${kind}:1:${char.repeat(64)}`;
function fixture(capacity={value:2}){
 const calls={single:[],batch:[]};
 const dialogues=[{recordIndex:'3:64',physicalIndex:3,text:'아무로',original:{text:'아무로'},maxBytes:12,editable:true,identity:identity('dialogue','a')},{recordIndex:'3:128',physicalIndex:3,text:'브라이트',original:{text:'브라이트'},maxBytes:12,editable:true,identity:identity('dialogue','b')}];
 const glyphs=[{recordIndex:1,characters:'',original:{characters:''},editable:true,identity:identity('glyph','c')}];
 const session={gameId,units:[],pilots:[],weapons:[],dialogues,glyphs,
  validateText(kind,row,text){calls.single.push({kind,row,text});const metrics=editorTextMetrics(text,{gameId});return {valid:kind==='glyph'?new Set(text).size<=capacity.value:metrics.byteLength<=row.maxBytes&&!/[\n\r]/u.test(text)};},
  validateTextBatch(texts){calls.batch.push(texts);const missing=new Set(texts.flatMap(item=>editorTextMetrics(item.text,{gameId}).missing));return {valid:missing.size<=capacity.value};},
 };
 return {session,calls,capacity};
}
function edited(){const {session}=fixture();session.dialogues[0].text=first;session.dialogues[1].text=second;session.glyphs[0].characters=first;return session;}
const save=session=>buildPreset({gameId,createdAt:new Date('2026-10-23T00:00:00Z')},{dialogue:session.dialogues,glyph:session.glyphs});
const read=preset=>parsePreset(serializePreset(preset),{gameId});

test('dialogue text and the single glyph register survive build, JSON, planning and application',()=>{
 assert.deepEqual(editorTextMetrics(first+second,{gameId}).missing,[first,second]);
 const preset=save(edited());assert.equal(presetChangeCount(preset),3);
 assert.deepEqual(preset.dialogues.map(row=>[row.recordIndex,row.identity,row.fields.text]),[['3:64',identity('dialogue','a'),{from:'아무로',to:first}],['3:128',identity('dialogue','b'),{from:'브라이트',to:second}]]);
 assert.deepEqual(preset.glyphs,[{recordIndex:1,name:'',identity:identity('glyph','c'),fields:{characters:{from:'',to:first}}}]);
 const parsed=read(preset),{session,calls}=fixture(),before=structuredClone(session.dialogues),plan=planPresetApplication(parsed,session);
 assert.deepEqual(plan.counts,{apply:3,conflict:0,same:0,skip:0});assert.deepEqual(session.dialogues,before,'planning must not commit text or allocate glyphs');
 assert.ok(calls.single.some(call=>call.kind==='dialogue'&&call.row===session.dialogues[0]&&call.text===first));assert.ok(calls.single.some(call=>call.kind==='glyph'&&call.row===session.glyphs[0]&&call.text===first));
 assert.ok(calls.batch.some(items=>items.some(item=>item.kind==='dialogue'&&item.text===second)&&items.some(item=>item.kind==='glyph'&&item.text===first)));
 const result=applyPresetPlan(plan,session,'matching');assert.equal(result.applied,3);assert.deepEqual(session.dialogues.map(row=>row.text),[first,second]);assert.equal(session.glyphs[0].characters,first);
 assert.deepEqual(result.records,[{kind:'dialogue',recordIndex:'3:64'},{kind:'dialogue',recordIndex:'3:128'},{kind:'glyph',recordIndex:1}]);
 assert.deepEqual(planPresetApplication(parsed,session).counts,{apply:0,conflict:0,same:3,skip:0});
});
test('glyph identity and numeric index 1 are mandatory; dialogue indices remain physical byte locations',()=>{
 const base=save(edited());
 for(const value of ['1',0,2,65535,null]){const bad=structuredClone(base);bad.glyphs[0].recordIndex=value;assert.throws(()=>read(bad),{code:'PRESET_BAD_RECORD'});}
 for(const value of [1,'03:64','3:55','200:64','3:262144']){const bad=structuredClone(base);bad.dialogues[0].recordIndex=value;assert.throws(()=>read(bad),{code:'PRESET_BAD_RECORD'});}
 for(const table of ['dialogues','glyphs']){
  const absent=structuredClone(base);delete absent[table][0].identity;assert.throws(()=>read(absent),{code:'PRESET_MISSING_KEY'});
  const wrong=structuredClone(base);wrong[table][0].identity=identity('weapon','a');assert.throws(()=>read(wrong),{code:'PRESET_BAD_VALUE'});
 }
 for(const value of ['힣힣','😀','A']){const bad=structuredClone(base);bad.glyphs[0].fields.characters.to=value;assert.throws(()=>read(bad),{code:'PRESET_BAD_VALUE'});}
 for(const value of ['첫줄\n둘째줄','제어\u0000문자','가'.repeat(4097)]){const bad=structuredClone(base);bad.dialogues[0].fields.text.to=value;assert.throws(()=>read(bad),{code:'PRESET_BAD_VALUE'});}
});
test('dialogues never remap to another physical location; missing identities and absent text validators fail closed',()=>{
 const parsed=read(save(edited())),moved=fixture().session;
 moved.dialogues[0].recordIndex='4:64';moved.dialogues[0].physicalIndex=4;
 const plan=planPresetApplication(parsed,moved),item=plan.items.find(item=>item.kind==='dialogue'&&item.recordIndex==='3:64');assert.equal(item.status,'skip');assert.equal(item.reason,'identity-missing');assert.equal(item.movedFrom,undefined);
 const noHost=fixture().session;delete noHost.validateText;delete noHost.validateTextBatch;
 const rejected=applyPreset(parsed,noHost,'all');assert.equal(rejected.applied,0);assert.equal(rejected.plan.items.every(item=>item.reason==='text-domain'),true);assert.deepEqual(noHost.dialogues.map(row=>row.text),['아무로','브라이트']);assert.equal(noHost.glyphs[0].characters,'');
 const otherFont=fixture().session;otherFont.glyphs[0].identity=identity('glyph','d');assert.equal(planPresetApplication(parsed,otherFont).items.find(item=>item.kind==='glyph').reason,'identity-missing');
});
test('individual dialogue byte limits and host exceptions prevent unsupported text from reaching rows',()=>{
 const editedSession=fixture().session;editedSession.dialogues[0].text=first.repeat(7);const parsed=read(save(editedSession)),{session}=fixture();
 const result=applyPreset(parsed,session,'all');assert.equal(result.applied,0);assert.equal(result.plan.items[0].reason,'text-domain');assert.equal(session.dialogues[0].text,'아무로');
 session.validateText=()=>{throw Error('protected control boundary');};assert.equal(applyPreset(parsed,session,'all').applied,0);
 session.dialogues[0].editable=false;assert.equal(planPresetApplication(parsed,session).items[0].reason,'read-only');
});
test('a shared glyph budget rejects simultaneous dialogue and glyph changes atomically',()=>{
 const parsed=read(save(edited())),{session,calls}=fixture({value:1}),before=structuredClone({dialogues:session.dialogues,glyphs:session.glyphs});
 const result=applyPreset(parsed,session,'all');assert.equal(result.applied,0);assert.deepEqual(result.plan.counts,{apply:0,conflict:0,same:0,skip:3});assert.equal(result.plan.items.every(item=>item.reason==='text-domain'),true);
 assert.equal(calls.single.length,3,'each requested text fits by itself');assert.ok(calls.batch.length>0);assert.deepEqual({dialogues:session.dialogues,glyphs:session.glyphs},before);
});
test('application rechecks the shared budget if capacity changes after a plan was previewed',()=>{
 const parsed=read(save(edited())),{session,capacity}=fixture(),plan=planPresetApplication(parsed,session);assert.equal(plan.counts.apply,3);
 capacity.value=1;const result=applyPresetPlan(plan,session,'matching');assert.equal(result.applied,0);assert.deepEqual(session.dialogues.map(row=>row.text),['아무로','브라이트']);assert.equal(session.glyphs[0].characters,'');
});


test('page JSON reaches typed validation and shared glyph budgeting, then clears back to ordinary text',()=>{
 const {session,calls}=fixture(),row=session.dialogues[0];row.pagesJson='';row.original={...row.original,pagesJson:''};row.pagesEditable=true;
 const originalSingle=session.validateText;
 session.validateText=(kind,row,value,field)=>{if(field==='pagesJson'){calls.single.push({kind,row,text:value,field});return {valid:row.pagesEditable&&(value===''||JSON.parse(value).every(text=>text.length<30))};}return originalSingle(kind,row,value);};
 session.validateTextBatch=texts=>{calls.batch.push(texts);const missing=new Set(texts.flatMap(item=>editorTextMetrics(item.field==='pagesJson'&&item.text?JSON.parse(item.text).join(''):item.text,{gameId}).missing));return {valid:missing.size<=2};};
 const changed={...row,pagesJson:JSON.stringify(['아무로',first,second])},preset=read(buildPreset({gameId},{dialogue:[changed]}));
 const result=applyPreset(preset,session,'matching');assert.equal(result.applied,1);assert.deepEqual(JSON.parse(row.pagesJson),['아무로',first,second]);assert.equal(row.text,'아무로');
 assert.ok(calls.single.some(call=>call.field==='pagesJson'));assert.ok(calls.batch.some(items=>items.some(item=>item.field==='pagesJson'&&item.text.includes(second))));
 const clearing={...row,pagesJson:'',original:{text:row.text,pagesJson:row.pagesJson}},clear=read(buildPreset({gameId},{dialogue:[clearing]}));assert.equal(applyPreset(clear,session,'matching').applied,1);assert.equal(row.pagesJson,'');
 const blocked={...row,pagesEditable:false};assert.equal(planPresetApplication(preset,{...session,dialogues:[blocked]}).items[0].reason,'text-domain');
});
