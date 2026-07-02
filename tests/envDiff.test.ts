/**
 * Tests for the envDiff primitive and its formatters.
 *
 * The primitive (`diffEnvs`) is the test surface. The 4 builders
 * (`buildExportJson`, `buildSwitchJson`, `buildExportCommands`,
 * `buildSwitchCommands`) and the 3 formatters (`formatEnvJson`,
 * `formatExportShell`, `formatSwitchShell`) are tested through the
 * same expected outputs.
 */
import { describe, it, expect } from 'vitest';
import {
  diffEnvs,
  buildExportJson,
  buildSwitchJson,
  buildExportCommands,
  buildSwitchCommands,
  formatEnvJson,
  formatExportShell,
  formatSwitchShell,
} from '../src/engine/envDiff.js';
import { AppError } from '../src/errors.js';
import type { EnvConfig } from '../src/types/index.js';

const SAMPLE_ENV: EnvConfig = {
  ANTHROPIC_BASE_URL: 'https://api.test.com',
  ANTHROPIC_AUTH_TOKEN: 'test-token',
  ANTHROPIC_MODEL: 'test-model',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'test-sonnet',
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'test-opus',
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'test-haiku',
};

describe('diffEnvs (primitive)', () => {
  it('returns set for every non-empty key when oldEnv is null', () => {
    const diff = diffEnvs(null, SAMPLE_ENV);
    expect(diff.set).toEqual({
      ANTHROPIC_BASE_URL: 'https://api.test.com',
      ANTHROPIC_AUTH_TOKEN: 'test-token',
      ANTHROPIC_MODEL: 'test-model',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'test-sonnet',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'test-opus',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'test-haiku',
    });
    expect(diff.unset).toEqual([]);
  });

  it('returns empty diff for two empty envs', () => {
    expect(diffEnvs(null, {})).toEqual({ set: {}, unset: [] });
    expect(diffEnvs({}, {})).toEqual({ set: {}, unset: [] });
  });

  it('returns empty set when newEnv is empty and oldEnv has keys', () => {
    const old: EnvConfig = { A: '1', B: '2' };
    const diff = diffEnvs(old, {});
    expect(diff.set).toEqual({});
    expect(diff.unset).toEqual(['A', 'B']);
  });

  it('skips empty and whitespace-only values in newEnv', () => {
    const env: EnvConfig = { A: '1', B: '', C: '   ', D: '2' };
    const diff = diffEnvs(null, env);
    expect(diff.set).toEqual({ A: '1', D: '2' });
    expect(diff.unset).toEqual([]);
  });

  it('skips empty and whitespace-only values in oldEnv', () => {
    const old: EnvConfig = { A: '1', B: '', C: '   ' };
    const diff = diffEnvs(old, {});
    expect(diff.unset).toEqual(['A']);
  });

  it('keeps a key in newEnv even if it was empty in oldEnv', () => {
    const old: EnvConfig = { A: '', B: 'old' };
    const env: EnvConfig = { A: 'new', B: 'new' };
    const diff = diffEnvs(old, env);
    expect(diff.set).toEqual({ A: 'new', B: 'new' });
    expect(diff.unset).toEqual([]);
  });

  it('unsets old keys that are not in newEnv', () => {
    const old: EnvConfig = { A: 'a', B: 'b', C: 'c' };
    const env: EnvConfig = { A: 'a', C: 'c' };
    const diff = diffEnvs(old, env);
    expect(diff.set).toEqual({ A: 'a', C: 'c' });
    expect(diff.unset).toEqual(['B']);
  });

  it('overwrites a key value in newEnv even if same value as old', () => {
    const old: EnvConfig = { A: 'same' };
    const env: EnvConfig = { A: 'same' };
    const diff = diffEnvs(old, env);
    expect(diff.set).toEqual({ A: 'same' });
    expect(diff.unset).toEqual([]);
  });

  it('throws AppError for invalid env key in newEnv', () => {
    const env: EnvConfig = { '1invalid': 'value' };
    expect(() => diffEnvs(null, env)).toThrow(AppError);
  });

  it('throws AppError for invalid env key in oldEnv (about to be unset)', () => {
    const old: EnvConfig = { '1invalid': 'value' };
    expect(() => diffEnvs(old, {})).toThrow(AppError);
  });

  it('preserves insertion order for set and unset', () => {
    const old: EnvConfig = { A: '1', B: '2', C: '3' };
    const env: EnvConfig = { B: '2', D: '4' };
    const diff = diffEnvs(old, env);
    expect(Object.keys(diff.set)).toEqual(['B', 'D']);
    expect(diff.unset).toEqual(['A', 'C']);
  });
});

