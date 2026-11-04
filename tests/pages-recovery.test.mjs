import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('previous-source recovery is pinned, filtered and rejects tampering', () => {
  const result = spawnSync('python3', ['-B', fileURLToPath(new URL('./test_recovery_site.py', import.meta.url)), '-v'], {
    encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
