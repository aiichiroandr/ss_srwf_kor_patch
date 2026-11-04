import sys
sys.dont_write_bytecode = True
import hashlib, importlib.util, tempfile, unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('pages_approval', Path(__file__).resolve().parents[1] / 'scripts/pages_approval.py')
a = importlib.util.module_from_spec(spec); spec.loader.exec_module(a)

class PagesApprovalTests(unittest.TestCase):
    def test_commit_must_match_both_event_and_checkout(self):
        a.accepted_commit('a'*40, 'a'*40, 'a'*40)
        for expected, checkout, event in [(None,'a'*40,'a'*40),('a'*7,'a'*40,'a'*40),('a'*40,'b'*40,'a'*40),('a'*40,'a'*40,'b'*40)]:
            with self.assertRaises(ValueError): a.accepted_commit(expected,checkout,event)
    def test_lock_must_be_preaccepted_not_just_generated(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'lock.json'; path.write_bytes(b'{"files":[]}\n')
            expected = hashlib.sha256(path.read_bytes()).hexdigest()
            a.accepted_lock(expected,path)
            for invalid in [None, expected[:8], '0'*64]:
                with self.assertRaises(ValueError): a.accepted_lock(invalid,path)
            path.write_bytes(b'{"files":["changed"]}\n')
            with self.assertRaises(ValueError): a.accepted_lock(expected,path)

if __name__ == '__main__': unittest.main(verbosity=2)
