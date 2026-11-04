import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
sys.dont_write_bytecode = True
import tempfile
import unittest
from unittest import mock

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('site_packager', BASE/'scripts/build_site.py')
site = importlib.util.module_from_spec(spec); spec.loader.exec_module(site)

class SitePackagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)/'source'; self.root.mkdir()
        self.output = Path(self.temp.name)/'site'
        self.runtime_sets = [
            {'surface':'web-port','version':'1'*20}, {'surface':'web-port','version':'2'*20},
            {'surface':'web-port','version':'3'*20}, {'surface':'web-port','version':'4'*20},
            {'surface':'weapon-preview','version':'5'*20}, {'surface':'weapon-preview','version':'6'*20}]
        def put(name, data):
            p=self.root/name; p.parent.mkdir(parents=True,exist_ok=True)
            p.write_bytes(data.encode() if isinstance(data,str) else data)
        self.put=put
        put('.nojekyll',''); put('NOTICE.md','Public notice')
        put('index.html','<script type="module" src="./assets/app.mjs?v=1"></script><a href="./docs/WEB_PORT_TEST.md">help</a><a href="./web-port/">play</a>')
        put('assets/app.mjs', 'import "./helper.mjs"; const facts="docs/EDITOR_FACTS.md#event-flag-conditions";')
        put('assets/helper.mjs', 'export const helper=1;')
        put('docs/WEB_PORT_TEST.md','[Facts](EDITOR_FACTS.md#event-flag-conditions)')
        put('docs/EDITOR_FACTS.md','Public facts only.')
        put('web-port/index.html','<a href="../">home</a>')
        put('web-port/worker.js','const buildDir="./runtime/"+version+"/";importScripts(buildDir+"saturn.js");')
        put('weapon-preview/worker.js','const buildDir=`./runtime/${version}/`;importScripts(buildDir+"saturn.js");')
        notices=[]
        for surface in ['web-port','weapon-preview']:
            for name in ['BUILD.md','COPYING','LICENSE','THIRD_PARTY.md']:
                path=f'{surface}/runtime/{name}';notices.append(path);put(path,'Test license/build notice')
        for item in self.runtime_sets:
            prefix=f'{item["surface"]}/runtime/'; version=item['version']
            put(prefix+version+'/saturn.js','// generated test host')
            put(prefix+version+'/saturn.wasm',b'\0asm\x01\0\0\0')
            put(prefix+'source-'+version+'.tar.gz',b'authored test-only source fixture')
        manifests={'web-port/runtime/current.json':'1'*20,'web-port/runtime/current-mobile.json':'2'*20,
                   'web-port/runtime/current-mobile-v14.json':'3'*20,'weapon-preview/runtime/current.json':'5'*20,
                   'weapon-preview/runtime/f-current.json':'6'*20}
        for name, version in manifests.items():put(name,json.dumps({'version':version,'files':['saturn.js','saturn.wasm']}))
        releases=[]
        for i in range(12):
            identity=f'test-release-{i:02d}'; patch=f'patches/{identity}.srwfp';receipt=f'receipts/{identity}.acceptance.json';manifest=f'releases/{identity}.json'
            put(patch,b'authored sparse fixture');put(receipt,json.dumps({'releaseId':identity,'state':'ACCEPTED'}))
            put(manifest,json.dumps({'id':identity,'state':'ACCEPTED','patch':{'url':patch,'size':(self.root/patch).stat().st_size,'sha256':site.file_hash(self.root/patch)},
                'provenance':{'acceptanceReceiptSha256':site.file_hash(self.root/receipt)}}))
            releases.append({'id':identity,'state':'ACCEPTED','manifest':manifest,'manifestSha256':site.file_hash(self.root/manifest)})
        put('manifest/releases.json',json.dumps({'releases':releases}));put('schemas/release.schema.json','{}')
        files=sorted(p.relative_to(self.root).as_posix() for p in self.root.rglob('*') if p.is_file() and p.name != '.nojekyll')
        pins={name:{'bytes':(self.root/name).stat().st_size,'sha256':site.file_hash(self.root/name)} for name in files if '/runtime/'in name and not name.endswith('.json')
              or name.startswith(('patches/','releases/','receipts/','schemas/')) or name=='manifest/releases.json'}
        self.policy={'schema':'srwf.static-site-policy.v1','files':files,'pins':pins,'limitBytes':1_000_000_000,
                     'publicDocs':['docs/WEB_PORT_TEST.md','docs/EDITOR_FACTS.md'],'runtimeSets':self.runtime_sets,
                     'runtimeManifests':manifests,'runtimeNotices':notices,'releaseIds':[x['id']for x in releases],
                     'runtimeWorkers':{'web-port/worker.js':'web-port','weapon-preview/worker.js':'weapon-preview'}}
        self.policy_path=Path(self.temp.name)/'policy.json';self.save_policy();self.policy=site.load_policy(self.policy_path)
    def save_policy(self):self.policy_path.write_text(json.dumps(self.policy))
    def lock(self):return site.create_lock(self.root,self.policy)
    def build(self,lock=None):return site.build_site(self.root,self.output,self.policy,lock or self.lock(),copy_mode='copy')

    def test_complete_bundle_and_project_prefix_directory_refs(self):
        lock=self.lock();result=self.build(lock)
        self.assertEqual(result['files'],len(self.policy['files']));self.assertLess(result['bytes'],1_000_000_000)
        self.assertEqual(site.verify_site(self.output,self.policy,lock),result)
        self.assertTrue((self.output/'web-port/runtime/current-mobile.json').exists())
        self.assertTrue((self.output/'web-port/runtime'/('4'*20)/'saturn.wasm').exists())
        self.assertFalse((self.output/'scripts').exists())
        self.assertTrue((self.root/'.nojekyll').exists())
        self.assertFalse((self.output/'.nojekyll').exists())
        with self.assertRaises(site.PackageError):site.allowed_name('.nojekyll',self.policy)
    def test_extra_private_file_and_changed_output_refused(self):
        lock=self.lock();self.build(lock)
        (self.output/'empty-private').mkdir()
        with self.assertRaises(site.PackageError):site.verify_site(self.output,self.policy,lock)
        (self.output/'empty-private').rmdir()
        (self.output/'build').mkdir();(self.output/'build/private.bin').write_bytes(b'no')
        with self.assertRaises(site.PackageError):site.verify_site(self.output,self.policy,lock)
        shutil.rmtree(self.output/'build');p=self.output/'assets/app.mjs';p.write_text(p.read_text().replace('facts','factx'))
        with self.assertRaises(site.PackageError):site.verify_site(self.output,self.policy,lock)
    def test_source_tamper_after_lock_is_refused_before_output_creation(self):
        lock=self.lock();self.put('assets/app.mjs','export const changed=1;')
        with self.assertRaises(site.PackageError):self.build(lock)
        self.assertFalse(self.output.exists())
    def test_immutable_runtime_patch_and_receipt_tamper_refused(self):
        for name in ['web-port/runtime/'+('1'*20)+'/saturn.wasm','patches/test-release-00.srwfp','receipts/test-release-00.acceptance.json']:
            original=(self.root/name).read_bytes();self.put(name,original+b'X')
            with self.assertRaises(site.PackageError):self.lock()
            self.put(name,original)
    def test_missing_source_and_notice_refused(self):
        for name in ['web-port/runtime/source-'+('1'*20)+'.tar.gz','weapon-preview/runtime/COPYING']:
            p=self.root/name;data=p.read_bytes();p.unlink()
            with self.assertRaises(site.PackageError):self.lock()
            self.put(name,data)
    def test_forbidden_paths_even_if_added_to_policy(self):
        for name in ['.','../escape','assets/../escape','/absolute','assets/%2e%2e/private','assets\\escape','tests/report.md','docs/private-audit.md','assets/game.bin','assets/save.bcr','assets/unapproved.wasm','web-port/runtime/source-unknown.tar.gz']:
            old=self.policy['files'];self.policy['files']=sorted(old+[name]);self.save_policy()
            with self.assertRaises(site.PackageError):site.load_policy(self.policy_path)
            self.policy['files']=old
    def test_runtime_manifest_cannot_select_unretained_host(self):
        self.put('web-port/runtime/current.json',json.dumps({'version':'f'*20,'files':['saturn.js','saturn.wasm']}))
        with self.assertRaises(site.PackageError):self.lock()
    def test_no_missing_static_dynamic_or_fact_document_closure(self):
        for code in ['import "./missing.mjs";','fetch("./private.json");','const x="docs/PRIVATE.md#flag";','importScripts(unreviewed+"saturn.js");','import "/host-root.mjs";','import "/docs/EDITOR_FACTS.md";']:
            self.put('assets/app.mjs',code)
            with self.assertRaises(site.PackageError):self.lock()
    def test_output_never_reuses_or_deletes_existing_directory(self):
        self.output.mkdir();sentinel=self.output/'unrelated.txt';sentinel.write_text('keep')
        with self.assertRaises(site.PackageError):self.build()
        self.assertEqual(sentinel.read_text(),'keep')
        with self.assertRaises(site.PackageError):site.build_site(self.root,self.root/'assets/new',self.policy,self.lock(),'copy')
    def test_symlink_source_and_artifact_refused(self):
        path=self.root/'assets/helper.mjs';data=path.read_bytes();outside=Path(self.temp.name)/'outside.mjs';outside.write_bytes(data);path.unlink();path.symlink_to(outside)
        with self.assertRaises(site.PackageError):self.lock()
        path.unlink();path.write_bytes(data);lock=self.lock();self.build(lock)
        p=self.output/'assets/helper.mjs';p.unlink();p.symlink_to(outside)
        with self.assertRaises(site.PackageError):site.verify_site(self.output,self.policy,lock)
    def test_hardlinked_source_is_copied_independently_and_artifact_hardlinks_refused(self):
        path=self.root/'assets/helper.mjs';outside=Path(self.temp.name)/'shared.mjs';os.link(path,outside)
        lock=self.lock();self.build(lock);self.assertEqual((self.output/'assets/helper.mjs').stat().st_nlink,1)
        outside.write_text('external mutation');self.assertEqual((self.output/'assets/helper.mjs').read_text(),'export const helper=1;')
        p=self.output/'index.html';other=Path(self.temp.name)/'same-index.html';os.link(p,other)
        with self.assertRaises(site.PackageError):site.verify_site(self.output,self.policy,lock)
    def test_size_cap_cannot_be_relaxed_and_lock_totals_are_checked(self):
        self.policy['limitBytes']=1_000_000_001;self.save_policy()
        with self.assertRaises(site.PackageError):site.load_policy(self.policy_path)
        self.policy['limitBytes']=10
        with self.assertRaises(site.PackageError):self.lock()
        self.policy['limitBytes']=1_000_000_000;lock=self.lock();lock['bytes']+=1
        with self.assertRaises(site.PackageError):site.validate_lock(lock,self.policy)
    def test_mutation_during_copy_never_produces_approved_artifact(self):
        lock=self.lock();original=shutil.copyfileobj;mutated=False
        def copy(source,target,length=0):
            nonlocal mutated
            result=original(source,target,length)
            if not mutated:self.put('assets/app.mjs','mutated while packaging');mutated=True
            return result
        with mock.patch.object(site.shutil,'copyfileobj',copy):
            with self.assertRaises(site.PackageError):self.build(lock)
        with self.assertRaises(site.PackageError):site.verify_site(self.output,self.policy,lock)

if __name__=='__main__':unittest.main(verbosity=2)
