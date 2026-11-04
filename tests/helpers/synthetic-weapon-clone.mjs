import {buildGame} from './synthetic-game.mjs';
import {nameTable,recordTable,world,NAME} from './synthetic-tsr.mjs';
import {splitRootSegments} from '../../assets/editor-core.mjs';
import {weaponCloneIds} from '../../assets/editor-weapon-clone.mjs';
import {weaponFiller as weaponClonePreimage} from './synthetic-fillers.mjs';
export function weaponCloneGame(gameId){
 const root=splitRootSegments(buildGame({units:3,unitWeapons:{1:[{slot:1,weapon:1,ammo:1}],2:[{slot:1,weapon:1,ammo:1}]}})),parts=Object.fromEntries(root.map((p,i)=>[i,p.bytes]));
 const count=gameId==='srwf-f'?1280:1408,names=gameId==='srwf-f'?1280:1344,first=weaponCloneIds(gameId)[0];
 const records=Array.from({length:count},(_,id)=>{if(id>=first)return weaponClonePreimage(gameId);const b=new Uint8Array(17);b[1]=64;b[3]=id>>>8;b[4]=id&255;b[5]=4;b[6]=100;b[8]=49;b[9]=1;b[10]=3;b[11]=255;b[12]=id===1?12:0;b[14]=15;return b;});
 parts[30]=new Uint8Array(4);
 parts[29]=recordTable(records.map((_,id)=>id),records);parts[14]=nameTable(Array.from({length:names},(_,id)=>id>=first?NAME.EMPTY:Uint8Array.of(0x30+id%10,255)));
 return world(parts,{rooted:true}).decoded;
}
