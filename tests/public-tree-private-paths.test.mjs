import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// Public main before this deploy candidate. Files already there and unchanged are out of scope.
const PUBLIC_MAIN='e4b441e';
const FORBIDDEN=['/Users/','~/Documents','memory/','_claude_'];
const root=fileURLToPath(new URL('../',import.meta.url));
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});
function changedFiles(){
 try{git(['cat-file','-e',`${PUBLIC_MAIN}^{commit}`]);}catch{return null;}
 const listed=git(['diff','--name-only','--diff-filter=AMR','-z',PUBLIC_MAIN]).split('\0')
  .concat(git(['ls-files','--others','--exclude-standard','-z']).split('\0'));
 return [...new Set(listed.filter(Boolean))].filter(f=>existsSync(`${root}/${f}`)).sort();
}

test('files added or changed since public main carry no personal path or private workflow marker',t=>{
 const files=changedFiles();
 if(!files){t.skip(`git history with ${PUBLIC_MAIN} is not available`);return;}
 assert.ok(files.length>0);
 const hits=[];
 for(const file of files){
  if(file===`tests/public-tree-private-paths.test.mjs`)continue;
  const bytes=readFileSync(`${root}/${file}`);
  if(bytes.includes(0))continue; // binary
  const text=bytes.toString('utf8');
  for(const needle of FORBIDDEN)if(text.includes(needle))hits.push(`${file}: ${needle}`);
 }
 assert.deepEqual(hits,[]);
});

test('workflow-only documents stay out of the public tree',()=>{
 assert.equal(existsSync(`${root}/docs/EDITOR_VERSION_MIGRATION.md`),false);
 const local=readFileSync(`${root}/docs/LOCAL_EDITOR.md`,'utf8');
 assert.doesNotMatch(local,/Claude|Codex|FQA/);
 assert.doesNotMatch(local.replaceAll('F v0.4',''),/v0\.4/);
});
