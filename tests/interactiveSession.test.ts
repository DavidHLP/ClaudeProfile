/**
 * Tests for the `runSelectableAction` / `runProfileAction` higher-order
 * functions and the `CancelledError` they raise.
 *
 * These tests prove the seam: that the "list → select → build input
 * → optionally confirm → execute" shape is uniform across every
 * consumer, that the pre-flight (empty list, single-item shortcut)
 * lives in the seam and not in any individual command, and that the
 * cancellation flow is single-sourced instead of being reinvented in
 * every `*Interactive` command.
 *
 * Mocking strategy
 * ----------------
 * The new design routes all selection through `inquirer.prompt`
 * directly, so the previous `selectProfileFromList` mock is gone.
 * We mock the `inquirer` module to return a controlled `selected`
 * key per test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Profile } from '../src/types/index.js';
import { InMemoryConfigStore } from '../src/config/inMemoryConfigStore.js';
import { ProfileServiceImpl } from '../src/services/profileService.js';
import { envPresenter } from '../src/presenters/envRenderer.js';
import { noopPrompts, type CommandContext, type Prompts } from '../src/commands/context.js';
import {
  CancelledError,
  runProfileAction,
  runSelectableAction,
  defaultProfileChoice,
  profileKeyOf,
} from '../src/commands/interactiveSession.js';
import { CommandResult } from '../src/types/command.js';

// ── inquirer mock ──────────────────────────────────────────────────────
//
// The seam's only side effect at the selection step is
// `inquirer.prompt({ type: 'list', name: 'selected', ... })`. Tests
// set `mockInquirerSelected` (string | null) to control what the
// "user" picked; `null` simulates backing out of the prompt (which
// the seam converts to `CancelledError`).

let mockInquirerSelected: string | null = 'alpha';

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(async () => ({ selected: mockInquirerSelected })),
    Separator: class Separator {},
  },
}));

import inquirer from 'inquirer';
const promptMock = inquirer.prompt as unknown as ReturnType<typeof vi.fn>;

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

beforeEach(() => {
  mockInquirerSelected = 'alpha';
  promptMock.mockClear();
});

afterEach(() => {
  mockInquirerSelected = 'alpha';
});

// ── CancelledError ─────────────────────────────────────────────────────

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

// ── runSelectableAction: pre-flight ─────────────────────────────────────

describe('runSelectableAction — empty list', () => {
  it('returns the empty message when the list is empty', async () => {
    const { ctx } = buildCtx();
    const execute = vi.fn(async (): Promise<CommandResult> => ({ success: true, output: 'ok' }));

    const result = await runSelectableAction(ctx, {
      verb: '删除',
      emptyMessage: '没有可删除的配置。',
      list: () => [],
      buildInput: async (s) => ({ profileName: (s as Profile).name }),
      execute,
    });

    expect(result).toEqual({ success: false, error: '没有可删除的配置。' });
    expect(execute).not.toHaveBeenCalled();
    expect(promptMock).not.toHaveBeenCalled();
  });
});

describe('runSelectableAction — single-item shortcut', () => {
  it('skips the prompt when skipSelectionWhenSingleMatch is true and the single item is current', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('only'));
    store.setCurrentProfile('only');
    const execute = vi.fn(async (): Promise<CommandResult> => ({ success: true, output: 'ok' }));

    const result = await runSelectableAction(ctx, {
      verb: '切换',
      emptyMessage: 'no profiles',
      skipSelectionWhenSingleMatch: true,
      list: (c) => c.profiles.listProfiles(),
      keyOf: (s) => (s as Profile).name,
      currentKey: (c) => c.profiles.getCurrentProfile(),
      buildInput: async (s) => ({ profileName: (s as Profile).name }),
      execute,
    });

    expect(result).toEqual({ success: true, output: 'ok' });
    expect(execute).toHaveBeenCalledWith(ctx, { profileName: 'only' });
    expect(promptMock).not.toHaveBeenCalled();
  });

  it('skips the prompt when skipSelectionWhenSingleMatch is true and currentKey is null (no active concept)', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('only'));
    const execute = vi.fn(async (): Promise<CommandResult> => ({ success: true, output: 'ok' }));

    const result = await runSelectableAction(ctx, {
      verb: '恢复',
      emptyMessage: 'no backups',
      skipSelectionWhenSingleMatch: true,
      list: () => ['/path/a.tar.gz'],
      keyOf: (p) => p,
      currentKey: () => null,
      buildInput: async (p) => ({ backupPath: p }),
      execute,
    });

    expect(result).toEqual({ success: true, output: 'ok' });
    expect(execute).toHaveBeenCalledWith(ctx, { backupPath: '/path/a.tar.gz' });
    expect(promptMock).not.toHaveBeenCalled();
  });

  it('does NOT skip the prompt when skipSelectionWhenSingleMatch is true but the single item is not current', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('only'));
    store.setCurrentProfile('other');
    const execute = vi.fn(async (): Promise<CommandResult> => ({ success: true, output: 'ok' }));
    mockInquirerSelected = 'only';

    const result = await runSelectableAction(ctx, {
      verb: '切换',
      emptyMessage: 'no profiles',
      skipSelectionWhenSingleMatch: true,
      list: (c) => c.profiles.listProfiles(),
      keyOf: (s) => (s as Profile).name,
      currentKey: (c) => c.profiles.getCurrentProfile(),
      buildInput: async (s) => ({ profileName: (s as Profile).name }),
      execute,
    });

    expect(result).toEqual({ success: true, output: 'ok' });
    expect(promptMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT skip the prompt when the list has multiple items', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('a'));
    store.saveProfile(makeProfile('b'));
    mockInquirerSelected = 'b';

    const execute = vi.fn(async (): Promise<CommandResult> => ({ success: true, output: 'ok' }));

    await runSelectableAction(ctx, {
      verb: '删除',
      emptyMessage: 'no profiles',
      skipSelectionWhenSingleMatch: true,
      list: (c) => c.profiles.listProfiles(),
      keyOf: (s) => (s as Profile).name,
      currentKey: () => null,
      buildInput: async (s) => ({ profileName: (s as Profile).name }),
      execute,
    });

    expect(promptMock).toHaveBeenCalledTimes(1);
  });
});

// ── runSelectableAction: selection + execution ──────────────────────────

describe('runSelectableAction — selection & execution', () => {
  it('matches the inquirer choice back to a full item via keyOf', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('a'));
    store.saveProfile(makeProfile('b'));
    mockInquirerSelected = 'b';
    const execute = vi.fn(async (): Promise<CommandResult> => ({ success: true, output: 'b' }));

    const result = await runSelectableAction(ctx, {
      verb: '删除',
      emptyMessage: 'no profiles',
      list: (c) => c.profiles.listProfiles(),
      keyOf: (s) => (s as Profile).name,
      currentKey: () => null,
      buildInput: async (s) => ({ profileName: (s as Profile).name }),
      execute,
    });

    expect(result).toEqual({ success: true, output: 'b' });
    expect(execute).toHaveBeenCalledWith(ctx, { profileName: 'b' });
  });

  it('passes formatChoice output to inquirer.prompt as the choice name', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('a'));
    mockInquirerSelected = 'a';

    const format = vi.fn((p: Profile) => `MY-FORMAT[${p.name}]`);

    await runSelectableAction(ctx, {
      verb: 'view',
      emptyMessage: 'no profiles',
      list: (c) => c.profiles.listProfiles(),
      keyOf: (s) => (s as Profile).name,
      currentKey: () => null,
      formatChoice: format,
      buildInput: async (s) => ({ profileName: (s as Profile).name }),
      execute: async () => ({ success: true as const, output: 'ok' }),
    });

    expect(format).toHaveBeenCalled();
    const call = promptMock.mock.calls[0]![0] as { choices: Array<{ name: string; value: string }> };
    expect(call.choices).toEqual([{ name: 'MY-FORMAT[a]', value: 'a' }]);
  });

  it('returns wasCancelled: true when inquirer returns null', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('a'));
    mockInquirerSelected = null;
    const execute = vi.fn(async (): Promise<CommandResult> => ({ success: true, output: 'ok' }));

    const result = await runSelectableAction(ctx, {
      verb: '删除',
      emptyMessage: 'no profiles',
      list: (c) => c.profiles.listProfiles(),
      keyOf: (s) => (s as Profile).name,
      currentKey: () => null,
      buildInput: async (s) => ({ profileName: (s as Profile).name }),
      execute,
    });

    expect(result).toEqual({ success: false, error: '已取消删除。', wasCancelled: true });
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns wasCancelled: true when the user declines confirm', async () => {
    const { ctx, store, prompts } = buildCtx();
    store.saveProfile(makeProfile('a'));
    mockInquirerSelected = 'a';
    prompts.confirmAction = vi.fn(async () => false);

    const result = await runSelectableAction(ctx, {
      verb: '删除',
      emptyMessage: 'no profiles',
      list: (c) => c.profiles.listProfiles(),
      keyOf: (s) => (s as Profile).name,
      currentKey: () => null,
      confirm: '确定?',
      buildInput: async (s) => ({ profileName: (s as Profile).name }),
      execute: async () => ({ success: true as const, output: 'ok' }),
    });

    expect(result).toEqual({ success: false, error: '已取消删除。', wasCancelled: true });
  });

  it('honors a custom cancelMessage over the default', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('a'));
    mockInquirerSelected = null;

    const result = await runSelectableAction(ctx, {
      verb: '删除',
      emptyMessage: 'no profiles',
      cancelMessage: '操作已由用户中止。',
      list: (c) => c.profiles.listProfiles(),
      keyOf: (s) => (s as Profile).name,
      currentKey: () => null,
      buildInput: async (s) => ({ profileName: (s as Profile).name }),
      execute: async () => ({ success: true as const, output: 'ok' }),
    });

    expect(result).toEqual({ success: false, error: '操作已由用户中止。', wasCancelled: true });
  });

  it('returns wasCancelled: true when buildInput throws CancelledError', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('a'));
    mockInquirerSelected = 'a';

    const result = await runSelectableAction(ctx, {
      verb: '重命名',
      emptyMessage: 'no profiles',
      confirm: 'ok?',
      list: (c) => c.profiles.listProfiles(),
      keyOf: (s) => (s as Profile).name,
      currentKey: () => null,
      buildInput: async () => {
        throw new CancelledError('重命名');
      },
      execute: async () => ({ success: true as const, output: 'ok' }),
    });

    expect(result).toEqual({ success: false, error: '已取消重命名。', wasCancelled: true });
  });

  it('rethrows non-CancelledError exceptions from buildInput (does not swallow them)', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('a'));
    mockInquirerSelected = 'a';

    const explode = new Error('boom');
    await expect(
      runSelectableAction(ctx, {
        verb: '删除',
        emptyMessage: 'no profiles',
        list: (c) => c.profiles.listProfiles(),
      keyOf: (s) => (s as Profile).name,
        currentKey: () => null,
        buildInput: () => {
          throw explode;
        },
        execute: async () => ({ success: true as const, output: 'ok' }),
      }),
    ).rejects.toBe(explode);
  });

  it('uses flow.prompt as the inquirer message when provided', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('a'));
    mockInquirerSelected = 'a';

    await runSelectableAction(ctx, {
      verb: 'X',
      emptyMessage: 'no',
      list: (c) => c.profiles.listProfiles(),
      keyOf: (s) => (s as Profile).name,
      currentKey: () => null,
      prompt: 'CUSTOM-PROMPT-MSG',
      buildInput: async (s) => ({ profileName: (s as Profile).name }),
      execute: async () => ({ success: true as const, output: 'ok' }),
    });

    const call = promptMock.mock.calls[0]![0] as { message: string };
    expect(call.message).toBe('CUSTOM-PROMPT-MSG');
  });
});

// ── runProfileAction: convenience alias ────────────────────────────────

describe('runProfileAction — convenience alias', () => {
  it('uses ctx.profiles.listProfiles as the default list', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('a'));
    mockInquirerSelected = 'a';
    const execute = vi.fn(async (): Promise<CommandResult> => ({ success: true, output: 'ok' }));

    await runProfileAction(ctx, {
      verb: '查看',
      emptyMessage: 'no',
      buildInput: async (s) => ({ profileName: s.name }),
      execute,
    });

    expect(execute).toHaveBeenCalledWith(ctx, { profileName: 'a' });
  });

  it('passes the rich default profile choice formatter into inquirer', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('a'));
    mockInquirerSelected = 'a';

    await runProfileAction(ctx, {
      verb: '查看',
      emptyMessage: 'no',
      buildInput: async (s) => ({ profileName: s.name }),
      execute: async () => ({ success: true as const, output: 'ok' }),
    });

    const call = promptMock.mock.calls[0]![0] as { choices: Array<{ name: string; value: string }> };
    // The default formatter renders `icon name — description token-marker`.
    expect(call.choices[0]!.name).toContain('a');
    expect(call.choices[0]!.name).toContain('desc-a');
    expect(call.choices[0]!.name).toContain('[*****]');
    expect(call.choices[0]!.value).toBe('a');
  });

  it('honors skipSelectionWhenSingleMatch for the single-current-profile shortcut', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('only'));
    store.setCurrentProfile('only');
    const execute = vi.fn(async (): Promise<CommandResult> => ({ success: true, output: 'ok' }));

    const result = await runProfileAction(ctx, {
      verb: '切换',
      emptyMessage: 'no',
      skipSelectionWhenSingleMatch: true,
      buildInput: async (s) => ({ profileName: s.name }),
      execute,
    });

    expect(result).toEqual({ success: true, output: 'ok' });
    expect(promptMock).not.toHaveBeenCalled();
  });
});

// ── defaultProfileChoice / profileKeyOf ────────────────────────────────

describe('defaultProfileChoice / profileKeyOf', () => {
  it('renders icon + name + description + token marker for the active profile', () => {
    const { ctx, store } = buildCtx();
    const p = makeProfile('p');
    store.saveProfile(p);
    store.setCurrentProfile('p');
    const formatted = defaultProfileChoice(p, ctx);
    // Active icon (●) and token marker ([*****]).
    expect(formatted).toMatch(/●/);
    expect(formatted).toContain('p');
    expect(formatted).toContain('desc-p');
    expect(formatted).toContain('[*****]');
  });

  it('renders the standby icon (○) when the profile is not current', () => {
    const { ctx, store } = buildCtx();
    const p = makeProfile('p');
    store.saveProfile(p);
    store.setCurrentProfile('other');
    const formatted = defaultProfileChoice(p, ctx);
    expect(formatted).toMatch(/○/);
  });

  it('profileKeyOf returns the profile name', () => {
    expect(profileKeyOf(makeProfile('p'))).toBe('p');
  });
});
