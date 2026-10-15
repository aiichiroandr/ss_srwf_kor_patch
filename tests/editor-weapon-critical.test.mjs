import test from'node:test';import assert from'node:assert/strict';
import{WEAPON_CRITICAL_CHOICES,weaponCriticalBonus,weaponCriticalLabel,canonicalWeaponCritical}from'../assets/editor-weapon-critical.mjs';
import{matchesConditions,isValidBulkValue,planBulkEdit,applyBulkEdit,undoBulkEdit}from'../assets/editor-filter.mjs';
test('critical codes show signed threshold modifiers and preserve the native low-three-bit aliases',()=>{
 assert.deepEqual(Array.from({length:16},(_,i)=>weaponCriticalBonus(i)),[-20,-10,0,10,20,0,0,0,-20,-10,0,10,20,0,0,0]);
 assert.deepEqual(WEAPON_CRITICAL_CHOICES.map(c=>c.label),['-20','-10','0','+10','+20']);
 assert.equal(weaponCriticalLabel(4),'+20');assert.equal(canonicalWeaponCritical(12),4);assert.equal(canonicalWeaponCritical(15),2);
 for(const bad of [-1,16,4.5,'4',null,undefined])assert.equal(weaponCriticalBonus(bad),null);
});
test('critical search compares modifiers and bulk stores the proper code with reversible snapshots',()=>{
 const row={recordIndex:1,name:'synthetic',editable:true,critical:15,original:{critical:15}},session={gameId:'srwf-final',weapons:[row]};
 assert.equal(matchesConditions('weapon',row,[{field:'critical',op:'eq',value:2}]),true);
 assert.equal(matchesConditions('weapon',row,[{field:'critical',op:'gte',value:3}]),false);
 assert.equal(matchesConditions('weapon',{critical:12},[{field:'critical',op:'eq',value:4}]),true);
 assert.equal(isValidBulkValue('weapon','critical',4),true);assert.equal(isValidBulkValue('weapon','critical',20),false);
 assert.equal(isValidBulkValue('weapon','critical',12),false);
 const batch=planBulkEdit(session,'weapon',[row],'critical',4);assert.equal(applyBulkEdit(batch,session).applied,1);assert.equal(row.critical,4);
 const transaction={kind:'weapon',items:[{recordIndex:1,field:'critical',before:15,after:4}]};assert.equal(undoBulkEdit(transaction,session),1);assert.equal(row.critical,15);
});
