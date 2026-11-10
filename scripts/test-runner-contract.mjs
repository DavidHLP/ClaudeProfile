import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// End-to-end checks for test discovery, nonzero failure propagation and V8
// coverage mapping. Fixtures are outside the checkout and removed afterward.
const root = process.cwd();
const fixture = await mkdtemp(path.join(tmpdir(), 'claude-profile-runner-'));
try {
  await mkdir(path.join(fixture, 'src'));
  await mkdir(path.join(fixture, 'tests/nested'), { recursive: true });
  await cp(path.join(root, 'scripts'), path.join(fixture, 'scripts'), { recursive: true });
  await symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(path.join(fixture, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(fixture, 'tsconfig.test.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'ES2022', moduleResolution: 'bundler', noCheck: true,
    rootDir: '.', outDir: '.test-build', sourceMap: true, inlineSources: true,
  }, include: ['src/**/*.ts', 'tests/**/*.ts'] }));
  await writeFile(path.join(fixture, 'src/used.ts'), 'export const value: number = 42;\n');
  await writeFile(path.join(fixture, 'src/unused.ts'), 'export const unused = () => 99;\n');
  const testcase = path.join(fixture, 'tests/nested/probe.test.ts');
  await writeFile(testcase, "import { it } from 'node:test'; import assert from 'node:assert/strict'; import { value } from '../../src/used.js'; it('nested coverage probe', () => assert.equal(value, 42));\n");
  const run = (args = []) => spawnSync(process.execPath, ['scripts/test.mjs', ...args], {
    cwd: fixture, encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, NODE_V8_COVERAGE: '' },
  });
  let result = run(['--coverage']);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(await readFile(path.join(fixture, 'coverage/coverage-final.json'), 'utf8'));
  const used = report[path.join(fixture, 'src/used.ts')];
  const unused = report[path.join(fixture, 'src/unused.ts')];
  assert.ok(used && Object.values(used.s).some(count => count > 0), 'executed TS source must have hits');
  assert.ok(unused && Object.values(unused.s).every(count => count === 0), 'unloaded source must be zero-covered');
  assert.equal(Object.keys(report).length, 2, 'reports must exclude tests and dependencies');
  await readFile(path.join(fixture, 'coverage/index.html'));
  await writeFile(testcase, "import { it } from 'node:test'; it('nested failure probe', () => { throw Error('EXPECTED_TEST_FAILURE'); });\n");
  result = run();
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /EXPECTED_TEST_FAILURE/);
  await rm(testcase);
  result = run();
  assert.notEqual(result.status, 0, 'empty discovery must not succeed');
  console.log('Runner contract passed: nested discovery, failure, empty suite, TS coverage and HTML');
} finally {
  await rm(fixture, { recursive: true, force: true });
}
