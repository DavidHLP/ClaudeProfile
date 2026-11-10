import { readFileSync } from 'node:fs';
import { describe, it, expect, mocks, beforeEach, afterEach } from './support/test.js';

describe('security boundary: removed development execution paths', () => {
  it('does not install the vulnerable runner or glob expansion chain', () => {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const removed = ['vitest', '@vitest/mocker', '@vitest/coverage-v8', 'tinypool', 'vite', 'test-exclude', 'glob', 'minimatch', 'brace-expansion'];
    for (const name of removed) {
      expect(Object.keys(lock.packages).some(key => key.endsWith(`node_modules/${name}`))).toBe(false);
    }
  });
  it('preserves function mock calls and implementation clearing', async () => {
    const fn = mocks.fn(async (value: string) => value.toUpperCase());
    expect(await fn('ok')).toBe('OK');
    expect(fn).toHaveBeenCalledWith('ok');
    mocks.clearAllMocks();
    expect(fn).not.toHaveBeenCalled();
    expect(await fn('again')).toBe('AGAIN');
  });
  it('restores absence of a stubbed environment variable', () => {
    const key = 'CLAUDE_PROFILE_TEST_TOOLCHAIN_ABSENT';
    const original = process.env[key];
    delete process.env[key];
    mocks.stubEnv(key, 'value');
    mocks.unstubAllEnvs();
    expect(Object.hasOwn(process.env, key)).toBe(false);
    if (original !== undefined) process.env[key] = original;
  });
});
