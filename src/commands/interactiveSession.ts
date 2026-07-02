/**
 * Interactive session — the seam between `*Interactive` commands and the
 * `CommandContext`.
 *
 * Why this module exists
 * -----------------------
 * Before this module, seven of the eight `*Interactive` commands in
 * `src/commands/*.ts` repeated the same 30-50 line shape:
 *
 *   1. `listProfiles`
 *   2. return `success: false, error: '没有可X的配置'` if empty
 *   3. `prompts.selectProfileFromList(...)` — bail with `wasCancelled: true` if null
 *   4. prompt for any additional input (e.g. `promptForNewName`) — bail on cancel
 *   5. `prompts.confirmAction(...)` — bail with `wasCancelled: true` if false
 *   6. delegate to the non-interactive command
 *
 * Steps 1-5 were duplicated across `deleteCommandInteractive`,
 * `renameCommandInteractive`, `duplicateCommandInteractive`, and
 * `switchCommandInteractive` (and a near-cousin lived in
 * `restoreCommandInteractive` and `importFileCommandInteractive`).
 * The only things that varied were the verb, the empty-state message,
 * the optional confirmation message, the input builder, and the
 * underlying non-interactive command. About 200 lines of copy-pasted
 * structure lived in the codebase with no single place to fix bugs
 * or change behavior.
 *
 * After this module:
 *   - `runSelectableAction<TSelected, TInput>(ctx, flow)` is the single
 *     home for steps 1-6. `runProfileAction` is a thin alias that
 *     fixes `TSelected` to `Profile` for the existing 7 callers.
 *   - The shape is testable as a unit: pass a fake prompts bag and a
 *     flow descriptor, assert the resulting `CommandResult`.
 *   - Cancellation is one concept (`CancelledError`) honored uniformly
 *     by `runner.toCommandResult` and the inner try/catch in
 *     `runSelectableAction` itself.
 *   - Adding a new "interactive command that selects from a list" is
 *     now ~10 lines, not ~40. `restoreCommandInteractive` (which
 *     selects from a list of backups, not profiles) is the canonical
 *     example.
 *
 * Locality: every "select, optionally confirm, then execute" decision
 * now lives here. Callers only own the bits that are actually unique
 * to their command (the empty-state message, the input builder, the
 * underlying non-interactive command).
 *
 * What this module is NOT
 * -----------------------
 * This module is not a general "command runner". It is the
 * "select-from-a-list" interactive flow. The non-interactive commands
 * continue to use `runner.runCommand` for the try/catch envelope;
 * this module's `runSelectableAction` is itself called from outside
 * any `runCommand` wrapper, because the function returns
 * `CommandResult` directly.
 */
import { AppError } from '../errors.js';
import { CommandResult } from '../types/command.js';
import { Profile } from '../types/index.js';
import inquirer from 'inquirer';
import type { CommandContext } from './context.js';

/**
 * Thrown by `buildInput` (or anywhere inside an interactive flow) to
 * signal "the user backed out of an intermediate prompt". Caught by
 * `runSelectableAction`'s outer try/catch and converted to a
 * `{ success: false, wasCancelled: true }` result. Also honored by
 * `runner.toCommandResult` so any `runCommand`-wrapped code that
 * throws it gets the same uniform treatment.
 *
 * Naming note: `AppError` is the base so it survives any current
 * `if (err instanceof AppError)` branch without behavior change. The
 * class itself is a marker that says "this is a cancellation, not a
 * failure".
 */
export class CancelledError extends AppError {
  constructor(verb: string) {
    super(`已取消${verb}`, 'OPERATION_CANCELLED', { verb });
    this.name = 'CancelledError';
  }
}

/**
 * A user-cancelable confirmation message. A plain string is used for
 * every-item-the-same confirmations; a function is used when the
 * message embeds the selected item's name or fields from the
 * already-built input (e.g. "确定要将配置 'minimax' 重命名为 'new' 吗？").
 */
export type SelectableConfirmMessage<TSelected, TInput> =
  | string
  | ((selected: TSelected, input: TInput) => string);

/**
 * Back-compat alias for the 1-param form (`ConfirmMessage<MyInput>`)
 * used by the 7 original `*Interactive` commands. Equivalent to
 * `SelectableConfirmMessage<Profile, TInput>`.
 */
