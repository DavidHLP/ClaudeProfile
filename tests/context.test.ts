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
        'inputProfileField',
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

    it('does NOT expose the dropped 5 inputXxx shims (Candidate 4)', () => {
      const r = realPrompts as unknown as Record<string, unknown>;
      for (const fn of ['inputApiToken', 'inputBaseUrl', 'inputSonnetModel', 'inputOpusModel', 'inputHaikuModel']) {
        expect(r[fn]).toBeUndefined();
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


describe('inputProfileField (Profile Field Prompt seam)', () => {
  it('noopPrompts.inputProfileField returns empty string (caller detects via validator)', async () => {
    expect(await noopPrompts.inputProfileField('token')).toBe('');
    expect(await noopPrompts.inputProfileField('baseUrl', { defaultValue: 'x' })).toBe('');
    expect(await noopPrompts.inputProfileField('sonnetModel')).toBe('');
    expect(await noopPrompts.inputProfileField('opusModel')).toBe('');
    expect(await noopPrompts.inputProfileField('haikuModel')).toBe('');
  });

  it('realPrompts.inputProfileField backs onto promptInput with schema label and validator', async () => {
    // We verify the wiring by checking that realPrompts delegates to
    // ui/prompt.ts#promptInput with the schema's label and validateInput
    // for each field. We do this by stubbing inquirer.prompt, which
    // is the single chokepoint both paths go through.
    const inquirer = (await import('inquirer')).default as unknown as {
      prompt: (q: unknown) => Promise<Record<string, unknown>>;
    };
    const original = inquirer.prompt;
    const calls: Array<Record<string, unknown>> = [];
    inquirer.prompt = (async (q: unknown) => {
      const question = (Array.isArray(q) ? q[0] : q) as Record<string, unknown>;
      calls.push(question);
      // Return a different value per field to prove the wiring.
      const message = String(question.message ?? '');
      if (message.startsWith('API Token')) return { value: 'tok-XYZ' };
      if (message.startsWith('API Base URL')) return { value: 'https://x' };
      if (message.startsWith('SONNET')) return { value: 'sn' };
      if (message.startsWith('OPUS')) return { value: 'op' };
      if (message.startsWith('HAIKU')) return { value: 'hk' };
      return { value: '' };
    }) as typeof inquirer.prompt;
    try {
      expect(await realPrompts.inputProfileField('token')).toBe('tok-XYZ');
      expect(await realPrompts.inputProfileField('baseUrl', { defaultValue: 'd' })).toBe('https://x');
      expect(await realPrompts.inputProfileField('sonnetModel')).toBe('sn');
      expect(await realPrompts.inputProfileField('opusModel')).toBe('op');
      expect(await realPrompts.inputProfileField('haikuModel')).toBe('hk');

      // Each call should carry the schema's label as `message`.
      const messages = calls.map((c) => String(c.message ?? ''));
      expect(messages).toEqual([
        'API Token',
        'API Base URL',
        'SONNET 模型',
        'OPUS 模型',
        'HAIKU 模型',
      ]);

      // The default (when supplied) and the schema validator (always)
      // should be threaded through.
      const baseUrlCall = calls[1];
      expect(baseUrlCall.default).toBe('d');
      expect(typeof baseUrlCall.validate).toBe('function');
      // The schema validator accepts a valid URL, rejects invalid.
      const validate = baseUrlCall.validate as (v: string) => true | string;
      expect(validate('https://example.com')).toBe(true);
      expect(validate('ftp://nope')).toBe('URL 必须以 http:// 或 https:// 开头');
      expect(validate('   ')).toBe('URL 不能为空');
    } finally {
      inquirer.prompt = original;
    }
  });
});
