import { describe, it, expect, beforeEach } from 'vitest';
import { envPresenter, buildExportCommands, buildSwitchCommands } from '../src/presenters/envPresenter.js';
import type { EnvConfig, Profile } from '../src/types/index.js';

describe('EnvPresenter', () => {
  describe('formatBanner', () => {
    it('should return non-empty banner with ENV-SWITCHER title', () => {
      const banner = envPresenter.formatBanner();
      expect(banner.length).toBeGreaterThan(0);
      expect(banner).toContain('ENV-SWITCHER');
      expect(banner).toContain('+--');
    });
  });

  describe('buildExportCommands', () => {
    it('should generate export commands with single quotes', () => {
      const env: EnvConfig = {
        ANTHROPIC_BASE_URL: 'https://api.test.com',
        ANTHROPIC_AUTH_TOKEN: 'test-token',
        ANTHROPIC_MODEL: 'test-model',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'test-sonnet',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'test-opus',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'test-haiku',
      };

      const result = buildExportCommands(env);

      expect(result).toBe(
        "export ANTHROPIC_BASE_URL='https://api.test.com';\nexport ANTHROPIC_AUTH_TOKEN='test-token';\nexport ANTHROPIC_MODEL='test-model';\nexport ANTHROPIC_DEFAULT_SONNET_MODEL='test-sonnet';\nexport ANTHROPIC_DEFAULT_OPUS_MODEL='test-opus';\nexport ANTHROPIC_DEFAULT_HAIKU_MODEL='test-haiku';"
      );
    });

    it('should skip empty values', () => {
      const env: EnvConfig = {
        ANTHROPIC_BASE_URL: 'https://api.test.com',
        ANTHROPIC_AUTH_TOKEN: '',
        ANTHROPIC_MODEL: 'test-model',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'test-sonnet',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'test-opus',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'test-haiku',
      };

      const result = buildExportCommands(env);

      expect(result).not.toContain('ANTHROPIC_AUTH_TOKEN');
      expect(result).toContain("export ANTHROPIC_BASE_URL='https://api.test.com';");
    });

    it('should handle optional fields when present', () => {
      const env: EnvConfig = {
        ANTHROPIC_BASE_URL: 'https://api.test.com',
        ANTHROPIC_AUTH_TOKEN: 'token',
        ANTHROPIC_MODEL: 'model',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'sonnet',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'opus',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku',
        API_TIMEOUT_MS: '5000',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      };

      const result = buildExportCommands(env);

      expect(result).toContain("export API_TIMEOUT_MS='5000';");
      expect(result).toContain("export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC='1';");
    });
  });

  describe('buildSwitchCommands', () => {
    const baseEnv: EnvConfig = {
      ANTHROPIC_BASE_URL: 'https://api.test.com',
      ANTHROPIC_AUTH_TOKEN: 'token',
      ANTHROPIC_MODEL: 'model',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'sonnet',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'opus',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku',
    };

    it('should unset keys from old env not present in new env', () => {
      const oldEnv: EnvConfig = {
        ...baseEnv,
        API_TIMEOUT_MS: '3000000',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      };
      const newEnv: EnvConfig = {
        ...baseEnv,
        ANTHROPIC_BASE_URL: 'https://api.new.com',
        CLAUDE_CODE_SUBAGENT_MODEL: 'kimi-k2.5',
      };

      const result = buildSwitchCommands(oldEnv, newEnv);

      expect(result).toContain('unset API_TIMEOUT_MS;');
      expect(result).toContain('unset CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC;');
      expect(result).toContain("export CLAUDE_CODE_SUBAGENT_MODEL='kimi-k2.5';");
      expect(result).not.toContain('unset CLAUDE_CODE_SUBAGENT_MODEL');
      // Verify ordering: unsets before exports
      const unsetIndex = result.indexOf('unset API_TIMEOUT_MS');
      const exportIndex = result.indexOf('export ANTHROPIC_BASE_URL');
      expect(unsetIndex).toBeLessThan(exportIndex);
    });

    it('should produce only export lines when oldEnv is null', () => {
      const newEnv: EnvConfig = { ...baseEnv };
      const result = buildSwitchCommands(null, newEnv);

      expect(result).not.toContain('unset');
      expect(result).toContain('export');
    });

    it('should skip unset for keys with falsy values in old env', () => {
      const oldEnv: EnvConfig = { ...baseEnv, API_TIMEOUT_MS: '' };
      const newEnv: EnvConfig = { ...baseEnv, ANTHROPIC_BASE_URL: 'https://api.new.com' };

      const result = buildSwitchCommands(oldEnv, newEnv);

      expect(result).not.toContain('unset API_TIMEOUT_MS');
    });

    it('should handle identical envs (no unsets)', () => {
      const env: EnvConfig = { ...baseEnv };
      const result = buildSwitchCommands(env, env);

      expect(result).not.toContain('unset');
      expect(result).toContain('export');
    });
  });

  describe('formatProfileList', () => {
    it('should show empty state when no profiles', () => {
      const result = envPresenter.formatProfileList([], null);

      expect(result).toContain('Profile:');
      expect(result).toContain('available');
      expect(result).toContain('env-switcher create');
    });

    it('should show current profile with [*] marker', () => {
      const profiles: Profile[] = [{
        name: 'minimax',
        description: 'MiniMax',
        env: {
          ANTHROPIC_BASE_URL: 'https://api.test.com',
          ANTHROPIC_AUTH_TOKEN: 'token',
          ANTHROPIC_MODEL: 'model',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'sonnet',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'opus',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku',
        },
      }];

      const result = envPresenter.formatProfileList(profiles, 'minimax');

      expect(result).toContain('[*]');
      expect(result).toContain('minimax');
      expect(result).toContain('(current)');
    });

    it('should show inactive profile with [ ] marker', () => {
      const profiles: Profile[] = [{
        name: 'minimax',
        description: 'MiniMax',
        env: {
          ANTHROPIC_BASE_URL: 'https://api.test.com',
          ANTHROPIC_AUTH_TOKEN: 'token',
          ANTHROPIC_MODEL: 'model',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'sonnet',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'opus',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku',
        },
      }];

      const result = envPresenter.formatProfileList(profiles, null);

      expect(result).toContain('[ ]');
      expect(result).toContain('minimax');
      expect(result).not.toContain('(current)');
    });

    it('should show profile details', () => {
      const profiles: Profile[] = [{
        name: 'minimax',
        description: 'MiniMax API',
        env: {
          ANTHROPIC_BASE_URL: 'https://api.minimaxi.com',
          ANTHROPIC_AUTH_TOKEN: 'token',
          ANTHROPIC_MODEL: 'MiniMax-M2.7',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'MiniMax-M2.7',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'MiniMax-M2.7',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'MiniMax-M2.7',
        },
      }];

      const result = envPresenter.formatProfileList(profiles, null);

      expect(result).toContain('minimax');
      expect(result).toContain('MiniMax API');
    });
  });

  describe('formatSwitchSuccess', () => {
    it('should include switched to message with profile name', () => {
      const env: EnvConfig = {
        ANTHROPIC_BASE_URL: 'https://api.test.com',
        ANTHROPIC_AUTH_TOKEN: 'token',
        ANTHROPIC_MODEL: 'model',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'sonnet',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'opus',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku',
      };

      const result = envPresenter.formatSwitchSuccess('test-profile', env);

      expect(result).toContain('>>');
      expect(result).toContain('switched to:');
      expect(result).toContain('test-profile');
      expect(result).toContain('synced');
    });
  });

  describe('formatDeleteSuccess', () => {
    it('should mention active profile warning when deleting current', () => {
      const result = envPresenter.formatDeleteSuccess('test-profile', true);

      expect(result).toContain('已删除');
      expect(result).toContain('当前激活');
    });

    it('should not mention active warning when deleting inactive', () => {
      const result = envPresenter.formatDeleteSuccess('test-profile', false);

      expect(result).toContain('已删除');
      expect(result).not.toContain('当前激活');
    });
  });

  describe('formatError', () => {
    it('should format error message with ANSI color', () => {
      const result = envPresenter.formatError('Something went wrong');

      expect(result).toContain('错误');
      expect(result).toContain('Something went wrong');
    });
  });

  describe('formatNoProfiles', () => {
    it('should show message to create profile', () => {
      const result = envPresenter.formatNoProfiles();

      expect(result).toContain('create');
    });
  });

  describe('formatCreateSuccess', () => {
    it('should include profile name in output', () => {
      const result = envPresenter.formatCreateSuccess('test-profile', '/path/to/test-profile.json');

      expect(result).toContain('test-profile');
      expect(result).toContain('已创建');
    });
  });
});