export type ConfirmMessage<TInput> = SelectableConfirmMessage<Profile, TInput>;

/**
 * Descriptor for the "select from a list, build input, optionally
 * confirm, then execute" interactive flow.
 *
 * The selected item is generic: in the common case it's a `Profile`,
 * but it can be any selectable thing (e.g. a backup path for
 * `restoreCommandInteractive`).
 *
 * Required fields:
 *   - `verb` — the action in Chinese, used in the cancel message
 *   - `emptyMessage` — what to return when no items exist
 *   - `buildInput` — produces the input for the underlying command;
 *     may issue additional prompts and throw `CancelledError` to back
 *     out of them
 *   - `execute` — the non-interactive command to delegate to
 *
 * Optional fields:
 *   - `cancelMessage` — overrides the default `已取消${verb}。`
 *   - `confirm` — if present, the user is asked to confirm; if absent,
 *     the flow skips the confirmation step
 *   - `list` / `formatChoice` / `currentItem` — only used when the
 *     selected items are not profiles (e.g. backups). The default
 *     profile flow uses `ctx.prompts.selectProfileFromList` so the
 *     bin can swap the whole selection UI per-profile.
 */
export interface SelectableActionFlow<TSelected, TInput> {
  /** The verb in Chinese, e.g. "删除" / "重命名" / "复制" / "恢复". */
  readonly verb: string;
  /** Returned when the items list is empty. */
  readonly emptyMessage: string;
  /** Optional override of the cancel message. Defaults to `已取消${verb}。`. */
  readonly cancelMessage?: string;
  /** Confirmation prompt. Omit to skip the confirmation step. */
  readonly confirm?: SelectableConfirmMessage<TSelected, TInput>;
  /**
   * How to enumerate the selectable items. Defaults to
   * `ctx.profiles.listProfiles()` for back-compat with the profile
   * flow. The restore flow overrides this to enumerate backups.
   */
  readonly list?: (ctx: CommandContext) => readonly TSelected[];
  /**
   * How to present a single item to the user in the inquirer list.
   * The default is `(item) => String(item)` — fine for strings, may
   * need overriding for richer objects.
   */
  readonly formatChoice?: (item: TSelected) => string;
  /**
   * The "current" item key, used to mark the default in the inquirer
   * list. Defaults to `ctx.profiles.getCurrentProfile()` for the
   * profile flow; the restore flow can pass `null` (no current
   * backup).
   */
  readonly currentKey?: (ctx: CommandContext) => string | null;
  /**
   * Build the input for the non-interactive command. Receives the
   * selected item and the full context (for accessing prompts).
   * Throws `CancelledError` to back out of any intermediate prompt.
   */
  readonly buildInput: (selected: TSelected, ctx: CommandContext) => TInput | Promise<TInput>;
  /** The non-interactive command to delegate to once the input is built. */
  readonly execute: (ctx: CommandContext, input: TInput) => Promise<CommandResult>;
}

/**
 * The "select from a list, build input, optionally confirm, then execute"
 * flow.
 *
 * Failure modes:
 *   - No items exist → returns `{ success: false, error: emptyMessage }`.
 *   - User backs out of the selection → returns
 *     `{ success: false, error: cancelMessage ?? `已取消${verb}。`,
 *        wasCancelled: true }`.
 *   - User backs out of the confirmation → same shape as above.
 *   - `buildInput` throws `CancelledError` (e.g. user backed out of an
 *     intermediate prompt) → same shape.
 *   - Any other error thrown inside `buildInput` / `execute`
 *     propagates to the caller (consistent with the rest of the
 *     command layer, where the bin or its embedder decides what to
 *     do with unhandled exceptions).
 *
 * Success:
 *   - Returns the `CommandResult` produced by `flow.execute(ctx, input)`.
 *     Most often this is a `{ success: true, output }` from the
 *     underlying non-interactive command.
 */
export async function runSelectableAction<TSelected, TInput>(
  ctx: CommandContext,
  flow: SelectableActionFlow<TSelected, TInput>
): Promise<CommandResult> {
  try {
    return await runSelectableActionImpl(ctx, flow);
  } catch (err) {
    if (err instanceof CancelledError) {
      return {
        success: false,
        error: flow.cancelMessage ?? `已取消${flow.verb}。`,
        wasCancelled: true,
      };
    }
    throw err;
  }
}

