import { describe, it, expect, beforeEach } from 'vitest';
import type { Profile } from '../src/types/index.js';
import { ProfileNotFoundError } from '../src/errors.js';
import { ProfileServiceImpl } from '../src/services/profileService.js';
import { InMemoryConfigStore } from '../src/config/inMemoryConfigStore.js';
import { envPresenter } from '../src/presenters/envRenderer.js';
import { noopPrompts, type CommandContext } from '../src/commands/context.js';

// ── Fixture builders ─────────────────────────────────────────────────────

function createMockProfile(overrides: Partial<Profile> & { env?: Record<string, string> } = {}): Profile {
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
      ...(overrides.env || {}),
    },
    ...overrides,
  } as Profile;
}

/**
 * Build a fresh CommandContext backed by an in-memory store and the
 * real EnvPresenter. The noopPrompts default is safe because every
 * test in this file exercises a non-interactive command path.
 */
function buildCtx(store: InMemoryConfigStore = new InMemoryConfigStore()): {
  ctx: CommandContext;
  store: InMemoryConfigStore;
} {
  const service = new ProfileServiceImpl(store);
  const ctx: CommandContext = {
    profiles: service,
    env: envPresenter,
    prompts: noopPrompts,
    isTTY: false,
  };
  return { ctx, store };
}

