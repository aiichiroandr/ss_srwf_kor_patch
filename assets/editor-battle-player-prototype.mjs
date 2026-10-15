import {createBattlePlayer} from './editor-battle-player.mjs';
const units=[{recordIndex:1,name:'Z건담'},{recordIndex:2,name:'건담 Mk-II'},{recordIndex:3,name:'제간'},{recordIndex:4,name:'웨이브라이더'}];
const weapons=[{recordIndex:1,name:'빔사벨',power:1800,minRange:1,maxRange:1,en:0,ammo:'—',owners:[{unit:1},{unit:2},{unit:3}]},{recordIndex:2,name:'빔라이플',power:2100,minRange:1,maxRange:5,en:0,ammo:8,owners:[{unit:1},{unit:2},{unit:3}]},{recordIndex:3,name:'하이퍼 메가 런처',power:3400,minRange:2,maxRange:7,en:40,ammo:'—',owners:[{unit:1}]},{recordIndex:4,name:'웨이브라이더어택',power:4100,minRange:1,maxRange:5,en:100,ammo:'—',owners:[{unit:4}]}];
window.battlePlayerPrototype=createBattlePlayer({container:document.querySelector('#player'),getUnits:()=>units,getWeapons:()=>weapons});
