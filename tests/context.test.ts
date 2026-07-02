/**
 * Tests for the CommandContext seam.
 *
 * These tests prove the seam: that commands can be exercised against
 * a fresh in-memory service + fake prompts without touching the host
 * filesystem or any module-level singletons.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Profile, ProviderTemplate } from '../src/types/index.js';
import { InMemoryConfigStore } from '../src/config/inMemoryConfigStore.js';
import { ProfileServiceImpl } from '../src/services/profileService.js';
import { envPresenter } from '../src/presenters/envRenderer.js';
import { noopPrompts, realPrompts, type CommandContext, createTestContext } from '../src/commands/context.js';

describe('CommandContext', () => {
  describe('noopPrompts', () => {
    it('returns null for selectProfileFromList', async () => {
      const result = await noopPrompts.selectProfileFromList([], null);
      expect(result).toBeNull();
    });

    it('returns null for selectEditField', async () => {
      const profile: Profile = {
        name: 'p',
        description: 'd',
        env: {},
      };
      const result = await noopPrompts.selectEditField(profile);
      expect(result).toBeNull();
    });

    it('returns false for confirmAction', async () => {
      const result = await noopPrompts.confirmAction('confirm?');
      expect(result).toBe(false);
    });

    it('returns null for promptForNewName', async () => {
      const result = await noopPrompts.promptForNewName('default');
      expect(result).toBeNull();
    });

    it('returns custom provider from selectProvider', async () => {
      const result = await noopPrompts.selectProvider([]);
      expect(result.id).toBe('custom');
    });
  });

  describe('createTestContext', () => {
    it('returns a context with all required fields', () => {
      const ctx = createTestContext();
      expect(ctx.profiles).toBeDefined();
      expect(ctx.env).toBeDefined();
      expect(ctx.prompts).toBeDefined();
      expect(typeof ctx.isTTY).toBe('boolean');
    });

    it('uses noopPrompts by default', () => {
      const ctx = createTestContext();
      expect(ctx.prompts).toBe(noopPrompts);
    });

    it('honors overrides', () => {
      const customPrompts = { ...noopPrompts, confirmAction: async () => true };
      const ctx = createTestContext({ isTTY: true, prompts: customPrompts });
      expect(ctx.isTTY).toBe(true);
      expect(ctx.prompts).toBe(customPrompts);
    });
  });

  describe('realPrompts', () => {
    it('exposes every prompt function as a method', () => {
      const r = realPrompts as unknown as Record<string, unknown>;
      const expected = [
        'selectProvider',
        'inputProfileName',
        'promptForNewName',
        'inputApiToken',
        'inputBaseUrl',
        'inputSonnetModel',
        'inputOpusModel',
        'inputHaikuModel',
        'selectProfileFromList',
        'selectEditField',
        'selectBackup',
        'confirmAction',
        'promptInput',
      ];
      for (const fn of expected) {
        expect(typeof r[fn]).toBe('function');
      }
    });
  });

  describe('integration with ProfileServiceImpl', () => {
    let store: InMemoryConfigStore;
    let ctx: CommandContext;

    beforeEach(() => {
      store = new InMemoryConfigStore();
      const service = new ProfileServiceImpl(store);
      ctx = createTestContext({ profiles: service });
    });

    it('can list/save/get a profile through ctx.profiles', () => {
      const profile: Profile = {
        name: 'demo',
        description: 'Demo',
        env: { ANTHROPIC_BASE_URL: 'https://demo.com' },
      };
      ctx.profiles.saveProfile(profile);
      expect(ctx.profiles.listProfiles()).toEqual([profile]);
      expect(ctx.profiles.getProfile('demo')).toEqual(profile);
    });

    it('can format output through ctx.env without touching prompts', () => {
      const output = ctx.env.formatCreateSuccess('demo', '/tmp/demo.json');
      expect(output).toContain('demo');
    });
  });
});

describe('materializeProfile', () => {
  it('produces a profile with provider defaults + user credentials', async () => {
    const { materializeProfile } = await import('../src/templates/providers.js');
    const provider: ProviderTemplate = {
      id: 'minimax',
      name: 'MiniMax',
      description: 'MiniMax API',
      defaultBaseUrl: 'https://api.minimaxi.com',
      defaultModel: 'MiniMax-M3',
      envTemplate: {
        CLAUDE_CODE_SUBAGENT_MODEL: 'MiniMax-M3',
        ENABLE_TOOL_SEARCH: '0',
      },
    };
    const profile = materializeProfile(provider, {
      token: 'tkn',
      baseUrl: 'https://example.com',
      sonnetModel: 'sonnet',
      opusModel: 'opus',
      haikuModel: 'haiku',
    }, 'my-minimax');

    expect(profile.name).toBe('my-minimax');
    expect(profile.description).toBe('MiniMax');
    expect(profile.env.ANTHROPIC_AUTH_TOKEN).toBe('tkn');
    expect(profile.env.ANTHROPIC_BASE_URL).toBe('https://example.com');
    expect(profile.env.ANTHROPIC_MODEL).toBe('sonnet');
    expect(profile.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('sonnet');
    expect(profile.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('opus');
    expect(profile.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('haiku');
    // Provider template defaults are preserved
    expect(profile.env.CLAUDE_CODE_SUBAGENT_MODEL).toBe('MiniMax-M3');
    expect(profile.env.ENABLE_TOOL_SEARCH).toBe('0');
  });

  it('user input overrides provider defaults when keys collide', async () => {
    const { materializeProfile } = await import('../src/templates/providers.js');
    const provider: ProviderTemplate = {
      id: 'p',
      name: 'P',
      description: 'P',
      defaultBaseUrl: '',
      defaultModel: '',
      envTemplate: { ANTHROPIC_BASE_URL: 'https://provider-default.com' },
    };
    const profile = materializeProfile(provider, {
      token: 't',
      baseUrl: 'https://user-supplied.com',
      sonnetModel: 's',
      opusModel: 'o',
      haikuModel: 'h',
    }, 'p');

    expect(profile.env.ANTHROPIC_BASE_URL).toBe('https://user-supplied.com');
  });
});

describe('envPresenter.formatProfileDetail', () => {
  it('renders all canonical env fields with placeholder for empty', () => {
    const profile: Profile = {
      name: 'demo',
      description: 'Demo',
      env: { ANTHROPIC_AUTH_TOKEN: 'secret' },
    };
    const output = envPresenter.formatProfileDetail(profile, false);
    expect(output).toContain('demo');
    expect(output).toContain('BASE URL');
    expect(output).toContain('TOKEN');
    expect(output).toContain('MODEL');
    expect(output).toContain('SONNET');
    expect(output).toContain('OPUS');
    expect(output).toContain('HAIKU');
    // Token field shows 已设置, not the actual secret
    expect(output).toContain('已设置');
    expect(output).not.toContain('secret');
  });

  it('marks the current profile with an active marker', () => {
    const profile: Profile = {
      name: 'current',
      description: 'Current',
      env: {},
    };
    const output = envPresenter.formatProfileDetail(profile, true);
    // Active marker (●) is rendered in the first line
    const firstLine = output.split('\n')[0];
    expect(firstLine).toMatch(/[●○]/);
  });
});
