// Private build snapshots are not public test suites. Keep test memory bounded.
// Node 23 on this Mac deadlocks while draining Maglev GC jobs at shutdown;
// disable that tier for test children on Node 23 only.
const {readdirSync}=require('node:fs');
const {spawn}=require('node:child_process');
const {resolve}=require('node:path');
const root=resolve(__dirname,'..');
// Optional arguments name single test files; without them every public test runs.
const files=process.argv.length>2?process.argv.slice(2):readdirSync(resolve(root,'tests'))
  .filter(name=>/\.test\.(?:mjs|cjs|js)$/.test(name)).sort().map(name=>`tests/${name}`);
if(!files.length)throw Error('No public Node tests found.');
const jitFlags=Number(process.versions.node.split('.')[0])===23?['--no-maglev']:[];
const child=spawn(process.execPath,[...jitFlags,'--test','--test-concurrency=4',...files],{cwd:root,stdio:'inherit'});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=signal?1:code??1;});
