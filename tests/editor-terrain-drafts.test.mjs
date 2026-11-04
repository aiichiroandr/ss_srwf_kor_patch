import assert from 'node:assert/strict';import test from 'node:test';import {readFile}from'node:fs/promises';
import {installFakeDom,loadHtml}from'./helpers/fake-dom.mjs';import{createTerrainEditor}from'../assets/editor-terrain-ui.mjs';
const doc=installFakeDom();loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
const rows=[4,5].map(recordIndex=>({recordIndex,name:`지형${recordIndex}`,editable:true,avoidanceBonus:25,defenseBonus:25,hpRecovery:0,enRecovery:10,original:{avoidanceBonus:25,defenseBonus:25,hpRecovery:0,enRecovery:10}}));
const editor=createTerrainEditor({rows:()=>rows,canEdit:()=>true,name:r=>r.name,onChange(){},open(){}}),$=id=>doc.getElementById(id),control=f=>$('terrainFields').querySelector(`[data-terrain-field="${f}"]`);
const type=(el,value)=>{el.value=String(value);el.dispatchEvent({type:'input',target:el});};
test('invalid terrain percentages survive selection changes and block export until corrected or reset',()=>{
 editor.refresh();type(control('enRecovery'),101);assert.equal(rows[0].enRecovery,10);
 $('terrainRecordList').querySelector('[data-record-id="5"]').click();assert.equal(editor.selectedRow().recordIndex,5);
 assert.equal(editor.validate(),false);assert.equal(editor.selectedRow().recordIndex,4);assert.equal(control('enRecovery').value,'101');
 type(control('enRecovery'),100);assert.equal(editor.validate(),true);assert.equal(rows[0].enRecovery,100);
 type(control('avoidanceBonus'),-100);assert.equal(rows[0].avoidanceBonus,-100);$('terrainReset').click();assert.equal(rows[0].avoidanceBonus,25);assert.equal(rows[0].enRecovery,10);
});
