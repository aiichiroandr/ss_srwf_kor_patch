import assert from 'node:assert/strict';
import test from 'node:test';
import { readRewardTable, updateRewardRecords, rewardDecodedMasks, rewardOutcomeLabel, rewardReferences } from '../assets/editor-rewards.mjs';
import { buildPreset, parsePreset, serializePreset, applyPreset, planPresetApplication } from '../assets/editor-preset.mjs';
import { exportEditedImage, editorDecodedMasks, splitRootSegments } from '../assets/editor-core.mjs';
import { makeBase, descriptorFor } from './helpers/synthetic-game.mjs';
import { recordTable } from './helpers/synthetic-tsr.mjs';
import { referenceMode1Problems, differingSectors, sectorOf, echoRequest } from './helpers/synthetic-iso.mjs';

// Two editable physical records, one immutable empty record, with repeated selectors.
const fixture = () => ({start:700,bytes:recordTable([0,1,...Array(46).fill(2)], [Uint8Array.of(255,255),Uint8Array.of(3,40,255,255),Uint8Array.of(4,60,5,20,255,255)])});
const code = error => error.code === 'EDITOR_REWARD_INVALID';
const editable = segment => readRewardTable(segment).filter(r => r.editable).map(row => ({...row,original:{...row}}));

test('reward pointers preserve shared selectors, the empty row and exact pair capacity', () => {
 const segment=fixture(), rows=readRewardTable(segment);
 assert.equal(rows.length,3); assert.equal(rows[0].editable,false);
 assert.equal(rows[1].capacity,1); assert.deepEqual(rows[2].aliases,Array.from({length:46},(_,i)=>i+2));
 assert.deepEqual(rewardDecodedMasks(segment),[[894,2,255],[898,4,255]]);
 const before=segment.bytes.slice(); updateRewardRecords(segment,[{recordIndex:1,fields:{part1:22,chance1:0}},{recordIndex:2,fields:{part1:6,chance1:50,chance2:50}}]);
 const after=readRewardTable(segment); assert.equal(after[1].chance1,0); assert.equal(after[2].chance2,50);
 const changed=Array.from(segment.bytes.keys()).filter(i=>before[i]!==segment.bytes[i]); assert.ok(changed.every(i=>[194,195,198,199,201].includes(i)));
 assert.equal(after[2].identity,rows[2].identity);
 assert.equal(rows[0].name,'보상 없음');assert.equal(rows[1].name,'강화파츠 격추 보상');
});

test('reward descriptions name the mutually exclusive part outcomes and retain zero-percent candidates', () => {
 const name=id=>({3:'초밤　아머',4:'리페어　키트 S'}[id]);
 assert.equal(rewardOutcomeLabel({capacity:0},name),'보상 없음');
 assert.equal(rewardOutcomeLabel({capacity:1,part1:3,chance1:100},name),'초밤 아머 100%');
 assert.equal(rewardOutcomeLabel({capacity:2,part1:3,chance1:60,part2:4,chance2:0},name),'초밤 아머 60% / 리페어 키트 S 0%');
 assert.equal(rewardOutcomeLabel({capacity:2,part1:3,chance1:60,part2:4,chance2:0},name,{compact:true}),'초밤 아머 60% 외 1종');
 assert.equal(rewardOutcomeLabel({capacity:2,part1:3,chance1:90,part2:3,chance2:10},name,{compact:true}),'초밤 아머 100%');
 assert.equal(rewardOutcomeLabel({capacity:2,part1:3,chance1:90,part2:4,chance2:10},()=> '같은 표시 이름',{compact:true}),'같은 표시 이름 90% 외 1종');
 assert.equal(rewardOutcomeLabel({capacity:1,part1:22,chance1:25},name),'명칭 미확인 강화파츠 25%');
});

test('shared reward usage follows current scenario appearances and enabled reinforcement templates without changing them', () => {
 const row={aliases:[16,17],capacity:2};
 const deployments=[{recordIndex:'0:64',physicalIndex:0,name:'가베라　테트라',unitId:107,rewardSelector:16,original:{rewardSelector:1},x:2,y:3,editable:true},
  {recordIndex:'0:76',physicalIndex:0,name:'도벤울프',unitId:119,rewardSelector:17,x:4,y:5,editable:false},
  {recordIndex:'1:64',physicalIndex:1,name:'다른 기체',rewardSelector:1}];
 const reinforcements=[{recordIndex:'0:200',physicalIndex:0,enabled:1,rewardSelector:17,templateOffset:64,turn:5,x:1,y:2,templates:[{byteOffset:64,name:'게마르크',unitId:120}]},
  {recordIndex:'0:210',enabled:0,rewardSelector:17,templateOffset:64,templates:[{byteOffset:64,name:'비활성 증원'}]},
  {recordIndex:'0:220',enabled:1,rewardSelector:17,templateOffset:65,templates:[{byteOffset:64,name:'미확인 연결'}]}];
 const model={deployments,reinforcements},before=structuredClone(model);
 const uses=rewardReferences(row,model);
 assert.deepEqual(uses.map(x=>[x.kind,x.recordIndex,x.name]),[['deployment','0:64','가베라 테트라'],['deployment','0:76','도벤울프'],['reinforcement','0:200','게마르크']]);
 assert.equal(uses[2].turn,5);assert.deepEqual(model,before);
 deployments[0].rewardSelector=1;
 assert.deepEqual(rewardReferences(row,{rows:kind=>kind==='deployment'?deployments:reinforcements}).map(x=>x.recordIndex),['0:76','0:200']);
 assert.deepEqual(rewardReferences(row),[]);
});

