import argparse
import json
import platform
import subprocess
import tempfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--source-root", type=Path, default=Path(__file__).resolve().parents[1])
parser.add_argument("--cxx", default="c++")
args = parser.parse_args()
root = args.source_root.resolve()
core = root / "core" if (root / "core").is_dir() else root
source = core / "runtime/src/machine/mmio.cpp"
test = Path(__file__).with_name("review-mmio-gate.cpp")
link_gc = "-Wl,-dead_strip" if platform.system() == "Darwin" else "-Wl,--gc-sections"
results = []
with tempfile.TemporaryDirectory(prefix="srwf-mmio-test-") as tmp:
    for name, defines in [("default", []), ("mobile", ["-DSRWF_MOBILE_LOW_OVERHEAD=1"])]:
        binary = Path(tmp) / name
        command = [args.cxx, "-std=c++20", "-O2", "-ffunction-sections", "-fdata-sections", link_gc,
                   '-DSRWF_MMIO_SOURCE="' + str(source) + '"', *defines]
        for include in ["runtime/include", "runtime/src/machine", "runtime/src/video",
                        "runtime/src/sound", "runtime/src/host"]:
            command.extend(["-I", str(core / include)])
        command.extend([str(test), "-o", str(binary)])
        build = subprocess.run(command, text=True, capture_output=True)
        result = {"variant": name, "compileExit": build.returncode, "compileStderr": build.stderr}
        if build.returncode == 0:
            run = subprocess.run([str(binary)], text=True, capture_output=True)
            result.update(testExit=run.returncode, stdout=run.stdout, stderr=run.stderr)
        results.append(result)
print(json.dumps(results, ensure_ascii=False, indent=2))
raise SystemExit(0 if all(r["compileExit"] == 0 and r.get("testExit") == 0 for r in results) else 1)
