import test from 'node:test';
import assert from 'node:assert/strict';
import {readAfterDialogueJson,canonicalAfterDialogueJson,afterDialogueText} from '../assets/editor-dialogue-sequence.mjs';
test('added dialogue shape keeps speaker IDs separate from text and canonicalizes deletion',()=>{
 assert.deepEqual(readAfterDialogueJson(''),[]);assert.equal(canonicalAfterDialogueJson('[]'),'');
 const json='[{"text":"힣","speakerId":71},{"speakerId":72,"text":""}]';assert.equal(canonicalAfterDialogueJson(json),'[{"speakerId":71,"text":"힣"},{"speakerId":72,"text":""}]');assert.equal(afterDialogueText(json),'힣');
});
test('added dialogue shape refuses extra metadata, invalid IDs and invalid text',()=>{
 for(const value of [null,[],{},'null','{}','[{"speakerId":0,"text":"가"}]','[{"speakerId":512,"text":"가"}]','[{"speakerId":71,"text":"가","identity":"untrusted"}]',JSON.stringify([{speakerId:71,text:'가\n나'}]),JSON.stringify(Array(5).fill({speakerId:71,text:'가'}))])assert.throws(()=>readAfterDialogueJson(value),error=>error.code==='EDITOR_DIALOGUE_INVALID');
});
