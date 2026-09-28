from pathlib import Path
import json,re,hashlib
from datetime import datetime
r=Path(__file__).resolve().parents[1]
data=json.loads((r/'docs/G103_R116_LOCAL_EXPORT.json').read_text())
stamp=datetime.now().astimezone().isoformat(timespec='seconds')
index=json.loads((r/'manifest/releases.json').read_text())
for m in data['releases']:
 rid=m['id'];m['publishedAt']=stamp
 rp=r/f'receipts/{rid}.acceptance.json';rec=json.loads(rp.read_text());rec['acceptedAt']=stamp;rp.write_text(json.dumps(rec,ensure_ascii=False,indent=2)+'\n')
 m['provenance']['acceptanceReceiptSha256']=hashlib.sha256(rp.read_bytes()).hexdigest()
 mp=r/f'releases/{rid}.json';mp.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
 next(x for x in index['releases'] if x['id']==rid)['manifestSha256']=hashlib.sha256(mp.read_bytes()).hexdigest()
(r/'manifest/releases.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n')
(r/'docs/G103_R116_LOCAL_EXPORT.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
p=r/'assets/app.mjs';s=p.read_text();entries=[]
for m in data['releases']:
 if m['id'].startswith('srwf-f-'):tracks='F_V04_CUE_TRACKS'
 else:tracks='Object.freeze('+json.dumps(['TRACK 01 MODE1/2352','INDEX 01 00:00:00','TRACK 02 MODE2/2352','INDEX 00 17:03:64','INDEX 01 17:06:64','TRACK 03 AUDIO','INDEX 00 48:55:28','INDEX 01 48:57:28'])+')'
 if m['target']['sha256'] not in s:entries.append('  ["'+m['target']['sha256']+'", '+tracks+'],')
s=s.replace('const PATCHED_IMAGE_CUE_TRACKS = new Map([','const PATCHED_IMAGE_CUE_TRACKS = new Map([\n'+'\n'.join(entries));p.write_text(s)
p=r/'AGENTS.md';s=p.read_text();marker='The current repository state is `HAS_ACCEPTED_RELEASE`.'
s=s.replace(marker,'''The current local release targets are F G103 a/b/c as v0.5 and FIN r116 a/b/c as v0.2, accepted for local patch/download registration by the user's 2026-09-28 instruction. Defaults are `srwf-f-20260928-v0-5-a` and `srwf-final-20260928-v0-2-a`. Evidence ceiling: `docs/F_V05_FIN_V02_VALIDATION.md`; no fresh user coldboot, a/b individual gameplay, long-play or CD-R claim. Remote deployment is not authorized.

The historical release state below is retained for earlier release context.

'''+marker);p.write_text(s)
p=r/'docs/NEXT_RELEASE_PREPARATION.md';s=p.read_text();s+='\n## 2026-09-28 로컬 등록 완료\n\n사용자의 G103/r116 abc 패치·다운로드 목록 등록 지시를 수용 근거로 여섯 릴리스를 등록했다. 새 기본 버전은 F v0.5 / FIN v0.2이며 a/b/c 선택과 패치노트·BGM 표를 연결했다. 기존 미완료 기록은 과거 상태다. 실제 검증 결과와 한계는 `G103_R116_LOCAL_EXPORT.json` 및 `F_V05_FIN_V02_VALIDATION.md` 참조. 원격 main의 64b08cb 선택칸 수정은 로컬에 반영했으며 에디터는 포함하지 않았다. push/Pages 배포 없음.\n';p.write_text(s)
