import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBattleActorMaterial} from '../assets/editor-battle-materials.mjs';
const context=()=>{
 const addressMap=new Uint16Array(64);addressMap[32]=40;addressMap[36]=44;
 const geometryTable=Uint8Array.from(Buffer.from('00900070200012700008000821000108','hex'));
 return {variant:1,pass:0,textureBases:new Uint16Array(32),addressMap,geometryTable,
  drawColors:Uint8Array.from([2,3,4,5,6,0,0,0])};
};
const actor=()=>({selector:0x0800,flags2:0,colorFlags:2,nativeByte64:10,nativeWord72:0});
test('standard actor resolves native texture and palette separately and matches body material bytes',()=>{
 const ctx=context(),a=actor();
 const body=resolveBattleActorMaterial(a,'owned-body',ctx);
 assert.equal(body.status,'ready');assert.equal(body.textureIndex,0);assert.equal(body.paletteOffset,640);
 assert.equal(Buffer.from(body.attributes).toString('hex'),'00000080428000000a02');
 const defender=resolveBattleActorMaterial({...a,selector:0x0901,nativeWord72:16,flags2:3},'owned-defender',ctx);
 assert.equal(defender.textureIndex,1);assert.equal(defender.paletteBank,44);
 assert.equal(new DataView(defender.attributes.buffer).getUint16(8),0x0a32);
 ctx.geometryTable.fill(255);assert.equal(body.geometry[0],0);
});
test('cache bases and variant mapping use their native words without borrowing another texture',()=>{
 const ctx=context();ctx.textureBases[8]=1;
 assert.equal(resolveBattleActorMaterial(actor(),'owned-body',ctx).textureIndex,1);
 assert.equal(resolveBattleActorMaterial({...actor(),selector:0x0801},'owned-body',ctx).reason,'texture-registration-bounds');
 assert.equal(resolveBattleActorMaterial({...actor(),selector:0x8800},'owned-body',ctx).paletteBank,0);
 assert.equal(resolveBattleActorMaterial({...actor(),nativeWord72:65535},'owned-body',ctx).paletteBank,0);
 assert.equal(resolveBattleActorMaterial({...actor(),nativeWord72:512},'owned-body',ctx).paletteBank,0);
});
test('custom indices use explicit or registered palette words rather than ordinary group bases',()=>{
 const ctx=context();ctx.textureBases[16]=100;ctx.addressMap[16]=52;ctx.addressMap[4]=20;
 ctx.textureAttributes=new Uint8Array(20);new DataView(ctx.textureAttributes.buffer).setUint16(14,0x0480);
 const registered=resolveBattleActorMaterial({...actor(),selector:0xf001},'registered',ctx);
 assert.equal(registered.textureIndex,1);assert.equal(registered.paletteBank,52);
 const explicit=resolveBattleActorMaterial({...actor(),selector:0xf801,nativeWord72:16},'explicit',ctx);
 assert.equal(explicit.textureIndex,1);assert.equal(explicit.paletteBank,20);
 delete ctx.textureAttributes;
 assert.equal(resolveBattleActorMaterial({...actor(),selector:0xf001},'missing',ctx).reason,'custom-palette-registration-unresolved');
});
