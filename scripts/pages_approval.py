#!/usr/bin/env python3
"""Check explicit reviewed commit/lock inputs before publishing; never deploys."""
import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess

def accepted_commit(expected, checkout, event):
    if not re.fullmatch(r'[a-f0-9]{40}', expected or '') or expected != checkout or expected != event:
        raise ValueError('Reviewed source commit differs from checkout/event')

def accepted_lock(expected, path):
    if not re.fullmatch(r'[a-f0-9]{64}', expected or ''):
        raise ValueError('A complete reviewed lock SHA-256 is required')
    actual = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError('Generated lock differs from the reviewed lock')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kind', choices=['source', 'lock'])
    parser.add_argument('--file', type=Path)
    args = parser.parse_args()
    try:
        if args.kind == 'source':
            checkout = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
            accepted_commit(os.environ.get('EXPECTED_SOURCE_COMMIT'), checkout, os.environ.get('GITHUB_SHA'))
        else:
            if args.file is None: raise ValueError('--file is required')
            accepted_lock(os.environ.get('EXPECTED_LOCK_SHA256'), args.file)
        print('Reviewed publication input matches'); return 0
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print('PAGES_APPROVAL_REFUSED: ' + str(error)); return 1

if __name__ == '__main__': raise SystemExit(main())
