#!/usr/bin/env python3
"""Exact local release export. Requires pinned registered images; no remote writes."""
import hashlib,json,struct,zlib,sys,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
F=Path('/Users/garlicb/Documents/260729_srwf_kor_v5'); FIN=Path('/Users/garlicb/Documents/260702_srwfin_kor_v1')
sys.path.insert(0,str(FIN/'reports/fin_r109_growth_media_20260921'))
import layout as L, srwfp2 as V2, verify_srwfp2 as V
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(p,h):
 b=Path(p).read_bytes();assert sha(b)==h,str(p);return b
def write(p,d):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');return sha(p.read_bytes())
stage=Path('/private/tmp/srwf-g103-r116-public-export');stage.mkdir(exist_ok=True)
idx=json.loads((ROOT/'manifest/releases.json').read_text()); products=[]
commit=subprocess.check_output(['git','-C',str(F),'rev-parse','HEAD'],text=True).strip()
web=json.loads((F/'reports/g103_exact_family_20260928/web-verification.json').read_text())
drive=json.loads((F/'reports/g103_exact_family_20260928/drive-upload.json').read_text())
proj=json.loads((FIN/'reports/fin_r116_media_20260928/projection.json').read_text())
for game,ver,base in [('srwf-f','v0.5','srwf-f-20260915-v0-4-a'),('srwf-final','v0.2','srwf-final-20260921-v0-1-a')]:
 template=json.loads((ROOT/f'releases/{base}.json').read_text())
 if game=='srwf-f':source=read(F/'../srwf_runtime/rom/mod/stock.img',template['source']['sha256'])
 else: stock=L.Stock();source=stock.img
 for i,lane in enumerate('abc'):
  rid=f'{game}-20260928-{ver.replace(".","-")}-{lane}'
  pp=stage/f'{rid}.srwfp'; meta=stage/f'{rid}.json'
  if meta.exists() and pp.exists():
   m=json.loads(meta.read_text());assert sha(pp.read_bytes())==m['patch']['sha256'];products.append(m);print(rid,'cached',flush=True);continue
  if game=='srwf-f':
   targetpath=Path(web[i]['cue']).with_suffix('.bin'); digest=next(x['Hashes']['sha256'] for x in drive['revisions'][i]['files'] if x['Name']=='V5.bin')
  else:
   o=proj['lanes'][lane]['outputs'][0];targetpath=Path(o['path']);digest=o['sha256']
  target=read(targetpath,digest)
  if game=='srwf-f':
   assert len(source)==len(target)
   runs=V2.diff_runs(source,target,0,len(source)); body=bytearray()
   for a,b in runs:body+=struct.pack('>QI',a,b-a)+hashlib.sha256(source[a:b]).digest()+target[a:b]
   patch=b'SRWFKP1\0'+struct.pack('>IQQQ',len(runs),len(source),len(target),len(body))+hashlib.sha256(source).digest()+hashlib.sha256(target).digest()+zlib.compress(body,9)
   desc={'format':'srwf.sparse-byte-delta.v1','size':len(patch),'sha256':sha(patch),'recordCount':len(runs),'bodyUncompressedSize':len(body)}
   assert len(patch)<=80*1024**2 and len(body)<=128*1024**2 and len(runs)<=2000000
   del body,runs
   verified=subprocess.run(['node','--max-old-space-size=256',str(ROOT/'tests/helpers/verify-prepared-patch.mjs'),str(F/'../srwf_runtime/rom/mod/stock.img'),digest],input=patch,capture_output=True,check=True)
   check=json.loads(verified.stdout)
  else:
   patch,d,stats=V2.encode(source,target,[L.COPY]);check=V.verify_patch(patch,source,target,d);assert stats['bytes']['literal']==0
   desc={'format':d['format'],'size':d['patchSize'],'sha256':d['patchSha256'],'recordCount':d['recordCount'],'bodyUncompressedSize':d['bodyUncompressedSize']}
  assert digest==sha(target)
  m=json.loads(json.dumps(template));m.update(id=rid,version=ver,publishedAt='2026-09-28T23:00:00+09:00',title=f'세가 새턴 슈퍼로봇대전 {"F" if game=="srwf-f" else "F 완결편"} 한글 패치 — 2026.09.28 {ver} ({lane})')
  name=f'{"SRWF" if game=="srwf-f" else "SRWFIN"}-KOR-20260928-{ver}-{lane}'
  m['target']={'filename':name+'.bin','cueFilename':name+'.cue','size':len(target),'sha256':digest}
  m['patch']={**desc,'url':f'patches/{rid}.srwfp'}
  ev={'revision':f'G103{lane}' if game=='srwf-f' else f'FIN.r116{lane}','targetSha256':digest,'patch':desc,'verification':check,'evidenceCeiling':'Exact registered media plus copied-state runtime/visual evidence; fresh user coldboot, individual a/b runtime, long play and CD-R not claimed.','registrationReceiptSha256':sha((F/'reports/g103_exact_family_20260928/execution-result.json' if game=='srwf-f' else FIN/'reports/fin_r116_media_20260928/projection.json').read_bytes())}
  eh=write(stage/f'{rid}.build.json',ev)
  receipt={'schema':'srwf-kor.acceptance-receipt.v1','releaseId':rid,'state':'ACCEPTED','acceptedAt':m['publishedAt'],'stockProfileId':m['source']['profileId'],'sourceSha256':sha(source),'targetSha256':digest,'patchSha256':desc['sha256'],'v5Commit':commit,'gates':{'staticStructure':'PASS','runtimeConsumption':'PASS','visualLayout':'PASS','longPlayProgression':'NOT_CLAIMED'},'decisionAuthority':'사용자 2026-09-28 지시: G103/r116 abc 로컬 패치·다운로드 목록 등록. 기존 복사 상태 검증 범위로 수용. 신규 콜드부트·a/b 개별 플레이·장기 진행·CD-R 검수는 주장하지 않음. 원격 배포 제외.'}
  rh=write(stage/f'{rid}.acceptance.json',receipt)
  m['provenance']={'v5Commit':commit,'buildReceiptSha256':eh,'acceptanceReceiptSha256':rh}
  pp.write_bytes(patch);write(meta,m);products.append(m);print(rid,desc,flush=True)
  del target,patch
 del source
 if game=='srwf-final':del stock
