import sys
sys.dont_write_bytecode=True
import importlib.util,io,json,hashlib,tarfile,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('pages_archive',Path(__file__).resolve().parents[1]/'scripts/pages_archive.py');a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
class PagesArchiveTests(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory();self.addCleanup(self.t.cleanup);self.root=Path(self.t.name);self.site=self.root/'site';self.site.mkdir();(self.site/'index.html').write_bytes(b'hello');self.path=self.root/'artifact.tar';self.lock={'schema':'srwf.static-site-lock.v1','files':[{'path':'index.html','bytes':5,'sha256':hashlib.sha256(b'hello').hexdigest()}],'bytes':5};self.lockpath=self.root/'lock.json';self.lockpath.write_text(json.dumps(self.lock));self.lock,self.locksha=a.load_lock(self.lockpath)
 def archive(self,entries):
  with tarfile.open(self.path,'w')as t:
   for name,data,kind in entries:
    i=tarfile.TarInfo(name);i.type=kind;i.size=len(data)if kind==tarfile.REGTYPE else 0;i.linkname='index.html'if kind in (tarfile.LNKTYPE,tarfile.SYMTYPE)else'';t.addfile(i,io.BytesIO(data)if kind==tarfile.REGTYPE else None)
 def test_pack_is_deterministic_and_matches_exact_payload(self):
  x=a.pack_archive(self.site,self.path,self.lock,self.locksha);y=a.pack_archive(self.site,self.root/'second.tar',self.lock,self.locksha);self.assertEqual(x,y);self.assertEqual(x['files'],1)
 def test_official_dot_prefix_and_directory_entries_are_normalized(self):
  self.archive([('.',b'',tarfile.DIRTYPE),('./index.html',b'hello',tarfile.REGTYPE)]);self.assertEqual(a.verify_archive(self.path,self.lock,self.locksha)['files'],1)
 def test_missing_changed_duplicate_and_extra_members_fail(self):
  for entries in [[],[('index.html',b'other',tarfile.REGTYPE)],[('index.html',b'hello',tarfile.REGTYPE)]*2,[('index.html',b'hello',tarfile.REGTYPE),('private.txt',b'x',tarfile.REGTYPE)]]:
   self.archive(entries)
   with self.assertRaises(a.ArchiveError):a.verify_archive(self.path,self.lock,self.locksha)
 def test_links_traversal_hidden_and_devices_fail(self):
  for name,kind in [('index.html',tarfile.SYMTYPE),('index.html',tarfile.LNKTYPE),('../index.html',tarfile.REGTYPE),('/index.html',tarfile.REGTYPE),('./.nojekyll',tarfile.REGTYPE),('index.html',tarfile.CHRTYPE)]:
   self.archive([(name,b'hello',kind)])
   with self.assertRaises(a.ArchiveError):a.verify_archive(self.path,self.lock,self.locksha)
 def test_existing_archive_and_source_changes_fail_without_overwrite(self):
  self.path.write_bytes(b'keep')
  with self.assertRaises(a.ArchiveError):a.pack_archive(self.site,self.path,self.lock,self.locksha)
  self.assertEqual(self.path.read_bytes(),b'keep');(self.site/'extra.txt').write_text('no')
  with self.assertRaises(a.ArchiveError):a.pack_archive(self.site,self.root/'new.tar',self.lock,self.locksha)
  self.assertFalse((self.root/'new.tar').exists())
 def test_hidden_lock_and_relaxed_size_cannot_be_accepted(self):
  for row,total in [({'path':'.nojekyll','bytes':0,'sha256':'a'*64},0),({'path':'index.html','bytes':1000000001,'sha256':'a'*64},1000000001)]:
   self.lock['files']=[row];self.lock['bytes']=total;self.lockpath.write_text(json.dumps(self.lock))
   with self.assertRaises(a.ArchiveError):a.load_lock(self.lockpath)
if __name__=='__main__':unittest.main(verbosity=2)
