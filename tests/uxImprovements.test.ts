import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileServiceImpl } from '../src/services/profileService.js';
import { InMemoryConfigStore } from '../src/config/inMemoryConfigStore.js';
import { envPresenter } from '../src/presenters/envRenderer.js';
import { noopPrompts, type CommandContext } from '../src/commands/context.js';
import type { Profile } from '../src/types/index.js';

function buildCtx(): { ctx: CommandContext; store: InMemoryConfigStore } {
  const store = new InMemoryConfigStore();
  // Use a real location string so the list-verbose path renders it.
  (store as { _location: string })._location = '/test/config';
  // Hack: InMemoryConfigStore returns null for getStoreLocation; we want
  // a stable string for the verbose-mode assertion. Override the method
  // on this instance only — keeps the test self-contained.
  (store as unknown as { getStoreLocation: () => string | null }).getStoreLocation = () => '/test/config';

  const service = new ProfileServiceImpl(store);
  return {
    ctx: { profiles: service, env: envPresenter, prompts: noopPrompts, isTTY: false },
    store,
  };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: 'test-profile',
    description: 'Test Provider',
    env: {
      ANTHROPIC_BASE_URL: 'https://api.test.com',
      ANTHROPIC_AUTH_TOKEN: 'test-token',
      ANTHROPIC_MODEL: 'test-model',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'test-sonnet',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'test-opus',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'test-haiku',
    },
    ...overrides,
  };
}

describe('UX Improvements', () => {
  let ctx: CommandContext;
  let store: InMemoryConfigStore;

  beforeEach(() => {
    const built = buildCtx();
    ctx = built.ctx;
    store = built.store;
    store.saveProfile(makeProfile());
  });

  describe('listCommand with verbose option', () => {
    it('should include store location in verbose mode', async () => {
      const { listCommand } = await import('../src/commands/list.js');
      const result = await listCommand(ctx, { verbose: true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('/test/config');
      }
    });

    it('should NOT include store location in normal mode', async () => {
      const { listCommand } = await import('../src/commands/list.js');
      const result = await listCommand(ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).not.toContain('/test/config');
      }
    });

    it('should show profile count in verbose mode', async () => {
      const { listCommand } = await import('../src/commands/list.js');
      const result = await listCommand(ctx, { verbose: true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('配置数量');
      }
    });

    it('should show extra env vars details in verbose mode', async () => {
      const { listCommand } = await import('../src/commands/list.js');
      const result = await listCommand(ctx, { verbose: true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('BASE URL');
      }
    });
  });

  describe('deleteCommand with yes option', () => {
    it('should skip warning for active profile when yes is true', async () => {
      ctx.profiles.setCurrentProfile('test-profile');
      const { deleteCommand } = await import('../src/commands/delete.js');
      const result = await deleteCommand(ctx, { profileName: 'test-profile', yes: true });

      expect(result.success).toBe(true);
      if (result.success) {
        // Active warning suppressed by --yes
        expect(result.output).not.toContain('当前激活');
      }
    });

    it('should show warning when deleting active profile without yes flag', async () => {
      ctx.profiles.setCurrentProfile('test-profile');
      const { deleteCommand } = await import('../src/commands/delete.js');
      const result = await deleteCommand(ctx, { profileName: 'test-profile' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('当前激活');
      }
    });

    it('should work with yes flag for non-active profile', async () => {
      ctx.profiles.setCurrentProfile('other-profile');
      const { deleteCommand } = await import('../src/commands/delete.js');
      const result = await deleteCommand(ctx, { profileName: 'test-profile', yes: true });

      expect(result.success).toBe(true);
    });
  });
});