describe('Commands', () => {
  let store: InMemoryConfigStore;
  let ctx: CommandContext;

  beforeEach(() => {
    const built = buildCtx();
    store = built.store;
    ctx = built.ctx;
    store.saveProfile(createMockProfile());
  });

  // ── listCommand ────────────────────────────────────────────────────────

  describe('listCommand', () => {
    it('should return success with formatted profile list', async () => {
      const { listCommand } = await import('../src/commands/list.js');
      const result = await listCommand(ctx);

      expect(result.success).toBe(true);
      expect(result.output).toContain('test-profile');
      expect(result.output).toContain('Test Provider');
    });

    it('should return no profiles message when empty', async () => {
      // Fresh store with no profiles
      const built = buildCtx();
      const result = await import('../src/commands/list.js').then((m) =>
        m.listCommand(built.ctx)
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('没有可用的配置');
    });
  });

  // ── switchCommand ──────────────────────────────────────────────────────

  describe('switchCommand', () => {
    it('should return export commands in non-TTY mode', async () => {
      const { switchCommand } = await import('../src/commands/switch.js');
      const result = await switchCommand(ctx, { profileName: 'test-profile' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('export ANTHROPIC_BASE_URL');
      expect(result.output).not.toContain('已切换到配置');
    });

    it('should return formatted success in TTY mode', async () => {
      const ttyCtx: CommandContext = { ...ctx, isTTY: true };
      const { switchCommand } = await import('../src/commands/switch.js');
      const result = await switchCommand(ttyCtx, { profileName: 'test-profile' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('已切换到');
      expect(result.output).toContain('test-profile');
    });

    it('should return error for non-existent profile', async () => {
      const { switchCommand } = await import('../src/commands/switch.js');
      const result = await switchCommand(ctx, { profileName: 'non-existent' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('non-existent');
      }
    });

    it('should mark the switched profile as current', async () => {
      const { switchCommand } = await import('../src/commands/switch.js');
      await switchCommand(ctx, { profileName: 'test-profile' });

      expect(ctx.profiles.getCurrentProfile()).toBe('test-profile');
    });

    it('should include unset commands when switching from a different profile', async () => {
      const oldProfile = createMockProfile({
        name: 'old-profile',
        env: {
          ANTHROPIC_BASE_URL: 'https://old.com',
          ANTHROPIC_AUTH_TOKEN: 'old-token',
          ANTHROPIC_MODEL: 'old-model',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'old-sonnet',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'old-opus',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'old-haiku',
          API_TIMEOUT_MS: '3000000',
        },
      });
      store.saveProfile(oldProfile);
      ctx.profiles.setCurrentProfile('old-profile');

      const { switchCommand } = await import('../src/commands/switch.js');
      const result = await switchCommand(ctx, { profileName: 'test-profile' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('unset API_TIMEOUT_MS');
      }
    });

    it('should not mark current profile in dry-run mode', async () => {
      const { switchCommand } = await import('../src/commands/switch.js');
      const result = await switchCommand(ctx, { profileName: 'test-profile', dryRun: true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('dry-run');
      }
      expect(ctx.profiles.getCurrentProfile()).not.toBe('test-profile');
    });

    it('should not write settings.json (env injected via shell only)', async () => {
      const { switchCommand } = await import('../src/commands/switch.js');
      const result = await switchCommand(ctx, { profileName: 'test-profile' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toMatch(/^export ANTHROPIC_/);
        expect(result.output).not.toContain('settings.json');
      }
    });
  });

  // ── deleteCommand ──────────────────────────────────────────────────────

  describe('deleteCommand', () => {
    it('should return success when deleting profile', async () => {
      const { deleteCommand } = await import('../src/commands/delete.js');
      const result = await deleteCommand(ctx, { profileName: 'test-profile' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('已删除');
      }
      expect(ctx.profiles.profileExists('test-profile')).toBe(false);
    });

    it('should include active warning when deleting current profile', async () => {
      ctx.profiles.setCurrentProfile('test-profile');
      const { deleteCommand } = await import('../src/commands/delete.js');
      const result = await deleteCommand(ctx, { profileName: 'test-profile' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('当前激活');
      }
    });

    it('should return error for non-existent profile', async () => {
      const { deleteCommand } = await import('../src/commands/delete.js');
      const result = await deleteCommand(ctx, { profileName: 'non-existent' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('non-existent');
      }
    });
  });

  // ── createCommand ──────────────────────────────────────────────────────

  describe('createCommand', () => {
    it('should create profile with correct env values', async () => {
      const { createCommand } = await import('../src/commands/create.js');
      const result = await createCommand(ctx, {
        providerId: 'minimax',
        profileName: 'new-profile',
        token: 'new-token',
        baseUrl: 'https://api.new.com',
        sonnetModel: 'new-sonnet',
        opusModel: 'new-opus',
        haikuModel: 'new-haiku',
      });

      expect(result.success).toBe(true);
      const saved = ctx.profiles.getProfile('new-profile');
      expect(saved.env.ANTHROPIC_AUTH_TOKEN).toBe('new-token');
      expect(saved.env.ANTHROPIC_BASE_URL).toBe('https://api.new.com');
      expect(saved.env.ANTHROPIC_MODEL).toBe('new-sonnet');
    });

    it('should return error for unknown provider', async () => {
      const { createCommand } = await import('../src/commands/create.js');
      const result = await createCommand(ctx, {
        providerId: 'no-such-provider',
        profileName: 'x',
        token: 't',
        baseUrl: 'https://x.com',
        sonnetModel: 's',
        opusModel: 'o',
        haikuModel: 'h',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('未知的 Provider');
      }
    });
  });

  // ── editCommand ────────────────────────────────────────────────────────

  describe('editCommand', () => {
    it('should update only the specified field', async () => {
      const { editCommand } = await import('../src/commands/edit.js');
      await editCommand(ctx, {
        profileName: 'test-profile',
        field: 'token',
        value: 'updated-token',
      });

      const updated = ctx.profiles.getProfile('test-profile');
      expect(updated.env.ANTHROPIC_AUTH_TOKEN).toBe('updated-token');
      // Other fields unchanged
      expect(updated.env.ANTHROPIC_BASE_URL).toBe('https://api.test.com');
    });

    it('should sync ANTHROPIC_MODEL and ANTHROPIC_DEFAULT_SONNET_MODEL when editing sonnetModel', async () => {
      const { editCommand } = await import('../src/commands/edit.js');
      await editCommand(ctx, {
        profileName: 'test-profile',
        field: 'sonnetModel',
        value: 'new-sonnet',
      });

      const updated = ctx.profiles.getProfile('test-profile');
      expect(updated.env.ANTHROPIC_MODEL).toBe('new-sonnet');
      expect(updated.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('new-sonnet');
    });

    it('should leave other env fields unchanged when editing one field', async () => {
      const { editCommand } = await import('../src/commands/edit.js');
      await editCommand(ctx, {
        profileName: 'test-profile',
        field: 'opusModel',
        value: 'new-opus',
      });

      const updated = ctx.profiles.getProfile('test-profile');
      expect(updated.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('new-opus');
      expect(updated.env.ANTHROPIC_AUTH_TOKEN).toBe('test-token');
    });

    it('should return error for non-existent profile', async () => {
      const { editCommand } = await import('../src/commands/edit.js');
      const result = await editCommand(ctx, {
        profileName: 'no-such',
        field: 'token',
        value: 'x',
      });

      expect(result.success).toBe(false);
    });
  });

  // ── exportCommand ──────────────────────────────────────────────────────

  describe('exportCommand', () => {
    it('should return export commands for profile', async () => {
      const { exportCommand } = await import('../src/commands/export.js');
      const result = await exportCommand(ctx, { profileName: 'test-profile' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('export ANTHROPIC_AUTH_TOKEN');
      }
    });

    it('should return error for non-existent profile', async () => {
      const { exportCommand } = await import('../src/commands/export.js');
      const result = await exportCommand(ctx, { profileName: 'no-such' });

      expect(result.success).toBe(false);
    });
  });

  // ── exportCurrentCommand ───────────────────────────────────────────────

  describe('exportCurrentCommand', () => {
    it('should return error when no current profile', async () => {
      // No current profile set in fresh store
      const built = buildCtx();
      const { exportCurrentCommand } = await import('../src/commands/export.js');
      const result = await exportCurrentCommand(built.ctx);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('没有当前配置');
      }
    });

    it('should return error when current profile not found', async () => {
      // Pretend there's a current profile pointing to a missing file
      store.setCurrentProfile('does-not-exist-anywhere');
      const { exportCurrentCommand } = await import('../src/commands/export.js');
      const result = await exportCurrentCommand(ctx);

      expect(result.success).toBe(false);
    });

    it('should return export commands for current profile', async () => {
      ctx.profiles.setCurrentProfile('test-profile');
      const { exportCurrentCommand } = await import('../src/commands/export.js');
      const result = await exportCurrentCommand(ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('export ANTHROPIC_AUTH_TOKEN');
      }
    });

    it('should include unset commands when previous profile differs', async () => {
      // Set up: old profile with API_TIMEOUT_MS, current profile without it
      const oldProfile = createMockProfile({
        name: 'old-profile',
        env: { ...createMockProfile().env, API_TIMEOUT_MS: '3000000' },
      });
      store.saveProfile(oldProfile);
      store.setCurrentProfile('old-profile');
      store.setPreviousProfile('old-profile');

      // Switch to test-profile (which doesn't have API_TIMEOUT_MS)
      ctx.profiles.setCurrentProfile('test-profile');

      const { exportCurrentCommand } = await import('../src/commands/export.js');
      const result = await exportCurrentCommand(ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('unset API_TIMEOUT_MS');
      }
    });
  });

  // ── renameCommand ──────────────────────────────────────────────────────

  describe('renameCommand', () => {
    it('should rename profile successfully', async () => {
      const { renameCommand } = await import('../src/commands/rename.js');
      const result = await renameCommand(ctx, { oldName: 'test-profile', newName: 'renamed' });

      expect(result.success).toBe(true);
      expect(ctx.profiles.profileExists('renamed')).toBe(true);
      expect(ctx.profiles.profileExists('test-profile')).toBe(false);
    });

    it('should copy all env fields to renamed profile', async () => {
      const { renameCommand } = await import('../src/commands/rename.js');
      await renameCommand(ctx, { oldName: 'test-profile', newName: 'renamed' });

      const renamed = ctx.profiles.getProfile('renamed');
      expect(renamed.env.ANTHROPIC_AUTH_TOKEN).toBe('test-token');
    });

    it('should update current profile reference if renaming active', async () => {
      ctx.profiles.setCurrentProfile('test-profile');
      const { renameCommand } = await import('../src/commands/rename.js');
      await renameCommand(ctx, { oldName: 'test-profile', newName: 'renamed' });

      expect(ctx.profiles.getCurrentProfile()).toBe('renamed');
    });

    it('should return error when new name already exists', async () => {
      store.saveProfile(createMockProfile({ name: 'other' }));
      const { renameCommand } = await import('../src/commands/rename.js');
      const result = await renameCommand(ctx, { oldName: 'test-profile', newName: 'other' });

      expect(result.success).toBe(false);
    });

    it('should return error when old profile does not exist', async () => {
      const { renameCommand } = await import('../src/commands/rename.js');
      const result = await renameCommand(ctx, { oldName: 'no-such', newName: 'new' });

      expect(result.success).toBe(false);
    });
  });

  // ── duplicateCommand ───────────────────────────────────────────────────

  describe('duplicateCommand', () => {
    it('should duplicate profile successfully', async () => {
      const { duplicateCommand } = await import('../src/commands/duplicate.js');
      const result = await duplicateCommand(ctx, {
        sourceName: 'test-profile',
        newName: 'copy',
      });

      expect(result.success).toBe(true);
      expect(ctx.profiles.profileExists('copy')).toBe(true);
    });

    it('should create copy with identical env', async () => {
      const { duplicateCommand } = await import('../src/commands/duplicate.js');
      await duplicateCommand(ctx, { sourceName: 'test-profile', newName: 'copy' });

      const original = ctx.profiles.getProfile('test-profile');
      const copy = ctx.profiles.getProfile('copy');
      expect(copy.env).toEqual(original.env);
    });

    it('should return error when new name already exists', async () => {
      store.saveProfile(createMockProfile({ name: 'taken' }));
      const { duplicateCommand } = await import('../src/commands/duplicate.js');
      const result = await duplicateCommand(ctx, {
        sourceName: 'test-profile',
        newName: 'taken',
      });

      expect(result.success).toBe(false);
    });

    it('should return error when source does not exist', async () => {
      const { duplicateCommand } = await import('../src/commands/duplicate.js');
      const result = await duplicateCommand(ctx, {
        sourceName: 'no-such',
        newName: 'new',
      });

      expect(result.success).toBe(false);
    });
  });
});
