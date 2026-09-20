import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export function assertPublishingTools(nodeVersion, npmVersion) {
  const meets = (value, minimum) => {
    if (!/^\d+\.\d+\.\d+$/.test(value)) return false;
    const parts = value.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (parts[i] !== minimum[i]) return parts[i] > minimum[i];
    return true;
  };
  assert.ok(meets(nodeVersion, [22, 14, 0]), 'Node >=22.14.0 required');
  assert.ok(meets(npmVersion, [11, 5, 1]), 'npm >=11.5.1 required; no automatic upgrade');
}
export function assertReleaseInputs(policy, manifest, lock, env) {
  assert.equal(env.GITHUB_REPOSITORY, policy.repository);
  assert.equal(env.GITHUB_EVENT_NAME, 'push');
  assert.match(manifest.version, /^0\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  assert.equal(env.GITHUB_REF, `refs/tags/v${manifest.version}`);
  assert.equal(manifest.name, policy.packageName);
  assert.equal(manifest.private, false);
  assert.equal(manifest.license, 'PolyForm-Noncommercial-1.0.0');
  assert.equal(manifest.publishConfig?.access, 'public');
  assert.equal(manifest.repository?.url, `git+https://github.com/${policy.repository}.git`);
  assert.equal(lock.name, manifest.name);
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[''].name, manifest.name);
  assert.equal(lock.packages[''].version, manifest.version);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const read = file => JSON.parse(readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
  assertReleaseInputs(read('release-policy.json'), read('package.json'), read('package-lock.json'), process.env);
  assertPublishingTools(process.versions.node, execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim());
}
