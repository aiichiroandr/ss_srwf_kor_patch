import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom} from './helpers/fake-dom.mjs';
import {createAliceCrewEditor} from '../assets/editor-alice-crew-ui.mjs';
import {aliceEditorRow,aliceCrewRequest} from '../assets/editor-alice-crew-data.mjs';

const document=installFakeDom();
function setup(){
 const root=document.createElement('section'),crew=document.createElement('input'),note=document.createElement('p'),label=document.createElement('label'),sp=document.createElement('input'),grid=document.createElement('div');
 crew.type='checkbox';crew.dataset.aliceField='crewEnabled';note.dataset.aliceNote='';sp.type='number';sp.dataset.aliceField='spBase';label.append(sp);grid.dataset.aliceSpirits='';root.append(crew,note,label,grid);document.body.append(root);
 const row=aliceEditorRow({enabled:true}),changes=[],invalid=[],reveals=[];
 const editor=createAliceCrewEditor({root,getRow:()=>row,getChoices:()=>Array.from({length:30},(_,i)=>({id:i+1,name:`정신${i+1}`})),canConnect:()=>true,isBusy:()=>false,onChange:(_row,field)=>changes.push(field),onInvalid:()=>invalid.push(true),onReveal:()=>reveals.push(true)});
 editor.render({aliceIdentity:true});
 return {root,row,editor,changes,invalid,reveals,sp};
}
const input=(el,value)=>{el.value=value;el.dispatchEvent({type:'input'});};

test('invalid ALICE SP and level drafts survive rerender without contaminating export; correction commits',()=>{
 const {root,row,editor,sp,changes,invalid,reveals}=setup(),level=root.querySelector('[data-alice-field="spiritLevel1"]');
 for(const value of ['', '1000', '1.5']){input(sp,value);assert.equal(row.spBase,25);assert.equal(editor.validate(),false);assert.equal(sp.getAttribute('aria-invalid'),'true');}
 input(level,'0');assert.equal(row.spiritLevel1,1);assert.equal(aliceCrewRequest(row).spBase,25);
 editor.render({aliceIdentity:false});editor.render({aliceIdentity:true});assert.equal(sp.value,'1.5');assert.equal(level.value,'0');
 assert.equal(editor.validate({report:true}),false);assert.equal(reveals.length,1);
 input(sp,'37');assert.equal(editor.validate(),false);input(level,'99');assert.equal(editor.validate(),true);
 assert.equal(row.spBase,37);assert.equal(row.spiritLevel1,99);assert.deepEqual(changes,['spBase','spiritLevel1']);assert.equal(invalid.length,4);
 assert.equal(sp.getAttribute('aria-invalid'),null);assert.equal(level.getAttribute('aria-invalid'),null);
});

test('duplicate ALICE spirits are rejected and a new session discards only the unaccepted draft',()=>{
 const {root,row,editor}=setup(),choice=root.querySelector('[data-alice-field="spirit1"]');
 const old=row.spirit1;input(choice,String(row.spirit2));assert.equal(row.spirit1,old);assert.equal(editor.validate(),false);
 editor.reset();editor.render({aliceIdentity:true});assert.equal(editor.validate(),true);assert.equal(choice.value,String(old));
 input(choice,'1');assert.equal(row.spirit1,1);assert.equal(editor.validate(),true);
});
