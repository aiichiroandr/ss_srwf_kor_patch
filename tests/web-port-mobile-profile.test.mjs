import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executionProfile, isMobileDevice} from '../web-port/mobile-profile.mjs';

test('mobile policy includes Android tablets and iPadOS without changing touch PCs', () => {
  for (const nav of [
    {userAgent:'Mozilla/5.0 (Linux; Android 16; SM-S938B)', userAgentData:{mobile:true}},
    {userAgent:'Mozilla/5.0 (Linux; Android 16; Tablet)', userAgentData:{mobile:false}},
    {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'},
    {userAgent:'Mozilla/5.0 (Macintosh)', platform:'MacIntel', maxTouchPoints:5},
  ]) assert.equal(executionProfile(nav).optimized, true);
  for (const nav of [
    {userAgent:'Mozilla/5.0 (Macintosh)', platform:'MacIntel', maxTouchPoints:0},
    {userAgent:'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints:10},
    {userAgent:'Mozilla/5.0 (X11; Linux x86_64)', userAgentData:{mobile:false}},
    {},
  ]) assert.deepEqual(executionProfile(nav), {mobile:false, optimized:false, name:'standard'});
});

test('mobile optimization can be disabled without misclassifying the device', () => {
  const nav={userAgent:'Android'};
  assert.equal(isMobileDevice(nav), true);
  assert.deepEqual(executionProfile(nav, false), {mobile:true, optimized:false, name:'standard'});
});
