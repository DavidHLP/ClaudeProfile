import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { ClaudeSettingsStoreImpl } from '../src/config/claudeSettingsStore.js';
import { SettingsFileCorruptError } from '../src/errors.js';

describe('ClaudeSettingsStoreImpl', () => {
  let tempDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'env-switcher-test-'));
    settingsPath = join(tempDir, 'settings.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('readEnv', () => {
    it('should return empty object when file does not exist', () => {
      const store = new ClaudeSettingsStoreImpl(settingsPath);
      expect(store.readEnv()).toEqual({});
    });

    it('should return empty object when file has no env field', () => {
      writeFileSync(settingsPath, JSON.stringify({ model: 'opus', theme: 'dark' }), 'utf-8');
      const store = new ClaudeSettingsStoreImpl(settingsPath);
      expect(store.readEnv()).toEqual({});
    });

    it('should return empty object when JSON is malformed', () => {
      writeFileSync(settingsPath, '{ invalid json', 'utf-8');
      const store = new ClaudeSettingsStoreImpl(settingsPath);
      expect(store.readEnv()).toEqual({});
    });

    it('should return env object when valid', () => {
      const settings = {
        model: 'opus',
        env: {
          ANTHROPIC_BASE_URL: 'https://api.test.com',
          ANTHROPIC_AUTH_TOKEN: 'token-123',
        },
      };
      writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8');
      const store = new ClaudeSettingsStoreImpl(settingsPath);
      expect(store.readEnv()).toEqual({
        ANTHROPIC_BASE_URL: 'https://api.test.com',
        ANTHROPIC_AUTH_TOKEN: 'token-123',
      });
    });

    it('should filter out non-string values from env', () => {
      const settings = {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.test.com',
          SOME_NUMBER: 42,
          SOME_BOOL: true,
          SOME_NULL: null,
        },
      };
      writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8');
      const store = new ClaudeSettingsStoreImpl(settingsPath);
      const result = store.readEnv();
      expect(result).toEqual({ ANTHROPIC_BASE_URL: 'https://api.test.com' });
    });

    it('should return empty object when env is an array', () => {
      const settings = { env: ['not', 'an', 'object'] };
      writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8');
      const store = new ClaudeSettingsStoreImpl(settingsPath);
      expect(store.readEnv()).toEqual({});
    });
  });

  describe('writeEnv', () => {
    it('should create file when it does not exist', () => {
      const store = new ClaudeSettingsStoreImpl(settingsPath);
      store.writeEnv({ ANTHROPIC_BASE_URL: 'https://api.test.com' });

      expect(existsSync(settingsPath)).toBe(true);
      const written = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(written.env).toEqual({ ANTHROPIC_BASE_URL: 'https://api.test.com' });
    });

    it('should preserve non-env fields when writing', () => {
      const settings = {
        model: 'opus',
        theme: 'dark',
        hooks: { PreToolUse: [] },
        env: { ANTHROPIC_BASE_URL: 'https://old.com' },
      };
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const store = new ClaudeSettingsStoreImpl(settingsPath);
      store.writeEnv({ ANTHROPIC_BASE_URL: 'https://new.com' });

      const written = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(written.model).toBe('opus');
      expect(written.theme).toBe('dark');
      expect(written.hooks).toEqual({ PreToolUse: [] });
      expect(written.env).toEqual({ ANTHROPIC_BASE_URL: 'https://new.com' });
    });

    it('should add env field if it does not exist', () => {
      const settings = { model: 'sonnet', theme: 'light' };
      writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8');

      const store = new ClaudeSettingsStoreImpl(settingsPath);
      store.writeEnv({ ANTHROPIC_BASE_URL: 'https://api.test.com' });

      const written = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(written.model).toBe('sonnet');
      expect(written.env).toEqual({ ANTHROPIC_BASE_URL: 'https://api.test.com' });
    });

    it('should throw SettingsFileCorruptError when file has malformed JSON', () => {
      writeFileSync(settingsPath, '{ broken', 'utf-8');
      const store = new ClaudeSettingsStoreImpl(settingsPath);

      expect(() => store.writeEnv({ KEY: 'value' })).toThrow(SettingsFileCorruptError);
    });

    it('should round-trip: write then read returns same env', () => {
      const store = new ClaudeSettingsStoreImpl(settingsPath);
      const env = {
        ANTHROPIC_BASE_URL: 'https://api.test.com',
        ANTHROPIC_AUTH_TOKEN: 'token-123',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'model-sonnet',
      };
      store.writeEnv(env);
      expect(store.readEnv()).toEqual(env);
    });
  });
});
