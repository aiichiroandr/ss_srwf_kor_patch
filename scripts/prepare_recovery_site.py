#!/usr/bin/env python3
"""Prepare only the pinned 2026-10-21 source-based recovery payload, offline."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys

SOURCE_COMMIT = '267c26b91f051577b0bf90a13182fd770de6c249'
CONFIG_SHA256 = '2622310a6d0f5978b38d0bc0f83cac42d361b217e88b1a8f160776e6fb53f3ec'
IDENTITY = 'previous-source-recovery-not-legacy-pages-artifact-proof'
MAX_BYTES = 1_000_000_000
class RecoveryError(ValueError):
    pass

def require(value, message):
    if not value: raise RecoveryError(message)

def sha(data): return hashlib.sha256(data).hexdigest()
def canonical(value): return (json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n').encode('utf-8')
def hash_file(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()
def path_name(name):
    require(isinstance(name,str) and name and len(name)<=240 and not re.search(r'[\x00-\x20\x7f\\%]',name),'Unsafe recovery path')
    p=PurePosixPath(name)
    require(p.parts and not p.is_absolute() and p.as_posix()==name and '..' not in p.parts,'Unsafe recovery path')
    return name

def hidden(name): return any(part.startswith('.')for part in PurePosixPath(name).parts)
def file_row(row): return {k:row[k]for k in ['path','bytes','sha256']}

def validate_contract(contract):
    require(contract.get('schema')=='srwf.previous-public-source.v1' and contract.get('sourceCommit')==SOURCE_COMMIT,'Only the pinned previous source is supported')
    require(contract.get('identityClaim')==IDENTITY,'Recovery provenance statement changed')
    rows=contract.get('files',[]);names=[path_name(r['path'])for r in rows]
    require(names and names==sorted(set(names)) and len(set(n.casefold()for n in names))==len(names),'Invalid source inventory')
    for row in rows:
        require(type(row.get('bytes'))is int and row['bytes']>=0 and re.fullmatch('[a-f0-9]{64}',row.get('sha256',''))
                and re.fullmatch('[a-f0-9]{40}',row.get('gitBlob','')),'Invalid source pin')
    excluded=[r['path']for r in rows if hidden(r['path'])]
    require(excluded==contract.get('excludedPaths') and contract.get('uploadHiddenFilter')=='.[^/]* in any path component','Official hidden filter differs from reviewed inventory')
    payload=[r for r in rows if not hidden(r['path'])]
    require(len(rows)==contract.get('sourceFileCount') and sum(r['bytes']for r in rows)==contract.get('sourceBytes'),'Source totals mismatch')
    require(len(payload)==contract.get('payloadFileCount') and sum(r['bytes']for r in payload)==contract.get('payloadBytes')
            and 0<=contract['payloadBytes']<=MAX_BYTES,'Payload totals/size mismatch')
    return contract

def load_contract():
    # No arbitrary ref/config input. Changing this one recovery source requires
    # manual review of both the public pins and this script's config fingerprint.
    data=Path(__file__).with_name('previous-public-source.json').read_bytes()
    require(sha(data)==CONFIG_SHA256,'Pinned previous-source configuration changed')
    contract=validate_contract(json.loads(data))
    require(contract['sourceFileCount']==488 and contract['payloadFileCount']==484,'Pinned recovery counts changed')
    return contract

def regular(root,name,artifact=False):
    p=root
    for part in PurePosixPath(path_name(name)).parts:
        p=p/part;require(not p.is_symlink(),f'Symlink refused: {name}')
    require(p.is_file(),f'Missing source/payload file: {name}')
    if artifact:require(p.stat().st_nlink==1,f'Payload hardlink refused: {name}')
    return p

def inventory(root,expected,allow_git=False):
    root=Path(root);require(root.is_dir()and not root.is_symlink(),'Source/payload root must be a regular directory')
    names=[];parents={str(p)for name in expected for p in PurePosixPath(name).parents if str(p)!='.'}
    for parent,dirs,files in os.walk(root,followlinks=False):
        parent=Path(parent)
        if parent==root and allow_git:
            # actions/checkout administrative metadata is never source content
            # and is never copied. New hidden/untracked files remain forbidden.
            if '.git'in dirs:dirs.remove('.git')
            if '.git'in files:files.remove('.git')
        for name in dirs:
            d=parent/name;require(not d.is_symlink(),'Source/payload symlink directory refused')
            require(d.relative_to(root).as_posix()in parents,'Unexpected source/payload directory')
        for name in files:names.append((parent/name).relative_to(root).as_posix())
    require(sorted(names)==list(expected),'Source/payload has extra or missing files')

def verify_rows(root,rows,artifact=False):
    for row in rows:
        p=regular(root,row['path'],artifact);before=p.stat()
        require(before.st_size==row['bytes']and hash_file(p)==row['sha256'],f'Pinned bytes differ: {row["path"]}')
        after=p.stat();require((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)==
                             (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns),'File changed during verification')

def verify_source(root,contract):
    validate_contract(contract);root=Path(root)
    inventory(root,[r['path']for r in contract['files']],allow_git=True)
    verify_rows(root,contract['files'])

def payload_lock(contract,config_hash):
    validate_contract(contract)
    return {'schema':'srwf.previous-public-payload-lock.v1','sourceCommit':SOURCE_COMMIT,'identityClaim':IDENTITY,
            'configSha256':config_hash,'officialHiddenFilter':contract['uploadHiddenFilter'],
            'excludedPaths':contract['excludedPaths'],'files':[file_row(r)for r in contract['files']if not hidden(r['path'])],
            'bytes':contract['payloadBytes']}

def verify_payload(output,lock):
    require(lock.get('schema')=='srwf.previous-public-payload-lock.v1' and lock.get('sourceCommit')==SOURCE_COMMIT and lock.get('identityClaim')==IDENTITY,'Wrong recovery lock')
    rows=lock.get('files',[]);names=[path_name(r['path'])for r in rows]
    require(names==sorted(set(names))and not any(hidden(n)for n in names),'Payload lock contains hidden/unordered paths')
    require(sum(r['bytes']for r in rows)==lock.get('bytes') and lock['bytes']<=MAX_BYTES,'Payload byte cap differs')
    inventory(output,names);verify_rows(Path(output),rows,artifact=True)

def copy_file(source,target,mode):
    require(not target.exists()and not target.is_symlink(),'Destination file already exists')
    if mode in {'auto','clone'}and sys.platform=='darwin':
        result=subprocess.run(['/bin/cp','-c','-n',str(source),str(target)],capture_output=True)
        if result.returncode==0:return
        require(mode!='clone'and not target.exists(),'Clone failed; choose a new output directory')
    else:require(mode!='clone','APFS clone requires macOS')
    with source.open('rb')as incoming,target.open('xb')as outgoing:shutil.copyfileobj(incoming,outgoing,1024*1024)
    shutil.copystat(source,target)

def prepare(source,output,contract,config_hash,mode='auto'):
    require(mode in {'auto','clone','copy'},'Unsupported copy method')
    source=Path(source);output=Path(output)
    require(not output.exists()and not output.is_symlink(),'Recovery output must be a new dedicated directory')
    src=source.resolve();dst=output.resolve()
    require(not dst.is_relative_to(src)and not src.is_relative_to(dst),'Recovery source and output cannot contain each other')
    verify_source(source,contract);lock=payload_lock(contract,config_hash)
    output.mkdir(parents=True,exist_ok=False)
    for row in lock['files']:
        target=output/row['path'];target.parent.mkdir(parents=True,exist_ok=True)
        parent=target.parent
        while parent!=output:
            require(not parent.is_symlink(),'Destination directory became a symlink');parent=parent.parent
        copy_file(regular(source,row['path']),target,mode)
    verify_payload(output,lock);verify_source(source,contract)
    return lock

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--out',type=Path)
    parser.add_argument('--lock-output',type=Path,required=True)
    parser.add_argument('--verify-only',action='store_true')
    parser.add_argument('--copy',choices=['auto','clone','copy'],default='auto',dest='copy_mode')
    args=parser.parse_args()
    try:
        contract=load_contract()
        require(not args.lock_output.exists()and not args.lock_output.is_symlink(),'Lock output already exists; nothing will be overwritten')
        lock_path=args.lock_output.resolve();source=args.source.resolve()
        require(not lock_path.is_relative_to(source),'Lock must remain outside the frozen source')
        if args.verify_only:
            require(args.out is None,'--verify-only does not create an output directory')
            verify_source(args.source,contract);lock=payload_lock(contract,CONFIG_SHA256);status='previous-source-verified'
        else:
            require(args.out is not None,'--out is required unless --verify-only')
            require(not lock_path.is_relative_to(args.out.resolve()),'Lock must remain outside the upload payload')
            lock=prepare(args.source,args.out,contract,CONFIG_SHA256,args.copy_mode);status='previous-source-payload-prepared'
        data=canonical(lock)
        with args.lock_output.open('xb')as stream:stream.write(data)
        print(json.dumps({'status':status,'sourceCommit':SOURCE_COMMIT,'sourceFiles':488,'payloadFiles':484,'payloadBytes':lock['bytes'],
                          'payloadLockSha256':sha(data),'identityClaim':IDENTITY}));return 0
    except (OSError,ValueError,KeyError,TypeError)as error:
        print(f'RECOVERY_SOURCE_REFUSED: {error}',file=sys.stderr);return 1
if __name__=='__main__':sys.exit(main())
