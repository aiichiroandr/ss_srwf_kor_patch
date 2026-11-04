import assert from 'node:assert/strict';
import test from 'node:test';
import { packMeasuredGroups,editorLayoutNeedsMeasure } from '../assets/editor-layout.mjs';
import {installFakeDom} from './helpers/fake-dom.mjs';

test('live timeline paints never repack editor pages; preview toggles and field changes still do',()=>{
 const d=installFakeDom(),form=d.createElement('div'),timeline=d.createElement('section'),canvas=d.createElement('canvas'),field=d.createElement('input'),preview=d.createElement('section');
 timeline.className='weapon-timeline-panel';timeline.append(canvas);form.append(timeline,field,preview);
 assert.equal(editorLayoutNeedsMeasure([{target:canvas,type:'attributes',attributeName:'hidden'},{target:timeline,type:'childList'}]),false);
 assert.equal(editorLayoutNeedsMeasure([{target:preview,type:'attributes',attributeName:'hidden'}]),true);
 assert.equal(editorLayoutNeedsMeasure([{target:canvas,type:'childList'},{target:field,type:'childList'}]),true);
});

test('related fields stay on one page when their measured layout fits', () => {
  const groups = ['hp', 'en', 'stats', 'spirits', 'skills'];
  const pages = packMeasuredGroups(groups, () => true);
  assert.deepEqual(pages, [groups]);
});

test('changing available space repacks fields without losing or repeating any range', () => {
  const groups = ['attack', 'hit', 'critical', 'range', 'energy', 'ammo', 'morale', 'skill'];
  // Two controls share a rendered row; the frame/heading uses 24 pixels.
  const measured = page => Math.ceil(page.length / 2) * 40 + 24;
  for (const height of [104, 144, 184]) {
    const pages = packMeasuredGroups(groups, page => measured(page) <= height);
    assert.deepEqual(pages.flat(), groups);
    assert.ok(pages.every(page => measured(page) <= height));
    for (let index = 0; index + 1 < pages.length; index += 1) {
      assert.ok(measured([...pages[index], pages[index + 1][0]]) > height, 'split only at an actual overflow');
    }
  }
});
