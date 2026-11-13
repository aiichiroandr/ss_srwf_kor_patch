import assert from 'node:assert/strict';
import test from 'node:test';
import {checkSaveBytes,repairSaveBytes} from '../assets/save-check.mjs';
const put16=(b,p,v)=>{b[p]=v>>>8;b[p+1]=v&255;};
const unit=(b,slot,id,link=255,pilot=255)=>{const p=0x100+slot*30;b.fill(0,p,p+30);put16(b,p,id);b[p+2]=64;b[p+15]=pilot;b[p+16]=link;};
const pilot=(b,slot,id)=>{const p=0x1000+slot*12;put16(b,p,id);b[p+2]=20;};
const kind6=[{recordIndex:100,saveUnitKind:6,saveUnitForm:0},...Array.from({length:12},(_,i)=>({recordIndex:101+i,saveUnitKind:5,saveUnitForm:i%3}))];
const kind8=[{recordIndex:200,saveUnitKind:8,saveUnitForm:0},...Array.from({length:5},(_,i)=>({recordIndex:201+i,saveUnitKind:7,saveUnitForm:i}))];
const rows=[{recordIndex:10,saveUnitKind:4,saveUnitForm:0},{recordIndex:11,saveUnitKind:4,saveUnitForm:1},{recordIndex:12,saveUnitKind:4,saveUnitForm:2},{recordIndex:20,saveUnitKind:9,saveUnitForm:2},{recordIndex:21,saveUnitKind:9,saveUnitForm:0},{recordIndex:22,saveUnitKind:9,saveUnitForm:1},...kind6,...kind8,{recordIndex:40,saveUnitKind:0,saveUnitForm:0}];
const catalog={gameId:'srwf-final',units:rows,pilots:[{recordIndex:74}]},record={gameId:'srwf-final',upgradeLimit:5};
const errors=b=>checkSaveBytes(b,record,catalog).filter(issue=>issue.level==='error');

test('kind6 accepts separated selected alternate components without fresh-add repairs',()=>{
 const b=new Uint8Array(0x1600);pilot(b,0,74);unit(b,20,100,3,0); // root -> selected first triple form 2 (#103)
 for(const [slot,id]of [[3,103],[8,104],[9,107],[17,110]])unit(b,slot,id); // all components remain FF
 const before=b.slice(),issues=checkSaveBytes(b,record,catalog);
 assert.deepEqual(errors(b),[]);
 assert.equal(issues.filter(issue=>issue.slot===20||[3,8,9,17].includes(issue.slot)).length,0);
 assert.equal(repairSaveBytes(b,record,catalog),0);assert.deepEqual(b,before);
});

test('kind6 combined copies use component roles, preserve alternate forms, and stay slot-local',()=>{
 const b=new Uint8Array(0x1600);
 // Two physical copies have the same definitions but must not be paired merely by ID.
 for(const [root,components]of [[20,[[3,103],[8,106],[9,109],[17,112]]],[30,[[31,101],[32,104],[33,107],[34,110]]]]){
  unit(b,root,100);for(const [slot,id]of components)unit(b,slot,id,root);
 }
 assert.deepEqual(errors(b),[]);assert.equal(repairSaveBytes(b,record,catalog),0);
 // #101 and #103 are alternate forms of role zero, so sharing root slot 20 is a
 // real duplicate even though their definition IDs differ.
 unit(b,35,101,20);const duplicate=errors(b).find(issue=>issue.slot===35&&/구성 역할/.test(issue.message));assert.ok(duplicate);
 assert.equal(repairSaveBytes(b,record,catalog)>0,true);assert.equal(b[0x100+35*30+16],255);
});

test('same-family unknown links warn without repair; unrelated links and cycles remain errors',()=>{
 const unknown=new Uint8Array(0x1600);unit(unknown,20,100,3);unit(unknown,3,104); // root -> second component role has no confirmed state contract
 const before=unknown.slice(),issues=checkSaveBytes(unknown,record,catalog);
 assert.ok(issues.some(issue=>issue.level==='warn'&&issue.slot===20&&/같은 기체 계열/.test(issue.message)));assert.deepEqual(errors(unknown),[]);
 assert.equal(repairSaveBytes(unknown,record,catalog),0);assert.deepEqual(unknown,before);
 const broken=new Uint8Array(0x1600);unit(broken,3,101,4);unit(broken,4,40);
 assert.ok(errors(broken).some(issue=>issue.slot===3&&/같은 기체 계열/.test(issue.message)));assert.ok(repairSaveBytes(broken,record,catalog)>0);assert.equal(broken[0x100+3*30+16],255);
 const cycle=new Uint8Array(0x1600);unit(cycle,20,100,3);unit(cycle,3,101,20);
 assert.ok(errors(cycle).some(issue=>/순환/.test(issue.message)));assert.ok(repairSaveBytes(cycle,record,catalog)>0);assert.deepEqual(errors(cycle),[]);
});

test('kind8 unverified separated-looking state warns non-destructively; kind4 active form and kind9 proxy remain safe',()=>{
 const kind8Unknown=new Uint8Array(0x1600);unit(kind8Unknown,20,200,3);for(const [slot,id]of [[3,201],[4,202],[5,203],[6,204],[7,205]])unit(kind8Unknown,slot,id);
 const before=kind8Unknown.slice(),issues=checkSaveBytes(kind8Unknown,record,catalog);
 assert.deepEqual(errors(kind8Unknown),[]);assert.ok(issues.some(issue=>issue.level==='warn'&&/분리 저장 상태/.test(issue.message)));assert.equal(repairSaveBytes(kind8Unknown,record,catalog),0);assert.deepEqual(kind8Unknown,before);
 const dynamic=new Uint8Array(0x1600);unit(dynamic,0,10);unit(dynamic,1,11,0);unit(dynamic,2,12,1); // active kind4 parent is not permanently form 0
 assert.deepEqual(errors(dynamic),[]);
 const kind9=new Uint8Array(0x1600);unit(kind9,0,20,1);unit(kind9,1,21);unit(kind9,2,22);
 assert.deepEqual(errors(kind9),[]);assert.equal(checkSaveBytes(kind9,record,catalog).filter(issue=>issue.level==='warn').length,0);
});