import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('withdrawn runtime packaging preserves releases and denies executable reintroduction or broad URL exceptions',()=>{
 const source=`
import runpy,json
ns=runpy.run_path('tests/test_pages_site.py',run_name='fixture')
c=ns['SitePackagingTests']();c.setUp();b=ns['site']
try:
 p=c.policy
 p['files']=[n for n in p['files'] if '/runtime/' not in n and n not in {'web-port/worker.js','weapon-preview/worker.js'}]
 p['pins']={n:v for n,v in p['pins'].items() if n in p['files']}
 p.update(runtimeState='WITHDRAWN',runtimeSets=[],runtimeManifests={},runtimeNotices=[],runtimeWorkers={})
 files={'assets/editor-public-features.mjs':'export const flags={runtimePreview:false};','assets/editor-preview-resources.mjs':"export const get=()=>import('../weapon-preview/runtime-worker-loader.mjs?v=test');"}
 for name,data in files.items():
  c.put(name,data);p['files'].append(name);p['pins'][name]={'bytes':len(data.encode()),'sha256':b.file_hash(c.root/name)}
 p['files']=sorted(p['files']);p['withdrawnPreviewReferences']={'assets/editor-preview-resources.mjs':['../weapon-preview/runtime-worker-loader.mjs?v=test']}
 c.save_policy();p=b.load_policy(c.policy_path);lock=b.create_lock(c.root,p);b.build_site(c.root,c.output,p,lock,copy_mode='copy');b.verify_site(c.output,p,lock)
 assert not list(c.output.rglob('*.wasm'));assert len(p['releaseIds'])==12
 c.put('assets/editor-public-features.mjs','export const flags={runtimePreview:true};')
 try:b.check_references(c.root,p)
 except b.PackageError:pass
 else:raise AssertionError('enabled preview was accepted')
 p['withdrawnPreviewReferences']['assets/editor-preview-resources.mjs']=['../private.bin'];c.policy=p;c.save_policy()
 try:b.load_policy(c.policy_path)
 except b.PackageError:pass
 else:raise AssertionError('arbitrary missing path accepted')
 p['withdrawnPreviewReferences']={};p['runtimeSets']=[{'surface':'web-port','version':'0'*20}];c.save_policy()
 try:b.load_policy(c.policy_path)
 except b.PackageError:pass
 else:raise AssertionError('withdrawn executable registration accepted')
 p['runtimeSets']=[];p['runtimeState']='UNKNOWN';c.save_policy()
 try:b.load_policy(c.policy_path)
 except b.PackageError:pass
 else:raise AssertionError('unknown runtime state accepted')
finally:c.doCleanups()
print('PASS withdrawn policy')
`;
 const r=spawnSync('python3',['-c',source],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/PASS withdrawn policy/);
});
