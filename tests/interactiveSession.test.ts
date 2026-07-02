/**
 * Tests for the `runProfileAction` higher-order function and the
 * `CancelledError` it raises.
 *
 * These tests prove the seam: that the "select a profile, build
 * input, optionally confirm, then execute" shape is uniform across
 * every consumer, and that the cancellation flow is single-sourced
 * instead of being reinvented in every `*Interactive` command.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Profile } from '../src/types/index.js';
import { InMemoryConfigStore } from '../src/config/inMemoryConfigStore.js';
import { ProfileServiceImpl } from '../src/services/profileService.js';
import { envPresenter } from '../src/presenters/envRenderer.js';
import { noopPrompts, type CommandContext, type Prompts } from '../src/commands/context.js';
import {
  CancelledError,
  runProfileAction,
} from '../src/commands/interactiveSession.js';
import { CommandResult } from '../src/types/command.js';

// ── Fixtures ───────────────────────────────────────────────────────────

function makeProfile(name: string): Profile {
  return {
    name,
    description: `desc-${name}`,
    env: { ANTHROPIC_AUTH_TOKEN: `tok-${name}` },
  };
}

/**
 * Build a fresh in-memory context. Tests mutate the returned
 * `prompts` / `store` before invoking the flow.
 */
function buildCtx(store: InMemoryConfigStore = new InMemoryConfigStore()): {
  ctx: CommandContext;
  store: InMemoryConfigStore;
  prompts: Prompts;
} {
  const prompts: Prompts = { ...noopPrompts };
  const service = new ProfileServiceImpl(store);
  const ctx: CommandContext = {
    profiles: service,
    env: envPresenter,
    prompts,
    isTTY: false,
  };
  return { ctx, store, prompts };
}

describe('CancelledError', () => {
  it('is an AppError so existing instanceof checks still match', () => {
    // The whole point of subclassing AppError is to keep current
    // `err instanceof AppError` branches in runner / bin / etc.
    // working without modification.
    const err = new CancelledError('删除');
    expect(err.name).toBe('CancelledError');
    expect(err.code).toBe('OPERATION_CANCELLED');
    expect(err.message).toBe('已取消删除');
  });

  it('is recognized by toCommandResult and sets wasCancelled: true', async () => {
    const { toCommandResult } = await import('../src/commands/runner.js');
    const result = toCommandResult(new CancelledError('复制'), '复制配置');
    expect(result).toEqual({
      success: false,
      error: '已取消复制',
      wasCancelled: true,
    });
  });

  it('falls through to the generic error branch when err is not an AppError', async () => {
    const { toCommandResult } = await import('../src/commands/runner.js');
    const result = toCommandResult(new Error('boom'), '测试');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('测试失败');
      expect(result.error).toContain('boom');
      expect(result.wasCancelled).toBeUndefined();
    }
  });
});

