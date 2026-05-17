import { describe, it, expect } from 'vitest';
import { computeSettingsEnv, MANAGED_SETTINGS_KEYS } from '../src/engine/settingsSync.js';
import type { EnvConfig } from '../src/types/index.js';

describe('settingsSync', () => {
  describe('MANAGED_SETTINGS_KEYS', () => {
    it('should contain exactly 7 keys', () => {
      expect(MANAGED_SETTINGS_KEYS).toHaveLength(7);
    });

    it('should include all required keys', () => {
      expect(MANAGED_SETTINGS_KEYS).toContain('ANTHROPIC_BASE_URL');
      expect(MANAGED_SETTINGS_KEYS).toContain('ANTHROPIC_AUTH_TOKEN');
      expect(MANAGED_SETTINGS_KEYS).toContain('ANTHROPIC_DEFAULT_HAIKU_MODEL');
      expect(MANAGED_SETTINGS_KEYS).toContain('ANTHROPIC_DEFAULT_SONNET_MODEL');
      expect(MANAGED_SETTINGS_KEYS).toContain('ANTHROPIC_DEFAULT_OPUS_MODEL');
      expect(MANAGED_SETTINGS_KEYS).toContain('ANTHROPIC_MODEL');
      expect(MANAGED_SETTINGS_KEYS).toContain('CLAUDE_CODE_SUBAGENT_MODEL');
    });
  });

  describe('computeSettingsEnv', () => {
    it('should write new profile managed keys into empty settings env', () => {
      const newEnv: EnvConfig = {
        ANTHROPIC_BASE_URL: 'https://api.minimaxi.com',
        ANTHROPIC_AUTH_TOKEN: 'token-123',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'model-haiku',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'model-sonnet',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'model-opus',
        ANTHROPIC_MODEL: 'model-main',
        CLAUDE_CODE_SUBAGENT_MODEL: 'model-sub',
      };

      const result = computeSettingsEnv(null, newEnv, {});

      expect(result).toEqual({
        ANTHROPIC_BASE_URL: 'https://api.minimaxi.com',
        ANTHROPIC_AUTH_TOKEN: 'token-123',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'model-haiku',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'model-sonnet',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'model-opus',
        ANTHROPIC_MODEL: 'model-main',
        CLAUDE_CODE_SUBAGENT_MODEL: 'model-sub',
      });
    });

    it('should overwrite existing managed keys with new profile values', () => {
      const oldEnv: EnvConfig = {
        ANTHROPIC_BASE_URL: 'https://old.com',
        ANTHROPIC_AUTH_TOKEN: 'old-token',
      };
      const newEnv: EnvConfig = {
        ANTHROPIC_BASE_URL: 'https://new.com',
        ANTHROPIC_AUTH_TOKEN: 'new-token',
      };
      const currentSettingsEnv = {
        ANTHROPIC_BASE_URL: 'https://old.com',
        ANTHROPIC_AUTH_TOKEN: 'old-token',
      };

      const result = computeSettingsEnv(oldEnv, newEnv, currentSettingsEnv);

      expect(result.ANTHROPIC_BASE_URL).toBe('https://new.com');
      expect(result.ANTHROPIC_AUTH_TOKEN).toBe('new-token');
    });

    it('should delete old-only managed keys when switching to profile without them', () => {
      const oldEnv: EnvConfig = {
        ANTHROPIC_BASE_URL: 'https://old.com',
        ANTHROPIC_AUTH_TOKEN: 'old-token',
        ANTHROPIC_MODEL: 'old-model',
        CLAUDE_CODE_SUBAGENT_MODEL: 'old-sub',
      };
      const newEnv: EnvConfig = {
        ANTHROPIC_BASE_URL: 'https://new.com',
      };
      const currentSettingsEnv = {
        ANTHROPIC_BASE_URL: 'https://old.com',
        ANTHROPIC_AUTH_TOKEN: 'old-token',
        ANTHROPIC_MODEL: 'old-model',
        CLAUDE_CODE_SUBAGENT_MODEL: 'old-sub',
      };

      const result = computeSettingsEnv(oldEnv, newEnv, currentSettingsEnv);

      expect(result.ANTHROPIC_BASE_URL).toBe('https://new.com');
      expect(result.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
      expect(result.ANTHROPIC_MODEL).toBeUndefined();
      expect(result.CLAUDE_CODE_SUBAGENT_MODEL).toBeUndefined();
    });

    it('should preserve user-set keys in settings env', () => {
      const newEnv: EnvConfig = {
        ANTHROPIC_BASE_URL: 'https://api.test.com',
      };
      const currentSettingsEnv = {
        ANTHROPIC_BASE_URL: 'https://old.com',
        CUSTOM_KEY: 'user-value',
        ANOTHER_KEY: 'another-value',
      };

      const result = computeSettingsEnv(null, newEnv, currentSettingsEnv);

      expect(result.CUSTOM_KEY).toBe('user-value');
      expect(result.ANOTHER_KEY).toBe('another-value');
      expect(result.ANTHROPIC_BASE_URL).toBe('https://api.test.com');
    });

    it('should not write undefined or empty values from new profile', () => {
      const newEnv: EnvConfig = {
        ANTHROPIC_BASE_URL: 'https://api.test.com',
        ANTHROPIC_AUTH_TOKEN: undefined,
        ANTHROPIC_MODEL: '',
      };
      const currentSettingsEnv: Record<string, string> = {};

      const result = computeSettingsEnv(null, newEnv, currentSettingsEnv);

      expect(result.ANTHROPIC_BASE_URL).toBe('https://api.test.com');
      expect(result.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
      expect(result.ANTHROPIC_MODEL).toBeUndefined();
    });

    it('should not delete key if old env also has undefined value', () => {
      const oldEnv: EnvConfig = {
        ANTHROPIC_AUTH_TOKEN: undefined,
      };
      const newEnv: EnvConfig = {
        ANTHROPIC_BASE_URL: 'https://api.test.com',
      };
      const currentSettingsEnv = {
        ANTHROPIC_AUTH_TOKEN: 'user-set-token',
      };

      const result = computeSettingsEnv(oldEnv, newEnv, currentSettingsEnv);

      expect(result.ANTHROPIC_AUTH_TOKEN).toBe('user-set-token');
    });

    it('should handle partial profile with only some managed keys', () => {
      const newEnv: EnvConfig = {
        ANTHROPIC_BASE_URL: 'https://api.test.com',
        ANTHROPIC_AUTH_TOKEN: 'token',
      };
      const currentSettingsEnv: Record<string, string> = {};

      const result = computeSettingsEnv(null, newEnv, currentSettingsEnv);

      expect(Object.keys(result)).toHaveLength(2);
      expect(result.ANTHROPIC_BASE_URL).toBe('https://api.test.com');
      expect(result.ANTHROPIC_AUTH_TOKEN).toBe('token');
    });

    it('should not touch unmanaged keys like API_TIMEOUT_MS', () => {
      const oldEnv: EnvConfig = {
        ANTHROPIC_BASE_URL: 'https://old.com',
        API_TIMEOUT_MS: '3000000',
      };
      const newEnv: EnvConfig = {
        ANTHROPIC_BASE_URL: 'https://new.com',
      };
      const currentSettingsEnv = {
        ANTHROPIC_BASE_URL: 'https://old.com',
        API_TIMEOUT_MS: '3000000',
      };

      const result = computeSettingsEnv(oldEnv, newEnv, currentSettingsEnv);

      expect(result.API_TIMEOUT_MS).toBe('3000000');
      expect(result.ANTHROPIC_BASE_URL).toBe('https://new.com');
    });
  });
});