test('invalid reward edits refuse the entire request before changing bytes', () => {
 for(const bad of [{recordIndex:2,fields:{chance1:81}},{recordIndex:2,fields:{chance2:-1}},{recordIndex:2,fields:{chance2:1.5}},{recordIndex:2,fields:{part1:23}},{recordIndex:1,fields:{chance2:1}},{recordIndex:0,fields:{part1:2}},{recordIndex:3,fields:{part1:2}}]){
  const segment=fixture(),before=segment.bytes.slice(); assert.throws(()=>updateRewardRecords(segment,[{recordIndex:1,fields:{chance1:90}},bad]),code);assert.deepEqual(segment.bytes,before);
 }
 const segment=fixture();assert.throws(()=>updateRewardRecords(segment,[{recordIndex:1,fields:{}},{recordIndex:1,fields:{}}]),code);
 const fields={};Object.defineProperty(fields,'chance1',{get(){throw new Error('getter must not execute')}});assert.throws(()=>updateRewardRecords(segment,[{recordIndex:1,fields}]),code);
 assert.doesNotThrow(()=>updateRewardRecords(undefined,[]));
});

test('malformed reward pointers, totals and terminators fail closed', () => {
 for(const mutate of [s=>new DataView(s.bytes.buffer).setInt32(4,1),s=>s.bytes[194]=255,s=>s.bytes[195]=101,s=>s.bytes[197]=0,s=>s.bytes[200]=0]){
  const s=fixture();mutate(s);assert.throws(()=>readRewardTable(s),code);
 }
});

test('reward presets round-trip and reject unsafe partial probability combinations', () => {
 const rows=editable(fixture());rows[1].chance1=70;rows[1].chance2=10;
 const preset=parsePreset(serializePreset(buildPreset({gameId:'srwf-f'},{reward:rows})));
 const target=editable(fixture());assert.equal(applyPreset(preset,{gameId:'srwf-f',rewards:target},'all').applied,2);assert.equal(target[1].chance1,70);
 const changed=editable(fixture());changed[1].chance2=40;
 const plan=planPresetApplication(preset,{gameId:'srwf-f',rewards:changed});assert.ok(plan.items.every(i=>i.reason==='reward-total'));
 const normal=buildPreset({gameId:'srwf-f'},{});assert.equal(Object.hasOwn(normal,'rewards'),false);
 assert.throws(()=>parsePreset(JSON.stringify({...normal,rewards:null})), e=>e.code==='PRESET_BAD_VALUE');
});

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: two reward rows survive real export checksums, independent provenance reopening and preset replay`, async()=>{
 const base=await makeBase({gameId,units:12,rewardTable:fixture().bytes});
 const request={...echoRequest(base.opened.session,base.opened.view),rewardEdits:[{recordIndex:1,fields:{part1:22,chance1:35}},{recordIndex:2,fields:{part2:7,chance1:45,chance2:25}}]};
 const result=await exportEditedImage(base.opened.session,request);const output=new Uint8Array(await result.outputBlob.arrayBuffer());
 assert.ok(differingSectors(base.disc.image,output).length>0);for (const lba of differingSectors(base.disc.image,output)) assert.deepEqual(referenceMode1Problems(sectorOf(output,lba)),[]);
 const reopened=await base.full.inspectPatchedImage(result.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
 assert.equal(reopened.view.provenanceMode,'bounded-editor-profile');const records=reopened.view.rewards;
 assert.equal(records[1].part1,22);assert.equal(records[1].chance1,35);assert.equal(records[2].part2,7);
 assert.deepEqual(editorDecodedMasks(splitRootSegments(reopened.session.decoded),gameId),base.profile.decodedMasks);
 const rows=editable(fixture());Object.assign(rows[0],request.rewardEdits[0].fields);Object.assign(rows[1],request.rewardEdits[1].fields);
 const file=parsePreset(serializePreset(buildPreset({gameId},{reward:rows})));const replay=editable(fixture());applyPreset(file,{gameId,rewards:replay},'all');
 const second=await exportEditedImage(base.opened.session,{...echoRequest(base.opened.session,base.opened.view),rewardEdits:replay.map(row=>({recordIndex:row.recordIndex,fields:Object.fromEntries(['part1','chance1','part2','chance2'].filter(f=>Object.hasOwn(row,f)).map(f=>[f,row[f]]))}))});
 assert.equal(second.sha256,result.sha256);
});