describe('runProfileAction — empty list', () => {
  it('returns the empty message when no profiles exist', async () => {
    const { ctx } = buildCtx();
    const execute = vi.fn(async (): Promise<CommandResult> => ({ success: true, output: 'ok' }));

    const result = await runProfileAction(ctx, {
      verb: '删除',
      emptyMessage: '没有可删除的配置。',
      buildInput: (s) => ({ profileName: s.name }),
      execute,
    });

    expect(result).toEqual({ success: false, error: '没有可删除的配置。' });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('runProfileAction — cancellation paths', () => {
  let ctx: CommandContext;
  let prompts: Prompts;
  let store: InMemoryConfigStore;
  let execute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const built = buildCtx();
    ctx = built.ctx;
    prompts = built.prompts;
    store = built.store;
    store.saveProfile(makeProfile('alpha'));
    store.saveProfile(makeProfile('beta'));
    execute = vi.fn(async (): Promise<CommandResult> => ({ success: true, output: 'ok' }));
  });

  it('returns wasCancelled: true when the user backs out of the profile selection', async () => {
    prompts.selectProfileFromList = vi.fn(async () => null);

    const result = await runProfileAction(ctx, {
      verb: '删除',
      emptyMessage: 'no profiles',
      buildInput: (s) => ({ profileName: s.name }),
      execute,
    });

    expect(result).toEqual({ success: false, error: '已取消删除。', wasCancelled: true });
    expect(execute).not.toHaveBeenCalled();
  });

  it('honors a custom cancelMessage over the default', async () => {
    prompts.selectProfileFromList = vi.fn(async () => null);

    const result = await runProfileAction(ctx, {
      verb: '删除',
      emptyMessage: 'no profiles',
      cancelMessage: '操作已由用户中止。',
      buildInput: (s) => ({ profileName: s.name }),
      execute,
    });

    expect(result).toEqual({ success: false, error: '操作已由用户中止。', wasCancelled: true });
  });

  it('returns wasCancelled: true when the user declines confirmation', async () => {
    prompts.selectProfileFromList = vi.fn(async () => 'alpha');
    prompts.confirmAction = vi.fn(async () => false);

    const result = await runProfileAction(ctx, {
      verb: '删除',
      emptyMessage: 'no profiles',
      confirm: '确定要删除吗？',
      buildInput: (s) => ({ profileName: s.name }),
      execute,
    });

    expect(result).toEqual({ success: false, error: '已取消删除。', wasCancelled: true });
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns wasCancelled: true when buildInput throws CancelledError', async () => {
    // Simulates "user backed out of an intermediate prompt inside
    // buildInput" (e.g. `promptForNewName` returning null).
    prompts.selectProfileFromList = vi.fn(async () => 'alpha');

    const result = await runProfileAction(ctx, {
      verb: '重命名',
      emptyMessage: 'no profiles',
      confirm: 'ok?',
      buildInput: async () => {
        throw new CancelledError('重命名');
      },
      execute,
    });

    expect(result).toEqual({ success: false, error: '已取消重命名。', wasCancelled: true });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('runProfileAction — success paths', () => {
  let ctx: CommandContext;
  let prompts: Prompts;
  let store: InMemoryConfigStore;

  beforeEach(() => {
    const built = buildCtx();
    ctx = built.ctx;
    prompts = built.prompts;
    store = built.store;
  });

  it('skips confirmation when flow.confirm is omitted and delegates to execute', async () => {
    store.saveProfile(makeProfile('only'));
    prompts.selectProfileFromList = vi.fn(async () => 'only');
    const confirm = vi.fn(async () => true);
    prompts.confirmAction = confirm;

    const execute = vi.fn(async (_c: CommandContext, input: { profileName: string }) => ({
      success: true as const,
      output: `did-${input.profileName}`,
    }));

    const result = await runProfileAction(ctx, {
      verb: '切换',
      emptyMessage: 'no profiles',
      buildInput: (s) => ({ profileName: s.name }),
      execute,
    });

    expect(result).toEqual({ success: true, output: 'did-only' });
    expect(confirm).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(ctx, { profileName: 'only' });
  });

  it('asks for confirmation when flow.confirm is a string and respects "yes"', async () => {
    store.saveProfile(makeProfile('p'));
    prompts.selectProfileFromList = vi.fn(async () => 'p');
    const confirm = vi.fn(async () => true);
    prompts.confirmAction = confirm;

    const result = await runProfileAction(ctx, {
      verb: '删除',
      emptyMessage: 'no profiles',
      confirm: '确定要删除吗？',
      buildInput: (s) => ({ profileName: s.name }),
      execute: async () => ({ success: true as const, output: 'deleted' }),
    });

    expect(result).toEqual({ success: true, output: 'deleted' });
    expect(confirm).toHaveBeenCalledWith('确定要删除吗？');
  });

  it('passes selected profile and built input to a function-shaped confirm message', async () => {
    store.saveProfile(makeProfile('p'));
    prompts.selectProfileFromList = vi.fn(async () => 'p');
    const confirm = vi.fn(async (_msg: string) => true);
    prompts.confirmAction = confirm;

    await runProfileAction(ctx, {
      verb: '重命名',
      emptyMessage: 'no profiles',
      confirm: (selected, input) => `'${selected.name}' → '${input.newName}' 吗？`,
      buildInput: async (s) => ({ oldName: s.name, newName: 'p2' }),
      execute: async () => ({ success: true as const, output: 'renamed' }),
    });

    expect(confirm).toHaveBeenCalledWith("'p' → 'p2' 吗？");
  });

  it('re-derives the full profile object from the selected name', async () => {
    store.saveProfile(makeProfile('p'));
    prompts.selectProfileFromList = vi.fn(async () => 'p');

    let observed: Profile | null = null;
    await runProfileAction(ctx, {
      verb: '查看',
      emptyMessage: 'no profiles',
      buildInput: (selected) => {
        observed = selected;
        return { profileName: selected.name };
      },
      execute: async () => ({ success: true as const, output: 'ok' }),
    });

    expect(observed).not.toBeNull();
    expect(observed!.name).toBe('p');
    expect(observed!.env.ANTHROPIC_AUTH_TOKEN).toBe('tok-p');
  });

  it('returns the underlying execute result verbatim', async () => {
    store.saveProfile(makeProfile('p'));
    prompts.selectProfileFromList = vi.fn(async () => 'p');

    const result = await runProfileAction(ctx, {
      verb: 'noop',
      emptyMessage: 'no profiles',
      buildInput: (s) => ({ profileName: s.name }),
      execute: async () => ({ success: false as const, error: 'downstream error' }),
    });

    expect(result).toEqual({ success: false, error: 'downstream error' });
  });

  it('rethrows non-CancelledError exceptions from buildInput (does not swallow them)', async () => {
    store.saveProfile(makeProfile('p'));
    prompts.selectProfileFromList = vi.fn(async () => 'p');

    const explode = new Error('boom');
    await expect(
      runProfileAction(ctx, {
        verb: '删除',
        emptyMessage: 'no profiles',
        buildInput: () => {
          throw explode;
        },
        execute: async () => ({ success: true as const, output: 'ok' }),
      })
    ).rejects.toBe(explode);
  });
});
