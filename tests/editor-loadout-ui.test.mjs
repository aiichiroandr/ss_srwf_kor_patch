import assert from 'node:assert/strict';
import test from 'node:test';
import {installFakeDom} from './helpers/fake-dom.mjs';
import {createUnitWeaponScroller} from '../assets/editor-loadout-ui.mjs';

test('all slots remain available, same-unit edits retain scroll and another unit resets it', () => {
  const document=installFakeDom(), list=document.createElement('div'); document.body.append(list);
  list.clientHeight=200; list.getBoundingClientRect=()=>({top:20});
  const rows=Array.from({length:16},(_,i)=>{
    const row=document.createElement('div'),select=document.createElement('select');
    row.className='unit-weapon-row'; select.dataset.unitWeaponField=`weapon${i+1}`;
    const option=document.createElement('option');option.value=String(874+i);select.append(option);select.value=option.value;
    row.append(select); row.getBoundingClientRect=()=>({top:20+i*90-list.scrollTop,height:90});list.append(row);return row;
  });
  const ui=createUnitWeaponScroller({list});ui.refresh({recordKey:1});
  assert.equal(rows.every(row=>!row.hidden),true);
  list.scrollTop=360;ui.refresh({recordKey:1});assert.equal(list.scrollTop,360);
  ui.refresh({focusField:'weapon16'});assert.equal(list.scrollTop,1240);
  assert.equal(rows[15].querySelector('select').value,'889');
  ui.refresh({recordKey:2});assert.equal(list.scrollTop,0);
});
