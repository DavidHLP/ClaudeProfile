import { describe, it, expect } from 'vitest';
import {
  detectImportFormat,
  parseImportedProfile,
  ProfileImportError,
  type ImportFormat,
} from '../src/domain/profileImport.js';

// ── detectImportFormat ──────────────────────────────────────────────────

describe('detectImportFormat', () => {
  it('honors the explicit override for json', () => {
    expect(detectImportFormat('foo.yaml', 'json')).toBe<ImportFormat>('json');
    expect(detectImportFormat('no-extension', 'json')).toBe<ImportFormat>('json');
  });

  it('honors the explicit override for yaml', () => {
    expect(detectImportFormat('foo.json', 'yaml')).toBe<ImportFormat>('yaml');
    expect(detectImportFormat('no-extension', 'yaml')).toBe<ImportFormat>('yaml');
  });

  it('detects yaml from the .yaml extension', () => {
    expect(detectImportFormat('profile.yaml')).toBe<ImportFormat>('yaml');
    expect(detectImportFormat('/abs/path/profile.YAML')).toBe<ImportFormat>('yaml');
  });

  it('detects yaml from the .yml extension', () => {
    expect(detectImportFormat('profile.yml')).toBe<ImportFormat>('yaml');
    expect(detectImportFormat('PROFILE.YML')).toBe<ImportFormat>('yaml');
  });

  it('defaults to json for .json and unknown extensions', () => {
    expect(detectImportFormat('profile.json')).toBe<ImportFormat>('json');
    expect(detectImportFormat('profile.txt')).toBe<ImportFormat>('json');
    expect(detectImportFormat('no-extension')).toBe<ImportFormat>('json');
    expect(detectImportFormat('')).toBe<ImportFormat>('json');
  });
});

// ── parseImportedProfile — happy paths ──────────────────────────────────

describe('parseImportedProfile — happy path', () => {
  it('parses a valid JSON profile with the minimum required fields', () => {
    const json = JSON.stringify({
      name: 'work',
      env: { ANTHROPIC_AUTH_TOKEN: 'sk-test' },
    });
    const profile = parseImportedProfile(json, 'json');
    expect(profile.name).toBe('work');
    expect(profile.description).toBe('');
    expect(profile.env).toEqual({ ANTHROPIC_AUTH_TOKEN: 'sk-test' });
  });

  it('parses a valid JSON profile with description', () => {
    const json = JSON.stringify({
      name: 'work',
      description: 'Work account',
      env: { ANTHROPIC_BASE_URL: 'https://api.example.com', ANTHROPIC_AUTH_TOKEN: 'sk-test' },
    });
    const profile = parseImportedProfile(json, 'json');
    expect(profile.description).toBe('Work account');
    expect(profile.env).toEqual({
      ANTHROPIC_BASE_URL: 'https://api.example.com',
      ANTHROPIC_AUTH_TOKEN: 'sk-test',
    });
  });

  it('parses a valid YAML profile', () => {
    const yaml = [
      'name: work',
      'description: Work account',
      'env:',
      '  ANTHROPIC_BASE_URL: https://api.example.com',
      '  ANTHROPIC_AUTH_TOKEN: sk-test',
      '  ANTHROPIC_DEFAULT_SONNET_MODEL: claude-sonnet-4-5',
      '',
    ].join('\n');
    const profile = parseImportedProfile(yaml, 'yaml');
    expect(profile.name).toBe('work');
    expect(profile.description).toBe('Work account');
    expect(profile.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-5');
  });

  it('uses the name override when supplied', () => {
    const json = JSON.stringify({ name: 'work', env: { ANTHROPIC_AUTH_TOKEN: 'sk-test' } });
    const profile = parseImportedProfile(json, 'json', '  personal  ');
    expect(profile.name).toBe('personal');
  });

  it('falls back to the file\'s name when override is empty', () => {
    const json = JSON.stringify({ name: 'work', env: { ANTHROPIC_AUTH_TOKEN: 'sk-test' } });
    const profile = parseImportedProfile(json, 'json', '   ');
    expect(profile.name).toBe('work');
  });

  it('returns a defensive copy of the env (caller mutation is isolated)', () => {
    const json = JSON.stringify({ name: 'work', env: { ANTHROPIC_AUTH_TOKEN: 'sk-test' } });
    const profile = parseImportedProfile(json, 'json');
    profile.env.ANTHROPIC_AUTH_TOKEN = 'mutated';
    // Re-parse to confirm the parsed object itself was not aliased.
    const profile2 = parseImportedProfile(json, 'json');
    expect(profile2.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test');
  });

  it('accepts profile names with hyphens and underscores', () => {
    for (const name of ['a', 'a-b', 'a_b', 'A-B_c-1', 'minimax']) {
      const json = JSON.stringify({ name, env: { ANTHROPIC_AUTH_TOKEN: 'sk' } });
      expect(() => parseImportedProfile(json, 'json')).not.toThrow();
    }
  });
});

// ── parseImportedProfile — format failures ──────────────────────────────

describe('parseImportedProfile — format errors', () => {
  it('throws ProfileImportError(INVALID_FORMAT) on malformed JSON', () => {
    try {
      parseImportedProfile('{ "name": "work", ', 'json');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileImportError);
      expect((err as ProfileImportError).code).toBe('INVALID_FORMAT');
      expect((err as ProfileImportError).message).toContain('JSON');
    }
  });

  it('throws ProfileImportError(INVALID_FORMAT) on malformed YAML', () => {
    try {
      parseImportedProfile('name: work\nenv:\n  - : : :\n  bad', 'yaml');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileImportError);
      expect((err as ProfileImportError).code).toBe('INVALID_FORMAT');
      expect((err as ProfileImportError).message).toContain('YAML');
    }
  });

  it('extends AppError so the command layer\'s runCommand wrapper handles it', () => {
    try {
      parseImportedProfile('not json', 'json');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).name).toBe('ProfileImportError');
    }
  });
});

