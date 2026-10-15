import test from 'node:test';
import assert from 'node:assert/strict';
import {battleCombatTerrainHint as hint} from '../assets/editor-battle-simulation-ui.mjs';
test('explains zero adaptation from the actual computed domains, without guessing from background names',()=>{
 assert.equal(hint({status:'ready',breakdown:{weaponTerrainPercent:100,attackerTerrainPercent:0,attackDomain:'ground',defenderDomain:'space'}}),'사용 기체·파일럿 육지 적응 0%');
 assert.equal(hint({status:'ready',breakdown:{weaponTerrainPercent:0,attackerTerrainPercent:100,attackDomain:'air',defenderDomain:'sea'}}),'무기 바다 적응 0% · 지형 확인');
});
test('ordinary low damage and incomplete calculations do not invent a terrain explanation',()=>{
 assert.equal(hint({status:'ready',damage:10,breakdown:{weaponTerrainPercent:100,attackerTerrainPercent:100}}),null);
 assert.equal(hint({status:'partial',breakdown:{attackerTerrainPercent:0,attackDomain:'ground'}}),null);
 assert.equal(hint({status:'ready',breakdown:{weaponTerrainPercent:0,defenderDomain:'unknown'}}),null);
 assert.equal(hint(null),null);
});
