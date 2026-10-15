// F018A5C/018AAA and Final018F30/018F8C choose area-map entry indices.
// Keep source file selection separate from the sequence bank encoded in a
// battle request. Directory bankIndex is not that runtime bank identity.
export function resolveBattleSeBindings(soundPackage,areaMap,{mapIndex=0,commonPackage}={}){
 if(soundPackage?.fileName!=='SE.BIN'||!Number.isInteger(soundPackage.bankIndex)||soundPackage.bankIndex<0||soundPackage.bankIndex>255||!Number.isInteger(mapIndex)||mapIndex<0)throw new Error('Battle SE bindings: explicit source package and map required');
 const entries=areaMap?.maps?.[mapIndex]?.entries;
 if(!Array.isArray(entries))throw new Error('Battle SE bindings: map unavailable');
 const toneSlot=soundPackage.bankIndex?1:2,sequenceSlot=soundPackage.bankIndex?5:3,tone=entries[toneSlot],sequence=entries[sequenceSlot];
 if(tone?.type!==0||sequence?.type!==1||![tone,sequence].every(e=>Number.isInteger(e.id)&&e.id>=0&&e.id<16&&Number.isInteger(e.size)&&e.size>0))throw new Error('Battle SE bindings: source map entry mismatch');
 if(!(soundPackage.toneBytes instanceof Uint8Array)||!(soundPackage.sequenceBytes instanceof Uint8Array)||!soundPackage.toneBytes.length||!soundPackage.sequenceBytes.length||soundPackage.toneBytes.length>0x2000000||soundPackage.sequenceBytes.length>0x2000000)throw new Error('Battle SE bindings: bounded source transfers required');
 // The owned transfer helper copies its requested size without comparing
 // map capacity. Web packages are separate buffers: retain observed source
 // overruns as evidence, rather than importing a hardware memory constraint.
 const transferWarnings=[];
 for(const [kind,entry,bytes]of [['tone',tone,soundPackage.toneBytes],['sequence',sequence,soundPackage.sequenceBytes]])if(bytes.length>entry.size)transferWarnings.push({kind,reason:'source-transfer-exceeds-map-area',areaSize:entry.size,transferSize:bytes.length,overrunBytes:bytes.length-entry.size});
 const toneBanks=new Map([[tone.id,soundPackage]]);
 if(soundPackage.bankIndex&&commonPackage){
  if(commonPackage.fileName!=='SE.BIN'||commonPackage.bankIndex!==0)throw new Error('Battle SE bindings: common package must be source bank0');
  const common=resolveBattleSeBindings(commonPackage,areaMap,{mapIndex});
  if(toneBanks.has(common.toneBank))throw new Error('Battle SE bindings: colliding source tone areas');
  toneBanks.set(common.toneBank,commonPackage);
 }
 return{status:'reference',fileBankIndex:soundPackage.bankIndex,toneBank:tone.id,sequenceBank:sequence.id,toneSlot,sequenceSlot,mapIndex,transferWarnings,
  toneBanks,sequence:soundPackage.sequence,scope:'source loader bank binding; scene file-bank selection and channel lifecycle remain separate'};
}
// F060189F8..06018A22 reads load-command byte1. F0..FF select the
// byte at subject-row offset1, with two-byte stride. Subject rows are
// runtime battle context; never substitute weapon ordinals for that table.
export function resolveBattleSeFileBank(selector,{subjectBanks}={}){
 if(!Number.isInteger(selector)||selector<0||selector>255)throw new Error('Battle SE file bank: byte selector required');
 if((selector&240)!==240)return{status:'ready',bankIndex:selector,source:'literal'};
 const subjectIndex=selector&15;
 if(!(subjectBanks instanceof Map)||!subjectBanks.has(subjectIndex))return{status:'partial',reason:'effect-sound-subject-bank-unresolved',subjectIndex};
 const bankIndex=subjectBanks.get(subjectIndex);
 if(!Number.isInteger(bankIndex)||bankIndex<0||bankIndex>255)throw new Error('Battle SE file bank: invalid subject binding');
 return{status:'ready',bankIndex,source:'subject',subjectIndex};
}
// Snapshot the low bytes read by the loader from an explicit web battle
// work table. Other programs mutate these words; the snapshot is not a
// permanent unit/weapon association and must be refreshed at load events.
export function readBattleSeSubjectBanks(words){
 if(!(words instanceof Uint16Array)||words.length!==16)throw new Error('Battle SE subject banks: sixteen explicit work words required');
 return new Map(Array.from(words,(word,index)=>[index,word&255]));
}

// Aux21 F06018BA0 / Final0601907C reads active D_ANIME bytes44/45
// as a BE word into work row15 (F060CAC1E / Final060D20AE). Aux16
// with selector FF reads that row's low byte for the SE file directory.
// Web preparation resolves this selected-program dependency directly;
// it does not fabricate the other mutable work rows or an inherited bank.
export function readBattleAnimationSeFileBank(program){
 if(!(program instanceof Uint8Array)||program.length<46||program[0]!==46||program[1]||program[2]||program[3])throw new Error('Battle animation SE: bounded source header required');
 const headerWord=program[44]*256+program[45];
 if(headerWord===65535)return{status:'partial',reason:'effect-sound-inherited-file-bank-unresolved',headerWord};
 const selected=resolveBattleSeFileBank(255,{subjectBanks:new Map([[15,headerWord&255]])});
 return{...selected,source:'selected-animation-header',headerWord,subjectIndex:15,headerByteOffset:44};
}