async function runSelectableActionImpl<TSelected, TInput>(
  ctx: CommandContext,
  flow: SelectableActionFlow<TSelected, TInput>
): Promise<CommandResult> {
  // 1. List & check empty.
  const listFn = flow.list ?? (() => ctx.profiles.listProfiles() as unknown as readonly TSelected[]);
  const items = listFn(ctx);
  if (items.length === 0) {
    return { success: false, error: flow.emptyMessage };
  }

  // 2. Select from list. For the default (profile) flow, we route
  //    through `ctx.prompts.selectProfileFromList` so the bin can
  //    swap the whole selection UI. For other flows (e.g. backup
  //    restore), we render a generic inquirer list inline.
  let selectedKey: string;
  if (flow.list === undefined) {
    const profiles = items as unknown as readonly Profile[];
    const profileName = await ctx.prompts.selectProfileFromList(
      profiles as Profile[],
      ctx.profiles.getCurrentProfile()
    );
    if (!profileName) {
      throw new CancelledError(flow.verb);
    }
    selectedKey = profileName;
  } else {
    const format = flow.formatChoice ?? ((item: TSelected) => String(item));
    const currentKey = flow.currentKey ? flow.currentKey(ctx) : null;
    const choices = items.map((item) => ({
      name: format(item),
      value: String(item),
    }));
    const defaultIndex =
      currentKey === null ? 0 : Math.max(0, choices.findIndex((c) => c.value === currentKey));
    const { selected } = await inquirer.prompt({
      type: 'list',
      name: 'selected',
      message: `请选择要${flow.verb}的项:`,
      choices,
      default: defaultIndex,
    });
    if (!selected) {
      throw new CancelledError(flow.verb);
    }
    selectedKey = String(selected);
  }

  // The key was just returned from the inquirer list. For the
  // default profile flow, `selectProfileFromList` returns the
  // profile's `name`; for custom flows, the inquirer choice value
  // is `String(item)`. We match by `name` for the profile flow
  // and fall back to `String(item)` for everything else.
  const selected: TSelected | undefined =
    flow.list === undefined
      ? ((items as unknown as readonly Profile[]).find(
          (p) => (p as Profile).name === selectedKey
        ) as unknown as TSelected | undefined)
      : items.find((it) => String(it) === selectedKey);
  if (selected === undefined) {
    // Defensive: should be unreachable.
    throw new AppError(
      `Internal error: selected item '${selectedKey}' is not in the list`,
      'INTERNAL_ERROR'
    );
  }

  // 3. Build input (may include additional prompts that throw CancelledError).
  const input = await flow.buildInput(selected, ctx);

  // 4. Optional confirmation (has access to both selected item and built input).
  if (flow.confirm) {
    const message = typeof flow.confirm === 'function' ? flow.confirm(selected, input) : flow.confirm;
    const confirmed = await ctx.prompts.confirmAction(message);
    if (!confirmed) {
      throw new CancelledError(flow.verb);
    }
  }

  // 5. Delegate to the non-interactive command.
  return flow.execute(ctx, input);
}

// ── Back-compat surface ──────────────────────────────────────────────────

/**
 * Back-compat alias: the original `runProfileAction` is `runSelectableAction`
 * with `TSelected` fixed to `Profile`. New code should use
 * `runSelectableAction<Profile, TInput>`; this alias exists so the
 * 7 existing `*Interactive` commands keep their `runProfileAction` import.
 */
export async function runProfileAction<TInput>(
  ctx: CommandContext,
  flow: Omit<SelectableActionFlow<Profile, TInput>, 'list' | 'formatChoice' | 'currentKey'>
): Promise<CommandResult> {
  return runSelectableAction<Profile, TInput>(ctx, flow);
}

/**
 * Back-compat alias: the original `ProfileActionFlow` is
 * `SelectableActionFlow` with `TSelected` fixed to `Profile`.
 */
export type ProfileActionFlow<TInput> = SelectableActionFlow<Profile, TInput>;
