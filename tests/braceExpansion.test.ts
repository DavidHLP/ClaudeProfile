import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const excludeRequire = createRequire(require.resolve('test-exclude'));
const globRequire = createRequire(excludeRequire.resolve('glob'));
const consumers = [
  { name: 'test-exclude / minimatch 10', require: excludeRequire },
  { name: 'test-exclude / glob / minimatch 9', require: globRequire },
].map((consumer) => {
  const minimatchRequire = createRequire(consumer.require.resolve('minimatch'));
  const bracePath = minimatchRequire.resolve('brace-expansion');
  const brace = minimatchRequire('brace-expansion');
  return {
    name: consumer.name,
    bracePath,
    expand: (typeof brace === 'function' ? brace : brace.expand) as (pattern: string) => string[],
    minimatch: minimatchRequire('minimatch').minimatch as (path: string, pattern: string) => boolean,
  };
});

it('bounds excessive nesting on the patched 2.x coverage branch', () => {
  const pattern = `${'{'.repeat(6_000)}a,b${'}'.repeat(6_000)}`;
  const child = spawnSync(process.execPath, [
    '--max-old-space-size=128',
    '--input-type=commonjs',
    '-e',
    "const expand = require(process.argv[1]); console.log(JSON.stringify(expand(process.argv[2])));",
    consumers[1].bracePath,
    pattern,
  ], { encoding: 'utf8', timeout: 10_000, killSignal: 'SIGKILL' });

  expect(child.error).toBeUndefined();
  expect(child.signal).toBeNull();
  expect(child.status, child.stderr).toBe(0);
  // The 2.x backport preserves overly deep input as literal text. This is
  // deliberately not asserted for 5.0.7, whose later depth issue remains open.
  expect(JSON.parse(child.stdout)).toEqual([pattern]);
}, 15_000);

describe.each(consumers)('coverage brace expansion: $name', ({ bracePath, expand, minimatch }) => {
  it('bounds the non-expanding-brace regression in a child process', () => {
    const pattern = `a${Array(30).fill('{}').join(',')}`;
    // GHSA-3jxr-9vmj-r5cp can hang vulnerable releases. Keep the fixture out
    // of the test runner and limit both child execution time and heap size.
    const child = spawnSync(process.execPath, [
      '--max-old-space-size=128',
      '--input-type=commonjs',
      '-e',
      "const mod = require(process.argv[1]); const expand = typeof mod === 'function' ? mod : mod.expand; console.log(JSON.stringify(expand(process.argv[2])));",
      bracePath,
      pattern,
    ], { encoding: 'utf8', timeout: 10_000, killSignal: 'SIGKILL' });

    expect(child.error).toBeUndefined();
    expect(child.signal).toBeNull();
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual([pattern]);
  }, 15_000);

  it.each([
    ['profiles/{dev,prod}.json', ['profiles/dev.json', 'profiles/prod.json']],
    ['{a,{b,c}}', ['a', 'b', 'c']],
    ['profile-{01..03}.json', ['profile-01.json', 'profile-02.json', 'profile-03.json']],
    ['file\\{a,b\\}', ['file{a,b}']],
    ['${TOKEN}', ['${TOKEN}']],
    ['{,test-}profile.json', ['profile.json', 'test-profile.json']],
  ])('preserves ordinary expansion for %s', (pattern, expected) => {
    expect(expand(pattern as string)).toEqual(expected);
  });

  it('preserves include/exclude matching through the actual minimatch consumer', () => {
    expect(minimatch('src/services/profileService.ts', 'src/**/{*.ts,*.js}')).toBe(true);
    expect(minimatch('tests/profileService.test.ts', '**/*.{test,spec}.ts')).toBe(true);
    expect(minimatch('src/services/profileService.ts', '**/*.{test,spec}.ts')).toBe(false);
  });
});
