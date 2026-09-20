import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const evidence = mkdtempSync(join(tmpdir(), 'nodal-blockly-package-'));
const archiveDirectory = join(evidence, 'archive');
const cache = join(evidence, 'npm-cache');
mkdirSync(archiveDirectory, { recursive: true });

const run = (command, args, cwd = root) => execFileSync(command, args, {
  cwd,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  env: { ...process.env, npm_config_offline: 'true', npm_config_update_notifier: 'false', npm_config_cache: cache }
});
const npmCli = process.platform === 'win32'
  ? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  : join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
assert.ok(existsSync(npmCli), `Installed npm CLI required at ${npmCli}`);

const packed = JSON.parse(run(process.execPath, [npmCli, 'pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', archiveDirectory]))[0];
const files = packed.files.map(file => file.path).sort();
for (const file of files) assert.match(file, /^(?:dist\/|package\.json$|README\.md$|LICENSE\.md$)/);
for (const file of ['dist/index.js', 'dist/index.d.ts', 'dist/surface.js', 'dist/surface.d.ts', 'README.md', 'LICENSE.md', 'package.json']) {
  assert.ok(files.includes(file), file);
}
assert.ok(!files.some(file => file.startsWith('src/')), 'Source files must not enter the npm archive');

const consumer = join(evidence, 'consumer');
const installedPackage = join(consumer, 'node_modules', ...manifest.name.split('/'));
mkdirSync(installedPackage, { recursive: true });
const archive = join(archiveDirectory, packed.filename);
run('tar', ['-xzf', archive, '-C', installedPackage, '--strip-components=1']);
const extracted = join(evidence, 'extracted-package');
mkdirSync(extracted, { recursive: true });
cpSync(installedPackage, extracted, { recursive: true });
cpSync(join(root, 'node_modules'), join(consumer, 'node_modules'), { recursive: true, dereference: true });
cpSync(extracted, installedPackage, { recursive: true, force: true });
writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }, null, 2));
writeFileSync(join(consumer, 'consumer.mts'), `
import { BlocklyContributionCatalog } from '@konitif/nodal-blockly';
import { mountNodalBlocklySurface } from '@konitif/nodal-blockly/surface';
const catalog = new BlocklyContributionCatalog();
catalog.dispose();
void mountNodalBlocklySurface;
`);
const compiler = join(consumer, 'node_modules/typescript/bin/tsc');
assert.ok(existsSync(compiler), 'Installed locked TypeScript compiler required');
run(process.execPath, [compiler, '--noEmit', '--strict', '--skipLibCheck', 'false', '--target', 'ES2022', '--lib', 'ES2022,DOM', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.mts'], consumer);
run(process.execPath, ['--input-type=module', '-e', `const root = await import('@konitif/nodal-blockly'); const surface = await import('@konitif/nodal-blockly/surface'); if (typeof root.BlocklyContributionCatalog !== 'function' || typeof surface.mountNodalBlocklySurface !== 'function') throw new Error('Invalid public exports');`], consumer);

const bytes = readFileSync(archive);
console.log(JSON.stringify({
  status: 'passed',
  name: manifest.name,
  version: manifest.version,
  integrity: packed.integrity,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length,
  files: files.length,
  consumer: 'isolated ESM and strict NodeNext declarations',
  evidence: archiveDirectory,
  workspace: evidence,
  archive
}, null, 2));