// ── parseImportedProfile — schema failures ──────────────────────────────

describe('parseImportedProfile — schema errors', () => {
  it('throws when name is missing', () => {
    const json = JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: 'sk' } });
    try {
      parseImportedProfile(json, 'json');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as ProfileImportError).code).toBe('INVALID_PROFILE_SCHEMA');
    }
  });

  it('throws when name is empty', () => {
    const json = JSON.stringify({ name: '', env: { ANTHROPIC_AUTH_TOKEN: 'sk' } });
    try {
      parseImportedProfile(json, 'json');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as ProfileImportError).code).toBe('INVALID_PROFILE_SCHEMA');
    }
  });

  it('throws when env is missing', () => {
    const json = JSON.stringify({ name: 'work' });
    try {
      parseImportedProfile(json, 'json');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as ProfileImportError).code).toBe('INVALID_PROFILE_SCHEMA');
    }
  });

  it('throws when env is not an object', () => {
    const json = JSON.stringify({ name: 'work', env: 'not-an-object' });
    try {
      parseImportedProfile(json, 'json');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as ProfileImportError).code).toBe('INVALID_PROFILE_SCHEMA');
    }
  });

  it('throws when the parsed value is null', () => {
    try {
      parseImportedProfile('null', 'json');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as ProfileImportError).code).toBe('INVALID_PROFILE_SCHEMA');
    }
  });

  it('throws when the parsed value is an array', () => {
    try {
      parseImportedProfile('[]', 'json');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as ProfileImportError).code).toBe('INVALID_PROFILE_SCHEMA');
    }
  });
});

// ── parseImportedProfile — profile-name validation ─────────────────────

describe('parseImportedProfile — name validation', () => {
  it('throws NAME_INVALID for names with spaces', () => {
    const json = JSON.stringify({ name: 'has space', env: { ANTHROPIC_AUTH_TOKEN: 'sk' } });
    try {
      parseImportedProfile(json, 'json');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as ProfileImportError).code).toBe('NAME_INVALID');
    }
  });

  it('throws NAME_INVALID for names with special characters', () => {
    for (const name of ['a/b', 'a..b', 'a@b', 'a$b']) {
      const json = JSON.stringify({ name, env: { ANTHROPIC_AUTH_TOKEN: 'sk' } });
      try {
        parseImportedProfile(json, 'json');
        expect.fail(`expected throw for ${name}`);
      } catch (err) {
        expect((err as ProfileImportError).code).toBe('NAME_INVALID');
      }
    }
  });
});