# Only publish complete, hash-consistent six-artifact set after all exports verify.
assert len(products)==6
for m in products:
 rid=m['id'];(ROOT/m['patch']['url']).write_bytes((stage/f'{rid}.srwfp').read_bytes())
 for src,dst in [(f'{rid}.json',f'releases/{rid}.json'),(f'{rid}.acceptance.json',f'receipts/{rid}.acceptance.json'),(f'{rid}.build.json',f'docs/{rid}.build.json')]: (ROOT/dst).write_bytes((stage/src).read_bytes())
 row={'gameId':'srwf-final' if rid.startswith('srwf-final') else 'srwf-f','id':rid,'state':'ACCEPTED','label':f'2026.09.28 · {m["version"]}','manifest':f'releases/{rid}.json','manifestSha256':sha((stage/f'{rid}.json').read_bytes())}
 idx['releases']=[r for r in idx['releases'] if r['id']!=rid];idx['releases'].append(row)
for g in idx['games']:g['defaultReleaseId']=f'{g["id"]}-20260928-{"v0-5" if g["id"]=="srwf-f" else "v0-2"}-a'
idx['releases'].sort(key=lambda r:r['id']);idx['releases'].sort(key=lambda r:r['id'][:-2] if r['id'][-2:] in ('-a','-b','-c') else r['id'],reverse=True);write(ROOT/'manifest/releases.json',idx)
write(ROOT/'docs/G103_R116_LOCAL_EXPORT.json',{'scope':'local only','releases':products})
print('REGISTERED SIX LOCAL RELEASES',flush=True)
