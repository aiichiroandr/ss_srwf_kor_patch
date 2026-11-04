#!/usr/bin/env python3
"""Offline, exact-allowlist static-site packaging. Never changes/deletes source."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import re
import shutil
import stat
import subprocess
import sys
from urllib.parse import unquote, urlsplit

MAX_BYTES = 1_000_000_000
class PackageError(ValueError):
    pass

def require(ok, message):
    if not ok:
        raise PackageError(message)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()

def file_hash(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(part)
    return h.hexdigest()

def relative(path):
    require(isinstance(path, str) and path and len(path)<=240 and not re.search(r'[\x00-\x20\x7f]',path) and '\\' not in path and '%' not in path, f'Unsafe path: {path!r}')
    p = PurePosixPath(path)
    require(bool(p.parts) and not p.is_absolute() and p.as_posix() == path and '..' not in p.parts and '.' not in p.parts,
            f'Unsafe path: {path!r}')
    return path

def safe_file(root, name, artifact=False):
    path = root
    for part in PurePosixPath(relative(name)).parts:
        path = path / part
        require(not path.is_symlink(), f'Symlink forbidden: {name}')
    require(path.is_file(), f'Missing regular file: {name}')
    info = path.stat()
    require(stat.S_ISREG(info.st_mode), f'Not a regular file: {name}')
    if artifact:
        require(info.st_nlink == 1, f'Artifact hardlink forbidden: {name}')
    return path

def allowed_name(name, policy):
    relative(name)
    parts = PurePosixPath(name).parts
    require(not any(x.startswith('.') for x in parts), f'Hidden/private file forbidden: {name}')
    require(parts[0] not in {'tests', 'scripts', 'build', 'node_modules', 'receipts-private'}, f'Private directory forbidden: {name}')
    require(parts[-1] != 'AGENTS.md', f'Private instructions forbidden: {name}')
    require(parts[0] in {'assets', 'docs', 'manifest', 'patches', 'receipts', 'releases', 'schemas', 'web-port', 'weapon-preview'}
            or name in {'index.html', 'isolation-sw.js', 'NOTICE.md'}, f'Public root not approved: {name}')
    if parts[0] == 'docs':
        require(name in policy['publicDocs'], f'Unapproved documentation: {name}')
    require(not re.search(r'\.(bin|cue|iso|sfc|smc|bcr|bkr|srm|sav|state|ss[0-9])$', name, re.I), f'ROM/save forbidden: {name}')
    if name.endswith(('.wasm', '.tar.gz')):
        require(name in policy['pins'], f'Unapproved executable/source artifact: {name}')
    require(not name.endswith(('.zip', '.7z', '.rar', '.dmg', '.exe', '.py', '.sh', '.command')), f'Unapproved file type: {name}')

def load_policy(path):
    policy = json.loads(Path(path).read_text(encoding='utf-8'))
    require(policy.get('schema') == 'srwf.static-site-policy.v1', 'Unsupported policy')
    require(type(policy.get('limitBytes')) is int and 0 < policy['limitBytes'] <= MAX_BYTES, 'Invalid publication size limit')
    files = policy.get('files')
    require(isinstance(files, list) and files and files == sorted(set(files)), 'Allowlist must be sorted and unique')
    require(len({x.casefold() for x in files}) == len(files), 'Case-colliding allowlist')
    require(isinstance(policy.get('pins'), dict) and isinstance(policy.get('publicDocs'), list), 'Missing policy pins/docs')
    for name in files:
        allowed_name(name, policy)
    for name, pin in policy['pins'].items():
        require(name in files and type(pin.get('bytes')) is int and pin['bytes'] >= 0
                and re.fullmatch('[a-f0-9]{64}', pin.get('sha256', '')), f'Invalid immutable pin: {name}')
    sets = policy.get('runtimeSets', [])
    require(len(sets) == 6 and len({(x['surface'], x['version']) for x in sets}) == 6, 'Exactly six retained runtime sets are required')
    for item in sets:
        require(item['surface'] in {'web-port', 'weapon-preview'} and re.fullmatch('[a-f0-9]{20}', item['version']), 'Invalid runtime identity')
        prefix = f"{item['surface']}/runtime/"
        for name in [prefix+item['version']+'/saturn.js', prefix+item['version']+'/saturn.wasm', prefix+'source-'+item['version']+'.tar.gz']:
            require(name in files and name in policy['pins'], f'Runtime/source is not pinned: {name}')
    require(sum(x['surface']=='web-port' for x in sets)==4 and sum(x['surface']=='weapon-preview' for x in sets)==2, 'Runtime surface retention mismatch')
    require(set(policy.get('runtimeManifests', {})) == {'web-port/runtime/current.json','web-port/runtime/current-mobile.json','web-port/runtime/current-mobile-v14.json','weapon-preview/runtime/current.json','weapon-preview/runtime/f-current.json'}, 'Runtime manifest routes are incomplete')
    for surface in ['web-port','weapon-preview']:
        for notice in ['BUILD.md','COPYING','THIRD_PARTY.md']:
            require(f'{surface}/runtime/{notice}' in policy.get('runtimeNotices', []), 'Required runtime notices are omitted')
    for name in policy.get('runtimeNotices', []):
        require(name in files and name in policy['pins'], f'Runtime license/notice is missing: {name}')
    require(len(policy.get('releaseIds', [])) == 12 and len(set(policy['releaseIds'])) == 12, 'Exactly twelve approved releases are required')
    return policy

def snapshot(root, policy, artifact=False):
    rows = []
    for name in policy['files']:
        path = safe_file(root, name, artifact)
        before = path.stat()
        row = {'path': name, 'bytes': before.st_size, 'sha256': file_hash(path)}
        after = path.stat()
        require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
                (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns), f'Source changed while hashing: {name}')
        pin = policy['pins'].get(name)
        require(pin is None or row['bytes'] == pin['bytes'] and row['sha256'] == pin['sha256'], f'Immutable artifact changed: {name}')
        rows.append(row)
    total = sum(x['bytes'] for x in rows)
    require(total <= policy['limitBytes'] and total <= MAX_BYTES, f'Site exceeds byte limit: {total}')
    return rows

def read_json(root, name, names):
    require(name in names, f'Manifest is outside allowlist: {name}')
    return json.loads(safe_file(root, name).read_text(encoding='utf-8'))

def check_dynamic(root, policy):
    names = set(policy['files'])
    index = read_json(root, 'manifest/releases.json', names)
    releases = index.get('releases', [])
    require(len(releases) == 12 and {r['id'] for r in releases} == set(policy['releaseIds']), 'Indexed release preservation failed')
    for row in releases:
        require(row.get('state') == 'ACCEPTED', 'Unaccepted indexed release')
        name = relative(row['manifest'])
        require(name == f"releases/{row['id']}.json", 'Unexpected release manifest route')
        target = read_json(root, name, names)
        require(file_hash(safe_file(root, name)) == row['manifestSha256'], f'Release manifest hash mismatch: {name}')
        require(target.get('id') == row['id'] and target.get('state') == 'ACCEPTED', 'Release identity/state mismatch')
        patch = target['patch']; patch_name = relative(patch['url'])
        require(patch_name == f"patches/{row['id']}.srwfp" and patch_name in names, 'Patch closure mismatch')
        p = safe_file(root, patch_name)
        require(p.stat().st_size == patch['size'] and file_hash(p) == patch['sha256'], f'Patch bytes changed: {patch_name}')
        receipt_name = f"receipts/{row['id']}.acceptance.json"
        receipt = read_json(root, receipt_name, names)
        provenance = target.get('provenance', {})
        require(file_hash(safe_file(root, receipt_name)) == provenance.get('acceptanceReceiptSha256'), f'Acceptance receipt hash mismatch: {receipt_name}')
        require(receipt.get('releaseId', receipt.get('id')) == row['id'], f'Acceptance identity mismatch: {receipt_name}')
    retained = {(x['surface'], x['version']) for x in policy['runtimeSets']}
    for name, version in policy['runtimeManifests'].items():
        manifest = read_json(root, name, names)
        surface = name.split('/')[0]
        require(manifest.get('version') == version and (surface, version) in retained, f'Unsupported runtime manifest: {name}')
        require(sorted(manifest.get('files', [])) == ['saturn.js', 'saturn.wasm'], f'Unexpected runtime members: {name}')
        for member, claimed in manifest.get('artifacts', {}).items():
            require(member in names and member in policy['pins'], f'Dynamic runtime artifact escapes allowlist: {member}')
            pin=policy['pins'][member]
            require(claimed.get('size')==pin['bytes'] and claimed.get('sha256')==pin['sha256'], f'Dynamic runtime pin mismatch: {member}')

class HtmlRefs(HTMLParser):
    def __init__(self):
        super().__init__(); self.refs = []
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in {'src', 'href', 'poster'} and value:
                self.refs.append((value, False))
            if key == 'srcset' and value:
                self.refs.extend((part.strip().split()[0], False) for part in value.split(',') if part.strip())

# A deliberately bounded lexer: strip comments without eating quoted URLs.
JS_COMMENTS = re.compile(r'''("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(/\*[\s\S]*?\*/|//[^\n]*)''')
def literal_refs(name, text, policy):
    refs = []
    if name.endswith(('.html', '.svg')):
        parser = HtmlRefs(); parser.feed(text); refs += parser.refs
    if name.endswith(('.css', '.html', '.svg')):
        refs += [(m[1], False) for m in re.findall(r'''url\(\s*(["']?)(.*?)\1\s*\)''', text)]
    if name.endswith(('.js', '.mjs')):
        code = JS_COMMENTS.sub(lambda m: m.group(1) or '', text)
        refs += [(m[1], False) for m in re.findall(r'''(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)(["'])([^"'\n]+)\1''', code)]
        refs += [(m[1], True) for m in re.findall(r'''new\s+URL\(\s*(["'])([^"'\n]+)\1\s*,\s*import\.meta\.url''', code)]
        for args in re.findall(r'\bimportScripts\(([^)]*)\)', code):
            for arg in args.split(','):
                literal = re.fullmatch(r'''\s*(["'])([^"'\n]+)\1\s*''', arg)
                if literal:
                    refs.append((literal.group(2), False))
                else:
                    require(name in policy.get('runtimeWorkers', {}) and re.fullmatch(r'''\s*buildDir\s*\+\s*(["'])saturn\.js\1\s*''', arg), f'Unresolved dynamic script: {name}: {arg}')
        refs += [(m[1], False) for m in re.findall(r'''(?:fetch|Worker|SharedWorker|addModule)\(\s*(["'])([^"'\n]+)\1''', code)]
        # Source URLs stored in editor records resolve from SITE_ROOT, not the
        # module folder. Preserve the public fact-document routes too.
        refs += [('/'+m[1], 'site-doc') for m in re.findall(r'''(["'])(docs/[^"'\n]+)\1''', code)]
    if name.endswith('.md'):
        refs += [(m, False) for m in re.findall(r'\]\(([^)\s]+)(?:\s+[^)]*)?\)', text)]
    if name.startswith('schemas/') and name.endswith('.json'):
        def walk(v):
            if isinstance(v, dict):
                if isinstance(v.get('$ref'), str): refs.append((v['$ref'], False))
                for item in v.values(): walk(item)
            elif isinstance(v, list):
                for item in v: walk(item)
        walk(json.loads(text))
    return refs

def check_references(root, policy):
    names = set(policy['files']); count = 0
    for name in policy['files']:
        if not name.endswith(('.html', '.mjs', '.js', '.css', '.md', '.svg', '.json')):
            continue
        # Emscripten generated code uses runtime-relative names, checked by the
        # pinned manifest/source contract; it is not a general frontend module.
        if re.search(r'/runtime/[a-f0-9]{20}/saturn\.js$', name):
            continue
        for ref, base in literal_refs(name, safe_file(root, name).read_text(encoding='utf-8'), policy):
            require('\\' not in ref, f'Backslash URL: {name}: {ref}')
            parsed = urlsplit(ref)
            if parsed.scheme or parsed.netloc:
                require(parsed.scheme in {'http', 'https', 'data', 'blob', 'mailto'} or bool(parsed.netloc), f'Unsafe URL scheme: {name}: {ref}')
                continue
            if not parsed.path:
                continue
            # Leading slash here is emitted only by the typed docs-record rule;
            # real HTML/import root-absolute paths are forbidden for Pages prefix.
            typed_doc = base == 'site-doc'
            require(not parsed.path.startswith('/') or typed_doc, f'Host-root URL is not project-prefix-safe: {name}: {ref}')
            path = unquote(parsed.path)
            target = posixpath.normpath(path.lstrip('/') if typed_doc else posixpath.join(posixpath.dirname(name), path))
            require(target != '..' and not target.startswith('../'), f'URL escapes site: {name}: {ref}')
            if base is True and (path.endswith('/') or target == '.'):
                prefix = '' if target == '.' else target.rstrip('/')+'/'
                require(any(x.startswith(prefix) for x in names), f'URL base outside site: {name}: {ref}')
                continue
            if path.endswith('/') or target == '.':
                target = ('index.html' if target == '.' else target.rstrip('/')+'/index.html')
            require(target in names, f'Missing local reference: {name}: {ref} -> {target}')
            count += 1
    return count

def policy_digest(policy):
    return digest(canonical(policy))

def create_lock(root, policy):
    root = Path(root).resolve()
    rows = snapshot(root, policy)
    check_dynamic(root, policy); refs = check_references(root, policy)
    require(snapshot(root, policy) == rows, 'Source changed while resolving publication closure')
    return {'schema': 'srwf.static-site-lock.v1', 'policySha256': policy_digest(policy), 'files': rows,
            'bytes': sum(x['bytes'] for x in rows), 'literalReferences': refs}

def validate_lock(lock, policy):
    require(lock.get('schema') == 'srwf.static-site-lock.v1' and lock.get('policySha256') == policy_digest(policy), 'Lock/policy mismatch')
    require([x.get('path') for x in lock.get('files', [])] == policy['files'], 'Lock inventory differs from exact allowlist')
    for row in lock['files']:
        require(type(row.get('bytes')) is int and row['bytes'] >= 0 and re.fullmatch('[a-f0-9]{64}', row.get('sha256', '')), 'Malformed lock row')
    total = sum(x['bytes'] for x in lock['files'])
    require(total == lock.get('bytes') and total <= policy['limitBytes'] and total <= MAX_BYTES, 'Lock byte limit mismatch')

def verify_site(site, policy, lock):
    validate_lock(lock, policy)
    site = Path(site)
    require(site.is_dir() and not site.is_symlink(), 'Artifact directory is missing or symlinked')
    actual = []
    expected_dirs={str(p) for name in policy['files'] for p in PurePosixPath(name).parents if str(p)!='.'}
    for parent, dirs, files in os.walk(site, followlinks=False):
        for name in dirs:
            require(not (Path(parent)/name).is_symlink(), 'Symlink directory in artifact')
            require((Path(parent)/name).relative_to(site).as_posix() in expected_dirs, 'Extra directory in artifact')
        for name in files:
            actual.append((Path(parent)/name).relative_to(site).as_posix())
    require(sorted(actual) == policy['files'], 'Artifact contains extra or missing files')
    rows = snapshot(site, policy, artifact=True)
    require(rows == lock['files'], 'Artifact content differs from frozen source lock')
    check_dynamic(site, policy); refs = check_references(site, policy)
    require(snapshot(site, policy, artifact=True) == rows, 'Artifact changed while resolving closure')
    return {'status': 'verified', 'files': len(rows), 'bytes': sum(x['bytes'] for x in rows), 'literalReferences': refs}

def build_site(root, output, policy, lock, copy_mode='auto'):
    require(copy_mode in {'auto', 'clone', 'copy'}, 'Unsupported copy mode')
    validate_lock(lock, policy)
    root = Path(root).resolve(); output = Path(output)
    require(not output.exists() and not output.is_symlink(), 'Output must be a new dedicated directory; nothing is overwritten/deleted')
    resolved = output.resolve()
    require(resolved != root, 'Output cannot be source root')
    if resolved.is_relative_to(root):
        require(resolved.is_relative_to(root/'build') and resolved != root/'build', 'In-repository output must be below ignored build/')
    require(snapshot(root, policy) == lock['files'], 'Source changed since lock; no artifact created')
    check_dynamic(root, policy); check_references(root, policy)
    output.mkdir(parents=True, exist_ok=False)
    for row in lock['files']:
        source = safe_file(root, row['path']); target = output/row['path']; target.parent.mkdir(parents=True, exist_ok=True)
        require(not target.exists() and not target.is_symlink(), 'A destination file already exists')
        parent=target.parent
        while parent != output:
            require(not parent.is_symlink(), 'Destination symlink directory forbidden');parent=parent.parent
        if copy_mode in {'auto', 'clone'} and sys.platform == 'darwin':
            result = subprocess.run(['/bin/cp', '-c', '-n', str(source), str(target)], capture_output=True)
            if result.returncode and copy_mode == 'clone':
                raise PackageError(f'APFS clone failed: {row["path"]}')
            if result.returncode:
                require(not target.exists(), 'Failed clone left a partial file; use a new output directory')
                with source.open('rb') as incoming, target.open('xb') as outgoing:
                    shutil.copyfileobj(incoming, outgoing, 1024*1024)
                shutil.copystat(source,target)
        else:
            require(copy_mode != 'clone', 'APFS clone requested on a non-macOS host')
            with source.open('rb') as incoming, target.open('xb') as outgoing:
                shutil.copyfileobj(incoming, outgoing, 1024*1024)
            shutil.copystat(source,target)
        require(target.stat().st_nlink == 1 and file_hash(target) == row['sha256'], f'Copy changed or aliased: {row["path"]}')
    require(snapshot(root, policy) == lock['files'], 'Source changed during copy; artifact is not approved')
    return verify_site(output, policy, lock)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['lock', 'build', 'verify'])
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--policy', type=Path)
    parser.add_argument('--lock', type=Path, required=True, help='New output for lock; existing frozen input for build/verify')
    parser.add_argument('--out', type=Path, help='New dedicated artifact directory for build; existing directory for verify')
    parser.add_argument('--copy', choices=['auto', 'clone', 'copy'], default='auto', dest='copy_mode')
    args = parser.parse_args()
    try:
        policy = load_policy(args.policy or args.root/'scripts/site-policy.json')
        if args.command == 'lock':
            lock = create_lock(args.root, policy)
            with args.lock.open('x', encoding='utf-8') as stream: json.dump(lock, stream, ensure_ascii=False, indent=2); stream.write('\n')
            result = {'status': 'locked', 'files': len(lock['files']), 'bytes': lock['bytes'], 'policySha256': lock['policySha256']}
        else:
            require(args.out is not None, '--out is required')
            lock = json.loads(args.lock.read_text(encoding='utf-8'))
            result = build_site(args.root, args.out, policy, lock, args.copy_mode) if args.command == 'build' else verify_site(args.out, policy, lock)
        print(json.dumps(result, ensure_ascii=False)); return 0
    except (PackageError, OSError, ValueError, KeyError, TypeError) as error:
        print(f'SITE_PACKAGE_REFUSED: {error}', file=sys.stderr); return 1
if __name__ == '__main__':
    sys.exit(main())
