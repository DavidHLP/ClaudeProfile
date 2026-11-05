/**
 * Regression test for ADR-0014: 6 profile-flow commands migrated to
 * `runProfileAction` and the 4 profile-flow defaults wired in.
 *
 * The latent bug: before this deepening, the 6 commands called
 * `runSelectableAction` directly and supplied `list: (c) => c.profiles.listProfiles()`
 * + `currentKey: (c) => c.profiles.getCurrentProfile()` by hand, but
 * never supplied `formatChoice` or `keyOf`. Result: inquirer rendered
 * each profile as `[object Object]`. The bug was untested because
 * `tests/commands.test.ts` only exercises the non-interactive path.
 *
 * These tests pin the seam fracture closed: every `runProfileAction`
 * caller must (a) get the rich `defaultProfileChoice` formatter
 * automatically, (b) get `profileKeyOf` as the inquirer `value`,
 * (c) get `c.profiles.getCurrentProfile()` as the default selection
 * cursor, and (d) read the profile list from the service.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Profile } from '../src/types/index.js';
import { InMemoryConfigStore } from '../src/config/inMemoryConfigStore.js';
import { ProfileServiceImpl } from '../src/services/profileService.js';
import { envPresenter } from '../src/presenters/envRenderer.js';
import { noopPrompts, type CommandContext, type Prompts } from '../src/commands/context.js';
import {
  runProfileAction,
  type ProfileActionFlow,
} from '../src/commands/interactiveSession.js';
import { CommandResult } from '../src/types/command.js';

let mockInquirerSelected: string | null = 'alpha';

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(async () => ({ selected: mockInquirerSelected })),
    Separator: class Separator {},
  },
}));

import inquirer from 'inquirer';
const promptMock = inquirer.prompt as unknown as ReturnType<typeof vi.fn>;

function makeProfile(name: string, opts: { active?: boolean; description?: string } = {}): Profile {
  return {
    name,
    description: opts.description ?? `desc-${name}`,
    env: { ANTHROPIC_AUTH_TOKEN: `tok-${name}` },
  };
}

function buildCtx(store: InMemoryConfigStore = new InMemoryConfigStore()): {
  ctx: CommandContext;
  store: InMemoryConfigStore;
  prompts: Prompts;
} {
  const prompts: Prompts = { ...noopPrompts, confirmAction: async () => true };
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

describe('runProfileAction — defaults (ADR-0014)', () => {
  it('reads the profile list from ctx.profiles.listProfiles by default', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('a'));
    store.saveProfile(makeProfile('b'));
    mockInquirerSelected = 'b';

    const execute = vi.fn(async (): Promise<CommandResult> => ({ success: true, output: 'ok' }));

    await runProfileAction(ctx, {
      verb: 'X',
      emptyMessage: 'no',
      buildInput: async (s) => ({ profileName: s.name }),
      execute,
    });

    // The default `list` pulled both profiles from the service.
    const call = promptMock.mock.calls[0]![0] as { choices: Array<{ name: string; value: string }> };
    expect(call.choices).toHaveLength(2);
    expect(call.choices.map((c) => c.value).sort()).toEqual(['a', 'b']);
  });

  it('renders the rich default profile choice (NOT [object Object])', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('alpha'));
    mockInquirerSelected = 'alpha';

    await runProfileAction(ctx, {
      verb: 'X',
      emptyMessage: 'no',
      buildInput: async (s) => ({ profileName: s.name }),
      execute: async () => ({ success: true as const, output: 'ok' }),
    });

    const call = promptMock.mock.calls[0]![0] as { choices: Array<{ name: string; value: string }> };
    // The bug was that the 6 commands rendered `[object Object]`.
    // After ADR-0014, the default formatter is `defaultProfileChoice`
    // (icon + name + description + token marker). The choice name
    // must contain the profile's name + description + token marker.
    expect(call.choices[0]!.name).toContain('alpha');
    expect(call.choices[0]!.name).toContain('desc-alpha');
    expect(call.choices[0]!.name).toContain('[*****]');
    // And the choice `value` (the inquirer key) is the profile name,
    // not `[object Object]`.
    expect(call.choices[0]!.value).toBe('alpha');
  });

  it('defaults the selection cursor to the active profile', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('a'));
    store.saveProfile(makeProfile('b'));
    store.saveProfile(makeProfile('c'));
    store.setCurrentProfile('b');
    // Pick 'a' so we can verify the *default* cursor is on 'b',
    // not on the first item. If `currentKey` defaulted to `null`
    // (the seam's fallback), the cursor would land on 'a' and the
    // user's `defaultIndex` would be 0. With our default, the
    // cursor lands on 'b' (index 1).
    mockInquirerSelected = 'b';

    const execute = vi.fn(async (): Promise<CommandResult> => ({ success: true, output: 'ok' }));

    await runProfileAction(ctx, {
      verb: 'X',
      emptyMessage: 'no',
      buildInput: async (s) => ({ profileName: s.name }),
      execute,
    });

    const call = promptMock.mock.calls[0]![0] as { default: number };
    expect(call.default).toBe(1);
  });

  it('honors the single-item shortcut using the default currentKey', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('only'));
    store.setCurrentProfile('only');

    const execute = vi.fn(async (): Promise<CommandResult> => ({ success: true, output: 'ok' }));

    const result = await runProfileAction(ctx, {
      verb: 'X',
      emptyMessage: 'no',
      skipSelectionWhenSingleMatch: true,
      buildInput: async (s) => ({ profileName: s.name }),
      execute,
    });

    expect(result).toEqual({ success: true, output: 'ok' });
    expect(promptMock).not.toHaveBeenCalled();
  });

  it('still allows callers to override the default currentKey', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('a'));
    store.saveProfile(makeProfile('b'));
    // Active profile is 'a', but we override `currentKey` to null
    // so the cursor should fall back to index 0.
    store.setCurrentProfile('a');
    mockInquirerSelected = 'a';

    await runProfileAction(ctx, {
      verb: 'X',
      emptyMessage: 'no',
      currentKey: () => null,
      buildInput: async (s) => ({ profileName: s.name }),
      execute: async () => ({ success: true as const, output: 'ok' }),
    });

    const call = promptMock.mock.calls[0]![0] as { default: number };
    expect(call.default).toBe(0);
  });

  it('still allows callers to override the default list', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('a'));
    store.saveProfile(makeProfile('b'));
    mockInquirerSelected = 'a';

    const execute = vi.fn(async (): Promise<CommandResult> => ({ success: true, output: 'ok' }));

    await runProfileAction(ctx, {
      verb: 'X',
      emptyMessage: 'no',
      // Override: only return the first profile.
      list: (c) => c.profiles.listProfiles().slice(0, 1),
      buildInput: async (s) => ({ profileName: s.name }),
      execute,
    });

    const call = promptMock.mock.calls[0]![0] as { choices: Array<{ name: string; value: string }> };
    expect(call.choices).toHaveLength(1);
    expect(call.choices[0]!.value).toBe('a');
  });
});

// ── End-to-end: the 6 migrated commands must produce rich choice names ──

describe('migrated profile-flow commands (ADR-0014 regression)', () => {
  it('deleteCommandInteractive renders the profile name (NOT [object Object])', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('alpha'));
    mockInquirerSelected = 'alpha';

    const { deleteCommandInteractive } = await import('../src/commands/delete.js');
    const result = await deleteCommandInteractive(ctx);

    expect(result.success).toBe(true);
    const call = promptMock.mock.calls[0]![0] as { choices: Array<{ name: string; value: string }> };
    expect(call.choices[0]!.name).toContain('alpha');
    expect(call.choices[0]!.name).not.toBe('[object Object]');
    expect(call.choices[0]!.value).toBe('alpha');
  });

  it('editCommandInteractive renders the profile name (NOT [object Object])', async () => {
    const { ctx, store } = buildCtx();
    store.saveProfile(makeProfile('alpha'));
    mockInquirerSelected = 'alpha';
    // editCommandInteractive does a follow-up selectEditField; mock it
    // to return 'token' so the test reaches the inquirer call.
    ctx.prompts.selectEditField = vi.fn(async () => 'token' as const);
    ctx.prompts.inputProfileField = vi.fn(async () => 'tok-value');

    const { editCommandInteractive } = await import('../src/commands/edit.js');
    await editCommandInteractive(ctx);

    const call = promptMock.mock.calls[0]![0] as { choices: Array<{ name: string; value: string }> };
    expect(call.choices[0]!.name).toContain('alpha');
    expect(call.choices[0]!.name).not.toBe('[object Object]');
    expect(call.choices[0]!.value).toBe('alpha');
  });

  it('switchCommandInteractive renders the profile name (NOT [object Object])', async () => {
    const { ctx, store } = buildCtx();
    // Two profiles: the single-item shortcut would otherwise skip
    // the inquirer call entirely. We need the prompt to actually fire.
    store.saveProfile(makeProfile('alpha'));
    store.saveProfile(makeProfile('beta'));
    mockInquirerSelected = 'alpha';
    // TTY mode shows the banner; turn it off.
    ctx.isTTY = false;

    const { switchCommandInteractive } = await import('../src/commands/switch.js');
    await switchCommandInteractive(ctx);

    const call = promptMock.mock.calls[0]![0] as { choices: Array<{ name: string; value: string }> };
    expect(call.choices).toHaveLength(2);
    const alpha = call.choices.find((c) => c.value === 'alpha')!;
    expect(alpha.name).toContain('alpha');
    expect(alpha.name).not.toBe('[object Object]');
  });
});

// ── ProfileActionFlow type alias still resolves correctly ──────────────

describe('ProfileActionFlow type alias', () => {
  it('is a SelectableActionFlow with T=Profile', () => {
    // Type-only check: assigning a ProfileActionFlow to a
    // SelectableActionFlow<Profile, _> should be transparent.
    const flow: ProfileActionFlow<{ x: number }> = {
      verb: 'X',
      emptyMessage: 'no',
      list: () => [],
      buildInput: async () => ({ x: 1 }),
      execute: async () => ({ success: true, output: '' }),
    };
    expect(flow.verb).toBe('X');
  });
});
