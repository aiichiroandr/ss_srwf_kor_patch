# Static site artifact and rollback

The repository is a development/history tree; publish only a separately verified
site directory. `scripts/build_site.py` is offline and uses Python 3.10+ standard
library only. It never runs Git, changes Pages settings, pushes, uploads, deletes
source files, overwrites an output directory, or executes a game.

## Reviewed policy and source lock

`scripts/site-policy.json` is the production policy, normalized from the private
2026-10-28 planning inventory. It is an exact public path allowlist, not a glob.
Only reviewed public documentation is included (`WEB_PORT_TEST.md` and
`EDITOR_FACTS.md`, whose local Markdown links are checked). Internal reports,
AGENTS, scripts, tests, build files, ROM/disc/save files and arbitrary archives
are rejected even when someone attempts to add their names to the policy.

Twelve indexed ACCEPTED releases and their exact patch/manifest/receipt hashes
are retained. Runtime/source/notices are pinned for these six sets:

| Surface | Retained immutable host |
| --- | --- |
| WEB PORT desktop | `38750b51d70b4e33412b` |
| WEB PORT mobile v13 | `16f9cf9fde74c2d70e6b` |
| WEB PORT mobile v14 | `1a0261ada40574cfb43d` |
| Previous public desktop | `3c1c72226a61ee8d7631` |
| Final weapon preview | `702f6e6ed433cf165086` |
| F weapon preview | `8f342dac2ee485198ad3` |

Keep each JS/WASM/source archive and the surface's notices together. Do not
rewrite current-mobile.json to v14 or remove the previous public desktop URL.
The five active runtime-manifest routes and all twelve release routes are
validated independently of literal HTML/JS/CSS/SVG/Markdown references. Frontend
literal imports, workers, importScripts, fetches and stored public fact-document
URLs must resolve inside the allowlist. Generated Emscripten code and its known
dynamic runtime names use the pinned manifest contract. This bounded checker
is not a general JavaScript interpreter or a browser/game execution claim.

After the owner freezes the candidate and its product tests, lock the exact
source bytes. A changed source, policy, runtime manifest, pin or copied byte
invalidates the lock; do not repair a generated lock by hand. Updating public
paths or immutable hosts requires a reviewed policy change and a new lock.
Policy files and locks are tooling/evidence, not public site members.

## Local commands

From the frozen candidate repository, choose **new** lock/output names for every
attempt; the tool refuses existing destinations. For example:

```sh
mkdir -p build/site-review
python3 scripts/build_site.py lock --root . \
  --lock build/site-review/reviewed-01.json
python3 scripts/build_site.py build --root . \
  --lock build/site-review/reviewed-01.json \
  --out build/pages-reviewed-01 --copy auto
python3 scripts/build_site.py verify --root . \
  --lock build/site-review/reviewed-01.json \
  --out build/pages-reviewed-01
node scripts/run-node-tests.cjs tests/pages-site.test.mjs
```

`--copy auto` uses APFS clone on macOS, otherwise independent streaming copies.
`--copy clone` requires macOS/APFS; `--copy copy` forces independent copies.
Approved source files may be hardlinked in a worktree, but the artifact must
have independent inodes: output hardlinks and all source/output symlinks fail.
The tool does not delete a failed partial output. Such output is unapproved;
inspect it or choose another new output directory. Never reuse an unrelated
existing directory. Inside the repository, output is allowed only in a dedicated
subdirectory below ignored `build/`; an external new directory is also valid.

The exact file payload sum must be at most **1,000,000,000 bytes**. The tool does
not silently remove runtime versions or exceed this bound. Byte limit, exact
inventory, missing files, case, unsafe paths, symlinks, output hardlinks, source
mutation, artifact hashes, public references and dynamic release/runtime closure
are checked before approval. Package verification does not replace `npm test`,
`scripts/verify_repo.py`, final candidate identification, or user deployment
approval. The Node test wrapper runs the Python safety tests in the existing npm
wildcard test gate; package.json needs no test-script change.

## Publication boundary

A Pages Actions workflow should upload only the newly verified site directory,
never `.` or the repository. Preserve its source commit, policy SHA, lock and
verification report as private build evidence. Configure/deploy actions and the
legacy-to-Actions setting are separate authorized external operations. A filtered
site is not used while Pages still publishes legacy `main:/`; do not assume that
creating the directory changes the published site. Do not push the oversized
repository root as a substitute for an artifact deployment.

After authorized publication, check the project-prefix URL, exact index/release
index/active runtime hashes, all retained runtime/source URLs, and fresh plus
previously service-worker-controlled clients. Check that private paths and
nonallowlisted historical runtime URLs are absent. Existing browser saves remain
browser-local; no ROM coldboot is necessary for these HTTP/handoff checks.

## Rollback

Retain the previous successfully verified site artifact, its matching policy,
lock and source commit outside the next output directory. On an authorized
rollback, verify that complete previous artifact against its **own** policy/lock,
then redeploy it as a unit. Do not mix an older index with newer manifests,
workers, JS/WASM or source archives. Do not delete user IndexedDB storage or
rewrite saves. Confirm the restored public hashes and fresh/controlled clients.
A rollback deployment or Pages setting change is not performed by this tool.

### Prepared manual workflows

`.github/workflows/pages.yml` publishes only on manual dispatch from `main`.
The caller must provide `expectedSourceCommit` and `expectedSiteLockSha256` from
an accepted review. The source must equal both the workflow event SHA and actual
checkout HEAD. A freshly generated lock must match the accepted SHA before the
payload is built or uploaded. Inputs are environment values, never interpolated
as executable shell text. Full repository tests and verification still run.

The exact uploaded tar is also checked. The pinned official upload action leaves
`$RUNNER_TEMP/artifact.tar`; `pages_archive.py verify` checks its regular-file
inventory, byte sizes and SHA-256 values against the accepted lock. Directory
entries and an initial `./` are normalized, but extra/missing files, links,
devices, sparse members and changed bytes fail. The deployment job depends on
this check succeeding, even though the action has already uploaded the artifact.
Source commit, lock, policy and directory/archive reports are preserved separately.

The official action excludes hidden paths. The repository's `.nojekyll` remains
in source but is deliberately excluded from the site policy, so the directory
lock and actual tar contain exactly the same payload. No Jekyll build runs in
this Actions pipeline. All action versions are pinned; no push or pull-request
event deploys. Adding workflows does not change existing Pages settings.

`pages-recovery.yml` is a separate manual recovery path with the same accepted
current workflow commit and lock inputs. It checks out only the pinned previous
public source, validates all original files, prepares the reviewed hidden-file
filtered payload, compares its deterministic lock, and checks the actual upload
tar before deployment. See [previous-source recovery](PREVIOUS_SOURCE_RECOVERY.md).
This is a recovery constructed from old Git source; it is **not proof of identity
with the old legacy Pages artifact**, which has not been obtained. Do not label
its source directory or local tar as that historical deployed artifact.

For local payload checks without uploading:

```sh
python3 scripts/pages_archive.py pack --site build/pages-reviewed-01 \
  --lock build/site-review/reviewed-01.json \
  --tar build/pages-reviewed-01.tar --report build/archive-reviewed-01.json
```

This deterministic local tar proves its payload against the lock. The official
runner tar can have different directory order and metadata, so its entire tar
hash is recorded independently after the actual upload action. Its file payload
must still match exactly. Recovery and publication both remain separate actions
requiring the user's authorization; these tools do not dispatch them.

Workflow configuration follows [GitHub Pages custom-workflow guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
