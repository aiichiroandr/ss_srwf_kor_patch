#!/usr/bin/env python3
"""Small, proprietary-data-free safety tests for the pinned recovery builder."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True
SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'prepare_recovery_site.py'
spec = importlib.util.spec_from_file_location('prepare_recovery_site', SCRIPT)
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


class RecoverySiteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        self.contents = {
            '.gitignore': b'private-build/\n',
            '.githooks/pre-commit': b'#!/bin/sh\nexit 0\n',
            '.nojekyll': b'',
            'assets/app.mjs': b'export const recovery = "source-only";\n',
            'index.html': b'<script type="module" src="assets/app.mjs"></script>\n',
            'runtime/source.tar.gz': b'not a game or actual archive\n',
        }
        for name, data in self.contents.items():
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        rows = [
            {'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
             'gitBlob': hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()}
            for name, data in sorted(self.contents.items())
        ]
        visible = [row for row in rows if not tool.hidden(row['path'])]
        self.contract = {
            'schema': 'srwf.previous-public-source.v1',
            'sourceCommit': tool.SOURCE_COMMIT,
            'identityClaim': tool.IDENTITY,
            'sourceFileCount': len(rows), 'sourceBytes': sum(r['bytes'] for r in rows),
            'payloadFileCount': len(visible), 'payloadBytes': sum(r['bytes'] for r in visible),
            'uploadHiddenFilter': '.[^/]* in any path component',
            'excludedPaths': [r['path'] for r in rows if tool.hidden(r['path'])],
            'files': rows,
        }

    def tearDown(self):
        self.temp.cleanup()

    def build(self, output=None):
        return tool.prepare(self.source, output or self.root/'payload', self.contract, '0'*64, 'copy')

    def test_exact_source_to_filtered_payload_and_deterministic_lock(self):
        output = self.root/'payload'
        lock = self.build(output)
        expected = [name for name in sorted(self.contents) if not tool.hidden(name)]
        self.assertEqual([r['path'] for r in lock['files']], expected)
        self.assertEqual(sorted(p.relative_to(output).as_posix() for p in output.rglob('*') if p.is_file()), expected)
        for name in expected:
            self.assertEqual((output/name).read_bytes(), self.contents[name])
            self.assertNotEqual((output/name).stat().st_ino, (self.source/name).stat().st_ino)
        self.assertEqual(tool.canonical(lock), tool.canonical(tool.payload_lock(self.contract, '0'*64)))
        self.assertTrue(all(set(row)=={'path', 'bytes', 'sha256'} for row in lock['files']))
        self.assertEqual(lock['identityClaim'], 'previous-source-recovery-not-legacy-pages-artifact-proof')
        tool.verify_payload(output, lock)

    def test_extra_files_hidden_files_and_directories_refused_before_copy(self):
        for name in ['unapproved.wasm', '.unapproved', 'private/notes.txt']:
            with self.subTest(name=name):
                path=self.source/name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text('private')
                output=self.root/'payload'
                with self.assertRaises(tool.RecoveryError): self.build(output)
                self.assertFalse(output.exists())
                path.unlink()
                if path.parent != self.source: path.parent.rmdir()

    def test_missing_or_modified_pinned_file_refused(self):
        path=self.source/'assets/app.mjs'; data=path.read_bytes()
        path.write_bytes(data.replace(b'source-only', b'source-evil'))
        with self.assertRaisesRegex(tool.RecoveryError, 'Pinned bytes differ'): self.build()
        path.unlink()
        with self.assertRaises(tool.RecoveryError): self.build()

    def test_source_symlink_file_directory_and_root_refused(self):
        real=self.root/'actual.mjs'; real.write_bytes(self.contents['assets/app.mjs'])
        target=self.source/'assets/app.mjs'; target.unlink(); target.symlink_to(real)
        with self.assertRaises(tool.RecoveryError): self.build()
        target.unlink(); target.write_bytes(self.contents['assets/app.mjs'])
        old=self.source/'assets'; moved=self.root/'assets'; old.rename(moved); old.symlink_to(moved, target_is_directory=True)
        with self.assertRaises(tool.RecoveryError): self.build()
        old.unlink(); moved.rename(old)
        linked=self.root/'linked-source'; linked.symlink_to(self.source, target_is_directory=True)
        with self.assertRaises(tool.RecoveryError): tool.prepare(linked, self.root/'payload', self.contract, '0'*64, 'copy')

    def test_payload_extra_hidden_tamper_and_hardlink_refused(self):
        output=self.root/'payload'; lock=self.build(output)
        extra=output/'.nojekyll'; extra.write_text('')
        with self.assertRaises(tool.RecoveryError): tool.verify_payload(output, lock)
        extra.unlink()
        target=output/'index.html'; target.write_text('changed')
        with self.assertRaises(tool.RecoveryError): tool.verify_payload(output, lock)
        target.unlink(); os.link(self.source/'index.html', target)
        with self.assertRaisesRegex(tool.RecoveryError, 'hardlink'): tool.verify_payload(output, lock)
        target.unlink(); target.symlink_to(self.source/'index.html')
        with self.assertRaisesRegex(tool.RecoveryError, 'Symlink'): tool.verify_payload(output, lock)

    def test_source_hardlink_is_copied_to_an_independent_output(self):
        target=self.source/'index.html'; target.unlink(); other=self.root/'source-alias'; other.write_bytes(self.contents['index.html']); os.link(other, target)
        output=self.root/'payload'; self.build(output)
        self.assertEqual((output/'index.html').stat().st_nlink, 1)
        self.assertNotEqual((output/'index.html').stat().st_ino, other.stat().st_ino)
        other.write_text('external change')
        self.assertEqual((output/'index.html').read_bytes(), self.contents['index.html'])

    def test_existing_output_or_containment_never_changes_existing_data(self):
        output=self.root/'existing'; output.mkdir(); sentinel=output/'keep'; sentinel.write_text('unrelated')
        with self.assertRaises(tool.RecoveryError): self.build(output)
        self.assertEqual(sentinel.read_text(), 'unrelated')
        with self.assertRaises(tool.RecoveryError): self.build(self.source/'nested-payload')
        self.assertFalse((self.source/'nested-payload').exists())
        with self.assertRaises(tool.RecoveryError): self.build(self.root)
        self.assertEqual((self.source/'index.html').read_bytes(), self.contents['index.html'])
        linked=self.root/'linked-output'; linked.symlink_to(output, target_is_directory=True)
        with self.assertRaises(tool.RecoveryError): self.build(linked)
        self.assertEqual(sentinel.read_text(), 'unrelated')

    def test_source_change_during_copy_is_not_approved(self):
        original=tool.copy_file
        def mutate(source, target, mode):
            original(source, target, mode)
            if source.name=='index.html': source.write_bytes(source.read_bytes()+b'changed-after-copy')
        with mock.patch.object(tool, 'copy_file', side_effect=mutate):
            with self.assertRaisesRegex(tool.RecoveryError, 'Pinned bytes differ'): self.build()

    def test_source_checkout_git_metadata_allowed_but_never_copied(self):
        git=self.source/'.git'; git.mkdir(); (git/'config').write_text('local checkout metadata')
        output=self.root/'payload'; self.build(output)
        self.assertFalse((output/'.git').exists())

    def test_contract_rejects_path_escape_wrong_pin_filter_duplicates_and_budget(self):
        for name in ['/outside', '../escape', 'a/../escape', 'a//b', 'a\\b', 'a%2fb', 'a b', './name']:
            with self.subTest(path=name):
                with self.assertRaises(tool.RecoveryError): tool.path_name(name)
        for mutate in [
            lambda c:c.update(sourceCommit='0'*40),
            lambda c:c.update(identityClaim='identical-to-legacy-pages'),
            lambda c:c.update(excludedPaths=[]),
            lambda c:c.update(uploadHiddenFilter='none'),
            lambda c:c['files'].append(dict(c['files'][0])),
            lambda c:c.update(payloadBytes=tool.MAX_BYTES+1),
        ]:
            contract=copy.deepcopy(self.contract); mutate(contract)
            with self.assertRaises(tool.RecoveryError): tool.validate_contract(contract)

    def test_fixed_public_contract_fingerprint_and_488_to_484_counts(self):
        config=SCRIPT.with_name('previous-public-source.json')
        self.assertEqual(hashlib.sha256(config.read_bytes()).hexdigest(), tool.CONFIG_SHA256)
        contract=tool.load_contract()
        self.assertEqual((contract['sourceFileCount'],contract['payloadFileCount']), (488,484))
        self.assertEqual(contract['excludedPaths'], ['.gitattributes','.githooks/pre-commit','.gitignore','.nojekyll'])
        self.assertEqual(contract['payloadBytes'], 946595034)
        self.assertEqual(contract['sourceCommit'], '267c26b91f051577b0bf90a13182fd770de6c249')

    def test_cli_has_no_arbitrary_ref_or_config_override(self):
        for option in ['--ref','--config']:
            result=subprocess.run([sys.executable,str(SCRIPT),'--source',str(self.source),'--lock-output',str(self.root/'lock.json'),option,'unreviewed'],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('unrecognized arguments',result.stderr)
            self.assertFalse((self.root/'lock.json').exists())

    def test_cli_never_overwrites_existing_lock(self):
        lock=self.root/'existing-lock.json'; lock.write_text('keep unrelated evidence')
        result=subprocess.run([sys.executable,str(SCRIPT),'--source',str(self.source),'--verify-only','--lock-output',str(lock)],capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('Lock output already exists',result.stderr)
        self.assertEqual(lock.read_text(),'keep unrelated evidence')


if __name__=='__main__':unittest.main()
