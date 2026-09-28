#!/usr/bin/env python3
"""Read-only image/patch projection; writes metadata only, never release artifacts."""
import hashlib, json, struct, subprocess, sys, zlib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
F = Path('/Users/garlicb/Documents/260729_srwf_kor_v5')
FIN = Path('/Users/garlicb/Documents/260702_srwfin_kor_v1')
LIB = FIN / 'reports/fin_r109_growth_media_20260921'
sys.path.insert(0, str(LIB))
import layout as L
import srwfp2 as V2
import verify_srwfp2 as V
sha = lambda b: hashlib.sha256(b).hexdigest()
def read_checked(path, digest):
    b = path.read_bytes()
    assert sha(b) == digest, str(path)
    return b
report = {'status': 'PREPARED_NOT_ACCEPTED', 'baseCommit': '19987edb50efd005569df0693fc2eb631019fa8a',
          'scope': 'local only; metadata only; no BIN/CUE/SRWFP written', 'releases': []}
source_info = json.loads((F/'inputs/manifests/stock_disc_manifest.json').read_text())['raw_image']
source = read_checked(Path(source_info['path_hint']), source_info['sha256'])
audit = json.loads((F/'reports/g98_exact_family_20260924/delivery-audit.json').read_text())
for lane, row in zip('abc', audit['revisions']):
    target = read_checked(Path(row['cue']).with_suffix('.bin'), row['image_sha256'])
    assert len(source) == len(target)
    body = bytearray()
    runs = V2.diff_runs(source, target, 0, len(source))
    # Canonical v1: every payload byte differs from the same original offset.
    restored = bytearray(source)
    for a,b in runs:
        body += struct.pack('>QI', a, b-a) + hashlib.sha256(source[a:b]).digest() + target[a:b]
        restored[a:b] = target[a:b]
    assert restored == target
    header = b'SRWFKP1\0' + struct.pack('>IQQQ', len(runs), len(source), len(target), len(body))
    header += hashlib.sha256(source).digest() + hashlib.sha256(target).digest()
    patch = header + zlib.compress(body, 9)
    within_limits = len(patch) <= 80*1024**2 and len(body) <= 128*1024**2 and len(runs) <= 2000000
    modes=[]
    for sec in range(len(target)//2352):
        raw=target[sec*2352:(sec+1)*2352]
        mode=raw[15] if raw[:12] == b'\0'+b'\xff'*10+b'\0' else 'AUDIO'
        if not modes or modes[-1][1]!=mode: modes.append([sec,mode])
    d={'id':f'srwf-f-20260924-v0-5-{lane}', 'revision':row['revision'], 'format':'srwf.sparse-byte-delta.v1',
       'sourceSha256':sha(source), 'targetSha256':sha(target), 'targetSize':len(target),
       'patchSha256':sha(patch), 'patchSize':len(patch), 'recordCount':len(runs),
       'bodyUncompressedSize':len(body), 'withinCurrentLimits':within_limits, 'byteExactReapply':True, 'sectorModeTransitions':modes}
    checked=subprocess.run(['node','--max-old-space-size=256',str(ROOT/'tests/helpers/verify-prepared-patch.mjs'),source_info['path_hint'],sha(target)],input=patch,capture_output=True,check=True)
    d['browserVerification']=json.loads(checked.stdout)
    report['releases'].append(d)
    print(json.dumps(d), flush=True)
    del target, body, restored, patch, runs
source=None
stock=L.Stock()
# r111 expands TSR's logical size within its existing 105-sector allocation.
# Therefore its directory-size record changes in addition to the four G541 relocations.
L.CHANGED_ROOT_RECORDS=sorted([*L.CHANGED_ROOT_RECORDS,'TSR.BIN'])
for lane in 'abc':
    card_path=FIN/f'ai_artifacts/revision_control/revisions/FIN.r111{lane}.json'
    card_bytes=card_path.read_bytes(); card=json.loads(card_bytes)
    assert card['revision']==f'FIN.r111{lane}' and len(card['payloads'])==9
    payloads={}
    for row in card['payloads']:
        name,suffix=row['role'].rsplit('.R111.',1)
        assert suffix==lane and name in L.CARD_LBA and row['lba']==L.CARD_LBA[name]
        data=read_checked(FIN/row['path'],row['sha256'])
        assert len(data)==row['bytes']
        payloads[name]=data
    assert len(payloads['TSR.BIN'])==215040 and L.nsec(len(payloads['TSR.BIN']))==105
    target=L.project_lane(stock,payloads)
    static=L.verify_lane(stock,target,payloads)
    patch,desc,stats=V2.encode(stock.img,target,[L.COPY])
    verify=V.verify_patch(patch,stock.img,target,desc)
    assert stats['bytes']['literal']==0
    d={'id':f'srwf-final-20260924-v0-2-{lane}', 'revision':card['revision'], 'cardSha256':sha(card_bytes),
       **desc, 'static':static['verdict'], 'byteExactReapply':verify['byte_exact_vs_projection'],
       'cueTracks':L.CUE_TRACK_LINES, 'stats':stats}
    report['releases'].append(d)
    print(json.dumps(d), flush=True)
    del target, patch, payloads
(ROOT/'docs/NEXT_RELEASE_PREFLIGHT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