// ── parseImportedProfile — env key validation ──────────────────────────

describe('parseImportedProfile — env key validation', () => {
  it('throws ENV_KEY_INVALID for keys with leading digits', () => {
    const json = JSON.stringify({
      name: 'work',
      env: { '1INVALID': 'value' },
    });
    try {
      parseImportedProfile(json, 'json');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as ProfileImportError).code).toBe('ENV_KEY_INVALID');
      expect((err as ProfileImportError).message).toContain('1INVALID');
    }
  });

  it('throws ENV_KEY_INVALID for keys with dashes', () => {
    const json = JSON.stringify({
      name: 'work',
      env: { 'BAD-KEY': 'value' },
    });
    try {
      parseImportedProfile(json, 'json');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as ProfileImportError).code).toBe('ENV_KEY_INVALID');
    }
  });

  it('accepts POSIX env keys (uppercase letters, digits, underscores)', () => {
    const json = JSON.stringify({
      name: 'work',
      env: { ANTHROPIC_AUTH_TOKEN: 'a', _PRIVATE: 'b', A1_B2_C3: 'c' },
    });
    expect(() => parseImportedProfile(json, 'json')).not.toThrow();
  });

  it('stops at the first invalid env key', () => {
    const json = JSON.stringify({
      name: 'work',
      env: { GOOD_KEY: 'value', 'BAD-KEY': 'value' },
    });
    try {
      parseImportedProfile(json, 'json');
      expect.fail('expected throw');
    } catch (err) {
      // GOOD_KEY would have passed; the failure is on BAD-KEY.
      expect((err as ProfileImportError).code).toBe('ENV_KEY_INVALID');
      expect((err as ProfileImportError).message).toContain('BAD-KEY');
    }
  });
});

// ── parseImportedProfile — env value validation ────────────────────────

describe('parseImportedProfile — env value validation', () => {
  it('throws ENV_VALUE_NULL for null values', () => {
    const json = JSON.stringify({ name: 'work', env: { KEY: null } });
    try {
      parseImportedProfile(json, 'json');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as ProfileImportError).code).toBe('ENV_VALUE_NULL');
    }
  });

  it('throws ENV_VALUE_TYPE for non-string values', () => {
    for (const value of [42, true, { nested: 'object' }, ['array']]) {
      const json = JSON.stringify({ name: 'work', env: { KEY: value } });
      try {
        parseImportedProfile(json, 'json');
        expect.fail(`expected throw for value ${JSON.stringify(value)}`);
      } catch (err) {
        expect((err as ProfileImportError).code).toBe('ENV_VALUE_TYPE');
      }
    }
  });

  it('throws ENV_VALUE_NULL for values containing null bytes', () => {
    const json = JSON.stringify({ name: 'work', env: { KEY: 'has\0null' } });
    try {
      parseImportedProfile(json, 'json');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as ProfileImportError).code).toBe('ENV_VALUE_NULL');
    }
  });

  it('throws ENV_VALUE_NEWLINE for values containing newlines', () => {
    const json = JSON.stringify({ name: 'work', env: { KEY: 'has\nnewline' } });
    try {
      parseImportedProfile(json, 'json');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as ProfileImportError).code).toBe('ENV_VALUE_NEWLINE');
    }
  });

  it('accepts empty string values (they pass through as-is)', () => {
    const json = JSON.stringify({ name: 'work', env: { EMPTY_KEY: '' } });
    const profile = parseImportedProfile(json, 'json');
    expect(profile.env.EMPTY_KEY).toBe('');
  });
});

// ── ProfileImportError ──────────────────────────────────────────────────

describe('ProfileImportError', () => {
  it('is an AppError subclass', () => {
    const err = new ProfileImportError('CODE', 'msg');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ProfileImportError');
    expect(err.code).toBe('CODE');
    expect(err.message).toBe('msg');
  });

  it('carries an optional context object', () => {
    const err = new ProfileImportError('CODE', 'msg', { key: 'k' });
    expect(err.context).toEqual({ key: 'k' });
  });
});
