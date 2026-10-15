import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesBattleLibrarySearch as matches} from '../assets/editor-battle-library-search.mjs';
const row={id:61,text:'대형빔사벨 ＧＰ-０3덴드로비움'};
test('battle library searches actual record numbers without substring collisions',()=>{
 for(const query of ['61','#61','６１','＃６１',' 61 '])assert.equal(matches(row,query),true);
 for(const id of [6,610,1161])assert.equal(matches({...row,id},'61'),false);
});
test('battle library accepts keyboard width, spacing and case for disc names',()=>{
 for(const query of ['GP03','gp-03','대형 빔 사벨','GP03 대형빔','덴드로비움 사벨'])assert.equal(matches(row,query),true);
 for(const query of ['GP01','빔라이플','대형빔 아무로'])assert.equal(matches(row,query),false);
});
test('battle library preserves empty searches and literal punctuation safely',()=>{
 assert.equal(matches(row,''),true);assert.equal(matches(row,'  '),true);
 assert.equal(matches(row,'['),false);assert.equal(matches(row,'.*'),false);
 assert.equal(matches({id:1,text:'ビームサーベル'},'ビームサーベル'),true);
});
