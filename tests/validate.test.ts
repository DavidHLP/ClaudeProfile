import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileServiceImpl } from '../src/services/profileService.js';
import { InMemoryConfigStore } from '../src/config/inMemoryConfigStore.js';
import { envPresenter } from '../src/presenters/envRenderer.js';
import { noopPrompts, type CommandContext } from '../src/commands/context.js';
import type { Profile, EnvConfig } from '../src/types/index.js';

const DEFAULT_ENV: EnvConfig = {
  ANTHROPIC_BASE_URL: 'https://api.test.com',
  ANTHROPIC_AUTH_TOKEN: 'test-token',
  ANTHROPIC_MODEL: 'test-model',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'test-sonnet',
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'test-opus',
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'test-haiku',
};

function createProfile(
  envOverrides: Partial<EnvConfig> = {},
  profileOverrides: Partial<Profile> = {}
): Profile {
  return {
    name: 'test-profile',
    description: 'Test Provider',
    env: { ...DEFAULT_ENV, ...envOverrides },
    ...profileOverrides,
  };
}

function buildCtx(): { ctx: CommandContext; store: InMemoryConfigStore } {
  const store = new InMemoryConfigStore();
  const service = new ProfileServiceImpl(store);
  return {
    ctx: { profiles: service, env: envPresenter, prompts: noopPrompts, isTTY: false },
    store,
  };
}

describe('validateCommand', () => {
  let store: InMemoryConfigStore;
  let ctx: CommandContext;

  beforeEach(() => {
    const built = buildCtx();
    store = built.store;
    ctx = built.ctx;
  });

  describe('validateProfiles', () => {
    it('should return success for valid profiles', async () => {
      store.saveProfile(createProfile());
      const { validateCommand } = await import('../src/commands/validate.js');
      const result = await validateCommand(ctx);

      expect(result.success).toBe(true);
    });

    it('should handle empty profile list', async () => {
      const { validateCommand } = await import('../src/commands/validate.js');
      const result = await validateCommand(ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('没有配置需要验证');
      }
    });

    it('should detect missing token', async () => {
      store.saveProfile(createProfile({ ANTHROPIC_AUTH_TOKEN: '' }));
      const { validateCommand } = await import('../src/commands/validate.js');
      const result = await validateCommand(ctx);

      expect(result.success).toBe(false);
    });

    it('should detect missing base URL', async () => {
      store.saveProfile(createProfile({ ANTHROPIC_BASE_URL: '' }));
      const { validateCommand } = await import('../src/commands/validate.js');
      const result = await validateCommand(ctx);

      expect(result.success).toBe(false);
    });

    it('should detect invalid URL format', async () => {
      store.saveProfile(createProfile({ ANTHROPIC_BASE_URL: 'not-a-url' }));
      const { validateCommand } = await import('../src/commands/validate.js');
      const result = await validateCommand(ctx);

      expect(result.success).toBe(false);
    });

    it('should warn when current profile is missing all model slots', async () => {
      // The schema treats SONNET as a single field backed by two env
      // keys (ANTHROPIC_DEFAULT_SONNET_MODEL + ANTHROPIC_MODEL). The
      // field is "set" if ANY of its env keys has a value, so to
      // trigger a warning we must clear both.
      store.saveProfile(createProfile({
        ANTHROPIC_MODEL: '',
        ANTHROPIC_DEFAULT_SONNET_MODEL: '',
      }));
      ctx.profiles.setCurrentProfile('test-profile');
      const { validateCommand } = await import('../src/commands/validate.js');
      const result = await validateCommand(ctx);

      // Warnings are non-fatal — success stays true
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('ANTHROPIC_DEFAULT_SONNET_MODEL');
        expect(result.output).toContain('ANTHROPIC_MODEL');
      }
    });

    it('should check all required fields for completeness', async () => {
      store.saveProfile(createProfile({
        ANTHROPIC_MODEL: '',
        ANTHROPIC_DEFAULT_SONNET_MODEL: '',
        ANTHROPIC_DEFAULT_OPUS_MODEL: '',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: '',
      }));
      const { validateCommand } = await import('../src/commands/validate.js');
      const result = await validateCommand(ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('SONNET');
        expect(result.output).toContain('OPUS');
        expect(result.output).toContain('HAIKU');
      }
    });

    it('should include verbose details when verbose option is true', async () => {
      store.saveProfile(createProfile());
      const { validateCommand } = await import('../src/commands/validate.js');
      const result = await validateCommand(ctx, { verbose: true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('test-profile');
        expect(result.output).toContain('配置目录');
      }
    });
  });
});
