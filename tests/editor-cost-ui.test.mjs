import assert from 'node:assert/strict';import test from 'node:test';import {readFile} from 'node:fs/promises';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {createCostEditor} from '../assets/editor-cost-ui.mjs';import {readUpgradeCosts} from '../assets/editor-costs.mjs';
const doc=installFakeDom();loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
const bytes=new Uint8Array(384),v=new DataView(bytes.buffer);[16,116,216,296].forEach((s,i)=>v.setInt32(i*4,s-i*4));
const rows=readUpgradeCosts({start:0,bytes},'srwf-final').map(row=>({...row,original:{cost:row.cost}}));let busy=true,changed=0;
const editor=createCostEditor({rows:()=>rows,canEdit:()=>!busy,onChange:()=>changed++}),entry=doc.querySelector('[data-upgrade-cost-open="weapon"]');
const input=id=>doc.body.querySelector(`[data-upgrade-record="${id}"]`);
const type=(el,value)=>{el.value=String(value);el.dispatchEvent({type:'input',target:el});};
test('cost controls enable after inspection, retain invalid drafts across pages, block output, recover and restore',()=>{
 editor.reset();assert.equal(entry.disabled,true);busy=false;editor.sync();assert.equal(entry.disabled,false);entry.click();
 const first=input(50);type(first,655350);assert.equal(rows[50].cost,655350);assert.equal(changed,1);assert.equal(input(50),first);
 type(first,655351);assert.equal(rows[50].cost,655350);assert.equal(first.getAttribute('aria-invalid'),'true');
 editor.focus(65);assert.equal(input(50),null);assert.equal(editor.validate(),false);assert.equal(input(50).value,'655351');
 type(input(50),10);assert.equal(editor.validate(),true);assert.equal(rows[50].cost,10);
 const reset=input(50).closest('label').querySelector('button');reset.click();assert.equal(rows[50].cost,0);
 busy=true;editor.sync();type(input(50),20);assert.equal(rows[50].cost,0);
});