describe('buildExportJson', () => {
  it('matches diffEnvs(null, env) for the no-old-env case', () => {
    expect(buildExportJson(SAMPLE_ENV)).toEqual(diffEnvs(null, SAMPLE_ENV));
  });

  it('returns empty unset when there is no old env', () => {
    const out = buildExportJson(SAMPLE_ENV);
    expect(out.unset).toEqual([]);
  });
});

describe('buildSwitchJson', () => {
  it('matches diffEnvs(oldEnv, newEnv) verbatim', () => {
    const old: EnvConfig = { A: 'a', B: 'b' };
    const env: EnvConfig = { A: 'a', C: 'c' };
    expect(buildSwitchJson(old, env)).toEqual(diffEnvs(old, env));
  });

  it('treats null oldEnv the same as buildExportJson', () => {
    const out = buildSwitchJson(null, SAMPLE_ENV);
    expect(out).toEqual(buildExportJson(SAMPLE_ENV));
  });
});

describe('buildExportCommands', () => {
  it('emits one export line per non-empty key', () => {
    const out = buildExportCommands(SAMPLE_ENV);
    expect(out).toBe(
      "export ANTHROPIC_BASE_URL='https://api.test.com';\n" +
      "export ANTHROPIC_AUTH_TOKEN='test-token';\n" +
      "export ANTHROPIC_MODEL='test-model';\n" +
      "export ANTHROPIC_DEFAULT_SONNET_MODEL='test-sonnet';\n" +
      "export ANTHROPIC_DEFAULT_OPUS_MODEL='test-opus';\n" +
      "export ANTHROPIC_DEFAULT_HAIKU_MODEL='test-haiku';"
    );
  });

  it('skips empty values', () => {
    const env: EnvConfig = { A: '1', B: '', C: '3' };
    const out = buildExportCommands(env);
    expect(out).toBe("export A='1';\nexport C='3';");
  });

  it('emits empty string for empty env', () => {
    expect(buildExportCommands({})).toBe('');
  });

  it('quotes single quotes by escaping', () => {
    const env: EnvConfig = { A: "it's" };
    const out = buildExportCommands(env);
    expect(out).toBe("export A='it'\\''s';");
  });
});

describe('buildSwitchCommands', () => {
  it('emits unsets first, then exports', () => {
    const old: EnvConfig = { OLD_KEY: 'old' };
    const env: EnvConfig = { NEW_KEY: 'new' };
    const out = buildSwitchCommands(old, env);
    expect(out).toBe("unset OLD_KEY;\nexport NEW_KEY='new';");
  });

  it('keeps a key that exists in both with the new value', () => {
    const old: EnvConfig = { A: 'old-a', B: 'old-b' };
    const env: EnvConfig = { A: 'new-a', B: 'old-b' };
    const out = buildSwitchCommands(old, env);
    // A is in both, B is in both with the same value, no unsets; A re-exports.
    expect(out).toBe("export A='new-a';\nexport B='old-b';");
  });

  it('handles null oldEnv (same as buildExportCommands)', () => {
    const out = buildSwitchCommands(null, SAMPLE_ENV);
    expect(out).toBe(buildExportCommands(SAMPLE_ENV));
  });

  it('emits empty string for empty diff', () => {
    expect(buildSwitchCommands({}, {})).toBe('');
  });
});

describe('formatters (format* functions)', () => {
  it('formatEnvJson serializes diff with insertion order', () => {
    const diff = diffEnvs(null, { B: '2', A: '1' });
    // JSON.stringify preserves insertion order for string keys
    expect(formatEnvJson(diff)).toBe('{"set":{"B":"2","A":"1"},"unset":[]}');
  });

  it('formatExportShell ignores unset keys', () => {
    const diff: { set: Record<string, string>; unset: string[] } = {
      set: { A: '1' },
      unset: ['B'],
    };
    expect(formatExportShell(diff)).toBe("export A='1';");
  });

  it('formatSwitchShell emits unset lines before export lines', () => {
    const diff: { set: Record<string, string>; unset: string[] } = {
      set: { A: '1' },
      unset: ['B', 'C'],
    };
    expect(formatSwitchShell(diff)).toBe("unset B;\nunset C;\nexport A='1';");
  });

  it('formatSwitchShell handles an all-set diff', () => {
    const diff = diffEnvs(null, SAMPLE_ENV);
    expect(formatSwitchShell(diff)).toBe(buildExportCommands(SAMPLE_ENV));
  });

  it('formatSwitchShell handles an all-unset diff', () => {
    const diff: { set: Record<string, string>; unset: string[] } = {
      set: {},
      unset: ['A', 'B'],
    };
    expect(formatSwitchShell(diff)).toBe("unset A;\nunset B;");
  });

  it('formatSwitchShell emits empty string for empty diff', () => {
    expect(formatSwitchShell({ set: {}, unset: [] })).toBe('');
  });
});
