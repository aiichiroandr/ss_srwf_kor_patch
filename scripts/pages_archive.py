#!/usr/bin/env python3
"""Build or check the exact regular-file payload of a Pages upload tar, offline."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import tarfile

LIMIT = 1_000_000_000
class ArchiveError(ValueError): pass

def require(ok, message):
    if not ok: raise ArchiveError(message)

def name_of(raw):
    require(isinstance(raw,str) and raw and '\\' not in raw and all(ord(c)>=32 for c in raw), 'Unsafe member name')
    name=raw[2:] if raw.startswith('./') else raw
    p=PurePosixPath(name)
    require(name and not p.is_absolute() and p.as_posix()==name and all(x not in ('.','..') for x in p.parts), 'Noncanonical member name')
    require(all(not x.startswith('.') for x in p.parts), 'Hidden member is outside the publication payload')
    return name

def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
    return h.hexdigest()

def load_lock(path):
    raw=Path(path).read_bytes();lock=json.loads(raw)
    require(lock.get('schema') in ('srwf.static-site-lock.v1','srwf.previous-public-payload-lock.v1'), 'Unsupported payload lock')
    rows=lock.get('files');require(isinstance(rows,list) and rows,'Missing payload files')
    seen=set();total=0
    for row in rows:
        name=name_of(row.get('path'));require(name==row['path'] and name not in seen,'Duplicate/noncanonical lock path');seen.add(name)
        require(type(row.get('bytes'))is int and row['bytes']>=0 and re.fullmatch('[a-f0-9]{64}',row.get('sha256','')), 'Invalid payload row')
        total+=row['bytes']
    require(total==lock.get('bytes') and total<=LIMIT, 'Invalid payload byte total')
    return lock,hashlib.sha256(raw).hexdigest()

def verify_archive(archive,lock,lock_sha):
    expected={r['path']:r for r in lock['files']};seen=set();dirs=set();total=0
    with tarfile.open(archive,'r:') as tar:
        for member in tar:
            if member.isdir():
                raw=member.name.rstrip('/')
                if raw in ('.','./',''):continue
                name=name_of(raw)
                require(name not in dirs and name not in expected and any(x.startswith(name+'/')for x in expected),'Unexpected/duplicate directory')
                dirs.add(name);continue
            require(member.isfile() and not member.issparse(),'Links/devices/sparse members are forbidden')
            name=name_of(member.name);require(name in expected and name not in seen,'Unexpected/duplicate payload member')
            row=expected[name];require(member.size==row['bytes'],'Tar member size differs from accepted lock')
            seen.add(name);total+=member.size;require(total<=LIMIT,'Tar payload exceeds publication limit')
            h=hashlib.sha256();count=0
            stream=tar.extractfile(member);require(stream is not None,'Unreadable regular member')
            for chunk in iter(lambda:stream.read(1048576),b''):h.update(chunk);count+=len(chunk)
            require(count==row['bytes'] and h.hexdigest()==row['sha256'],'Tar member hash differs from accepted lock')
    require(seen==set(expected),'Tar is missing an accepted payload file')
    return {'status':'verified','files':len(seen),'bytes':total,'lockSha256':lock_sha,'tarSha256':sha(archive),'tarBytes':Path(archive).stat().st_size}

def pack_archive(site,archive,lock,lock_sha):
    site=Path(site);archive=Path(archive)
    require(site.is_dir() and not site.is_symlink(),'Missing/linked site directory')
    require(not archive.exists() and not archive.is_symlink(),'Archive must be a new output file')
    require(not archive.resolve().is_relative_to(site.resolve()),'Archive cannot be inside its payload')
    actual=[]
    for p in site.rglob('*'):
        require(not p.is_symlink(),'Payload symlinks are forbidden')
        if p.is_file():actual.append(p.relative_to(site).as_posix())
    require(sorted(actual)==sorted(r['path']for r in lock['files']),'Source inventory differs from lock')
    with tarfile.open(archive,'x',format=tarfile.USTAR_FORMAT) as tar:
        for row in sorted(lock['files'],key=lambda r:r['path']):
            name=name_of(row['path']);p=site/name
            require(p.stat().st_nlink==1 and p.stat().st_size==row['bytes'] and sha(p)==row['sha256'],'Source changed or hardlinked')
            info=tarfile.TarInfo(name);info.size=row['bytes'];info.mode=0o644;info.mtime=0;info.uid=0;info.gid=0
            with p.open('rb')as f:tar.addfile(info,f)
    return verify_archive(archive,lock,lock_sha)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('command',choices=['pack','verify']);parser.add_argument('--lock',required=True,type=Path);parser.add_argument('--tar',required=True,type=Path);parser.add_argument('--site',type=Path);parser.add_argument('--report',required=True,type=Path);args=parser.parse_args()
    try:
        require(not args.report.exists() and not args.report.is_symlink(),'Report must be a new file')
        lock,lock_sha=load_lock(args.lock)
        if args.command=='pack':require(args.site is not None,'--site is required');result=pack_archive(args.site,args.tar,lock,lock_sha)
        else:result=verify_archive(args.tar,lock,lock_sha)
        with args.report.open('x',encoding='utf-8')as f:json.dump(result,f,sort_keys=True,indent=2);f.write('\n')
        print(json.dumps(result));return 0
    except (ArchiveError,OSError,ValueError,tarfile.TarError,KeyError,TypeError)as e:
        print('PAGES_ARCHIVE_REFUSED: '+str(e));return 1
if __name__=='__main__':raise SystemExit(main())
