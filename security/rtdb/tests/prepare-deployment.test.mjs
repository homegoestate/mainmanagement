import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

function fixture(t, {allReady = false, raw} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'homego-retired-profile-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(join(root, 'tools'));
  copyFileSync(new URL('../tools/prepare-deployment.mjs', import.meta.url), join(root, 'tools/prepare-deployment.mjs'));
  const readiness = JSON.parse(readFileSync(new URL('../readiness.json', import.meta.url), 'utf8'));
  readiness.productionReady = allReady;
  for (const key of Object.keys(readiness.checks)) readiness.checks[key] = allReady;
  if (raw !== null) writeFileSync(join(root, 'readiness.json'), raw ?? JSON.stringify(readiness));
  return {root, run: () => spawnSync(process.execPath, [join(root, 'tools/prepare-deployment.mjs')], {encoding: 'utf8'})};
}

test('unaccepted production gates cannot generate deployment files', t => {
  const f = fixture(t), result = f.run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Outstanding evidence/);
  assert.equal(existsSync(join(f.root, 'private')), false);
});
test('marking every old gate true cannot deploy the incompatible architecture', t => {
  const f = fixture(t, {allReady: true}), result = f.run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /RETIRED DEPLOYMENT PROFILE/);
  assert.equal(existsSync(join(f.root, 'private')), false);
  assert.doesNotMatch(result.stdout + result.stderr, /npx firebase deploy/);
});
test('a stale private deployment config is neither reused nor overwritten', t => {
  const f = fixture(t, {allReady: true});
  const folder = join(f.root, 'private/deployment');
  mkdirSync(folder, {recursive: true});
  const path = join(folder, 'homego-system.json');
  writeFileSync(path, 'operator-owned-old-config');
  const result = f.run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /do not bypass this guard or reuse previously generated configs/);
  assert.equal(readFileSync(path, 'utf8'), 'operator-owned-old-config');
});
test('missing or invalid readiness cannot produce a runnable config', t => {
  for (const raw of [null, '{invalid']) {
    const f = fixture(t, {raw}), result = f.run();
    assert.equal(result.status, 2);
    assert.match(result.stderr, /missing or invalid/);
    assert.equal(existsSync(join(f.root, 'private')), false);
  }
});
