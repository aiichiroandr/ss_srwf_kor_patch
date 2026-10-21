import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MobileSpeedGuard} from '../web-port/mobile-speed-guard.mjs';

// Rates from the user's read-free S25 window (frame 7226). Consecutive windows
// below are synthetic decision scenarios, not claims about the raw recording.
const s25 = {speed:2,windowMs:2000,gameFps:73.2876440994408,
  audioSamplesPerSecond:27381.84843326134,readMs:0,gaps:120,bufferMs:100};
function observe(guard, now, changes = {}, state = {}) {
  return guard.observe({...s25,frame:7226 + now / 2,...changes},
    {now,visible:true,audioRunning:true,...state});
}

test('sustained S25 producer deficit with fresh underruns requests fallback once', () => {
  const guard = new MobileSpeedGuard(); guard.reset(0,120);
  assert.equal(observe(guard,6000,{gaps:121}),false);
  assert.equal(observe(guard,8000,{gaps:122}),true);
  assert.equal(observe(guard,10000,{gaps:123}),false);
  guard.reset(10000,123);
  assert.equal(observe(guard,16000,{gaps:124}),false);
  assert.equal(observe(guard,18000,{gaps:125}),true);
});

test('grace ignores startup and windows overlapping a requested speed change', () => {
  const guard = new MobileSpeedGuard(); guard.reset(0,120);
  for (const now of [2000,4000,5500]) assert.equal(observe(guard,now,{bufferMs:0}),false);
  assert.equal(observe(guard,7500,{bufferMs:0}),false);
  assert.equal(observe(guard,9500,{bufferMs:0}),true);
});

test('a short slowdown or either healthy throughput breaks the consecutive sequence', () => {
  for (const healthy of [{gameFps:119.652},{audioSamplesPerSecond:44100}]) {
    const guard = new MobileSpeedGuard(); guard.reset(0,120);
    assert.equal(observe(guard,6000,{bufferMs:0}),false);
    assert.equal(observe(guard,8000,{bufferMs:0,...healthy}),false);
    assert.equal(observe(guard,10000,{bufferMs:0}),false);
    assert.equal(observe(guard,12000,{bufferMs:0}),true);
  }
});

test('historical gaps alone do not trigger; low current buffer is independent evidence', () => {
  const guard = new MobileSpeedGuard(); guard.reset(0,120);
  assert.equal(observe(guard,6000),false);
  assert.equal(observe(guard,8000),false);
  assert.equal(observe(guard,10000,{bufferMs:39}),false);
  assert.equal(observe(guard,12000,{bufferMs:39}),true);
});

test('hidden or suspended audio resets evidence and adds a foreground grace period', () => {
  for (const state of [{visible:false},{audioRunning:false}]) {
    const guard = new MobileSpeedGuard(); guard.reset(0,120);
    assert.equal(observe(guard,6000,{bufferMs:0}),false);
    assert.equal(observe(guard,8000,{bufferMs:0},state),false);
    assert.equal(observe(guard,10000,{bufferMs:0}),false);
    assert.equal(observe(guard,12000,{bufferMs:0}),false);
    assert.equal(observe(guard,14000,{bufferMs:0}),false);
    assert.equal(observe(guard,16000,{bufferMs:0}),true);
  }
});

test('1x deficits are never treated as a request to change game or sound speed', () => {
  const guard = new MobileSpeedGuard(); guard.reset(0,120);
  assert.equal(observe(guard,6000,{bufferMs:0}),false);
  assert.equal(observe(guard,8000,{speed:1,gameFps:42.199,audioSamplesPerSecond:31011,bufferMs:0}),false);
  assert.equal(observe(guard,10000,{bufferMs:0}),false);
  assert.equal(observe(guard,12000,{bufferMs:0}),false);
  assert.equal(observe(guard,14000,{bufferMs:0}),false);
  assert.equal(observe(guard,16000,{bufferMs:0}),true);
});

test('stale, duplicated, backwards, malformed, or reset-counter rows cannot complete a decision', () => {
  const cases = [
    [8000,{windowMs:6000}], [8000,{windowMs:500}],
    [6500,{}], [12000,{}], [5000,{}],
    [8000,{frame:10226}], [8000,{frame:1}],
    [8000,{gaps:0}], [8000,{gameFps:NaN}],
    [8000,{audioSamplesPerSecond:Infinity}], [8000,{bufferMs:-1}],
  ];
  for (const [now, changes] of cases) {
    const guard = new MobileSpeedGuard(); guard.reset(0,120);
    assert.equal(observe(guard,6000,{gaps:121}),false);
    assert.equal(observe(guard,now,{gaps:122,bufferMs:0,...changes}),false);
    assert.equal(observe(guard,now+2000,{gaps:123,bufferMs:0}),false);
  }
});

test('thresholds use strictly below and low-buffer does not override throughput requirements', () => {
  for (const changes of [
    {gameFps:0.9*59.826*2}, {audioSamplesPerSecond:0.9*44100}, {bufferMs:40},
  ]) {
    const guard = new MobileSpeedGuard(); guard.reset(0,120);
    assert.equal(observe(guard,6000,{bufferMs:0,...changes}),false);
    assert.equal(observe(guard,8000,{bufferMs:0,...changes}),false);
  }
});
