import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProfileServiceImpl } from '../src/services/profileService.js';
import { InMemoryConfigStore } from '../src/config/inMemoryConfigStore.js';
import { envPresenter } from '../src/presenters/envRenderer.js';
import { noopPrompts, type CommandContext } from '../src/commands/context.js';

function buildCtx(): { ctx: CommandContext; store: InMemoryConfigStore } {
  const store = new InMemoryConfigStore();
  const service = new ProfileServiceImpl(store);
  return {
    ctx: { profiles: service, env: envPresenter, prompts: noopPrompts, isTTY: false },
    store,
  };
}

describe('runProfileCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error for non-existent profile', async () => {
    const { ctx } = buildCtx();
    const { runProfileCommand } = await import('../src/commands/run.js');
    const result = await runProfileCommand(ctx, {
      profileName: 'missing',
      command: ['echo', 'hello'],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('不存在');
    }
  });

  it('should return error when no command is provided', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile({
      name: 'test',
      description: 'Test',
      env: { FOO: 'bar' },
    });
    const { runProfileCommand } = await import('../src/commands/run.js');
    const result = await runProfileCommand(ctx, {
      profileName: 'test',
      command: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('没有指定');
    }
  });

  it('should print env with --print-env', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile({
      name: 'test',
      description: 'Test',
      env: { FOO: 'bar', ANTHROPIC_AUTH_TOKEN: 'secret-token' },
    });
    const { runProfileCommand } = await import('../src/commands/run.js');
    const result = await runProfileCommand(ctx, {
      profileName: 'test',
      command: [],
      printEnv: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // Sensitive key should be masked
      expect(result.output).toContain('ANTHROPIC_AUTH_TOKEN=secr****');
      expect(result.output).toContain('FOO=bar');
    }
  });

  it('exec should behave as alias for run', async () => {
    const { ctx } = buildCtx();
    const { execProfileCommand } = await import('../src/commands/run.js');
    const result = await execProfileCommand(ctx, {
      profileName: 'missing',
      command: ['echo', 'hello'],
    });

    expect(result.success).toBe(false);
  });
});
