import argparse
import json
import subprocess
import tempfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--source-root', type=Path, default=Path(__file__).resolve().parents[1])
parser.add_argument('--cxx', default='c++')
args = parser.parse_args()
root = args.source_root.resolve()
core = root / "core" if (root / "core").is_dir() else root
fixtures = Path(__file__).with_name('review-profile')
machine = core / 'runtime/src/machine'
results = []
with tempfile.TemporaryDirectory(prefix='srwf-profile-test-') as tmp:
    tmp = Path(tmp)
    command = [args.cxx, '-std=c++17', '-O2', '-D__EMSCRIPTEN__', '-DSRWF_MOBILE_PROFILE=1',
               '-I', str(fixtures), '-I', str(machine), str(fixtures / 'profile_test.cpp'), '-o', str(tmp / 'profile-test')]
    build = subprocess.run(command, capture_output=True, text=True)
    results.append({'test': 'diagnostic-compile', 'exitCode': build.returncode, 'stderr': build.stderr})
    if build.returncode == 0:
        run = subprocess.run([str(tmp / 'profile-test')], capture_output=True, text=True)
        results.append({'test': 'diagnostic-invariants', 'exitCode': run.returncode, 'stdout': run.stdout, 'stderr': run.stderr})
    disabled = subprocess.run([args.cxx, '-std=c++17', '-O2', '-D__EMSCRIPTEN__', '-I', str(machine),
                               '-S', str(fixtures / 'disabled.cpp'), '-o', str(tmp / 'disabled.s')], capture_output=True, text=True)
    results.append({'test': 'disabled-compile-without-emscripten-header', 'exitCode': disabled.returncode, 'stderr': disabled.stderr})
    header = (machine / 'mobile_profile.h').read_text()
    begin = header.index('EM_ASM({') + len('EM_ASM({')
    end = header.index('}, values,', begin)
    body = header[begin:end]
    script = 'function reportBody(HEAPF64,postMessage,$0,$1,$2,$3,$4,$5,$6,$7){' + body + '}\n'
    script += "const heap=new Float64Array(60);heap[0]=4;heap[1]=2;let value;reportBody(heap,x=>value=x,0,1,0,120,10,1010,3,1);if(value.stats.sound.inclusive.totalMs!==4||value.soundCalls!==2||value.wallMs!==1000||value.speedMask!==3)throw Error('schema');process.stdout.write('PASS schema\\n');"
    js = tmp / 'schema.cjs'
    js.write_text(script)
    run = subprocess.run(['node', str(js)], capture_output=True, text=True)
    results.append({'test': 'actual-report-js-schema', 'exitCode': run.returncode, 'stdout': run.stdout, 'stderr': run.stderr})
print(json.dumps(results, ensure_ascii=False, indent=2))
raise SystemExit(0 if all(item['exitCode'] == 0 for item in results) else 1)
