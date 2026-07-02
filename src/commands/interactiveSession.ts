/**
 * Interactive session — the seam between `*Interactive` commands and the
 * `CommandContext`.
 *
 * Why this module exists
 * ----------------------
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
 *   - `runSelectableAction<T>(ctx, flow)` is the single home for
 *     the "list → select → build input → optionally confirm → execute"
 *     flow. One codepath; no `if (flow.list === undefined)` branch.
 *   - The seam owns the pre-flight (empty list returns the
 *     `emptyMessage`; single-item-with-current-key shortcut bypasses
 *     the prompt and goes straight to `buildInput`). Commands no
 *     longer hand-roll these checks.
 *   - Cancellation is one concept (`CancelledError`) honored uniformly
 *     by `runner.toCommandResult` and the inner try/catch in
 *     `runSelectableAction` itself.
 *   - `runProfileAction` is a thin alias that fixes `T` to `Profile`
 *     for the existing 7 callers; it derives `formatChoice` /
 *     `keyOf` from the profile shape.
 *
 * Locality: every "select from a list" decision lives here. Callers
 * only own the bits that are actually unique to their command (the
 * empty-state message, the input builder, the underlying
 * non-interactive command, and the choice formatter when the default
 * is not sufficient).
 *
 * Dependency category
 * -------------------
 * In-process (per `DEEPENING.md`): no I/O beyond inquirer, no DI
 * seam beyond `ctx` (which the caller already controls). The
 * deepened module is the test surface for the interactive shape;
 * every test for the flow lives in `tests/interactiveSession.test.ts`.
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
import { formatFieldDisplayValue } from '../domain/profileSchema.js';
import { icon } from '../ui/theme.js';
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
export type SelectableConfirmMessage<T, TInput> =
  | string
  | ((selected: T, input: TInput) => string);

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
 *   - `verb` — the action in Chinese, used in the cancel message and
 *     the selection prompt
 *   - `emptyMessage` — what to return when no items exist
 *   - `list` — produces the items to select from (called once)
 *   - `buildInput` — produces the input for the underlying command;
 *     may issue additional prompts and throw `CancelledError` to back
 *     out of them
 *   - `execute` — the non-interactive command to delegate to
 *
 * Optional fields (with sensible defaults):
 *   - `formatChoice` — how to render an item as a list choice
 *     (default: `String(item)`)
 *   - `currentKey` — the key of the "currently active" item, used
 *     to set the prompt's default selection cursor (default: `null`,
 *     which falls back to index 0)
 *   - `keyOf` — extracts the stable identity used to match the
 *     user's choice back to an item. Defaults to `String(item)`.
 *   - `confirm` — confirmation message before `execute`
 *   - `cancelMessage` — overrides the default cancel message
 *   - `prompt` — overrides the inquirer prompt message (default:
 *     `请选择要${verb}的项:`)
 *   - `skipSelectionWhenSingleMatch` — when `true` and the list has
 *     exactly one item whose `keyOf` matches `currentKey(ctx)` (or
 *     `currentKey` is `null`), the seam bypasses the prompt and goes
 *     straight to `buildInput`. This is the canonical "switch to the
 *     only profile without asking" path; it used to live as a manual
 *     pre-flight in `switchCommandInteractive` and is now uniform
 *     for any future `*Interactive` command.
 */
export interface SelectableActionFlow<T, TInput> {
  readonly verb: string;
  readonly emptyMessage: string;
  readonly list: (ctx: CommandContext) => readonly T[];
  readonly buildInput: (selected: T, ctx: CommandContext) => Promise<TInput>;
  readonly execute: (ctx: CommandContext, input: TInput) => Promise<CommandResult>;

  readonly formatChoice?: (item: T, ctx: CommandContext) => string;
  readonly currentKey?: (ctx: CommandContext) => string | null;
  readonly keyOf?: (item: T) => string;
  readonly confirm?: SelectableConfirmMessage<T, TInput>;
  readonly cancelMessage?: string;
  readonly prompt?: string;
  readonly skipSelectionWhenSingleMatch?: boolean;
}

/**
 * Default formatter for `Profile` items:
 *   `● name — description token-marker`
 *   `○ name — description token-marker`
 *
 * This is the single home for the "rich profile list" display; the
 * pre-deepening code had this inlined in
 * `ui/prompt.ts#selectProfileFromList` and reachable only via the
 * `Prompts#selectProfileFromList` seam, which the deepening
 * dissolves (the formatting is now driven by `runProfileAction`'s
 * default `formatChoice` instead of a separate `Prompts` method).
 *
 * The token marker is produced by the schema's
 * `formatFieldDisplayValue` so the sensitive-key masking policy
 * stays in one place.
 */
export function defaultProfileChoice(profile: Profile, ctx: CommandContext): string {
  const isActive = profile.name === ctx.profiles.getCurrentProfile();
  const statusIcon = isActive ? icon.active : icon.standby;
  const provider = profile.description || 'Unknown';
  const token = formatFieldDisplayValue(profile.env, 'token');
  return `${statusIcon} ${profile.name} — ${provider} ${token}`;
}

/**
 * Run the "list → select → build input → optionally confirm → execute"
 * interactive flow. One codepath, no `if (flow.list === undefined)`
 * special case.
 *
 * Pre-flight (owned by this seam, not by individual commands):
 *   1. `list(ctx)` returns `[]` → return `{ success: false, error: emptyMessage }`.
 *   2. `skipSelectionWhenSingleMatch` is `true` AND the list has exactly
 *      one item AND its `keyOf` matches `currentKey(ctx)` (or
 *      `currentKey` is `null`) → skip the prompt, go directly to
 *      `buildInput`. This is the canonical "switch to the only
 *      profile without asking" path; it used to be a manual
 *      pre-flight in `switchCommandInteractive` and is now uniform
 *      for any future `*Interactive` command that opts in.
 *
 * Selection:
 *   - `formatChoice(item, ctx)` is the choice label (defaults to
 *     `String(item)`). For profile flows, the default is supplied
 *     by `runProfileAction` (see below).
 *   - `keyOf(item)` is the stable identity used to look the user's
 *     choice back up in the list. Default: `String(item)`.
 *   - The inquirer choice `value` is `keyOf(item)`.
 *   - `currentKey(ctx)` sets the default selection cursor.
 *
 * Cancellation:
 *   - User backs out of the inquirer list (`null` / `undefined`) →
 *     `CancelledError(flow.verb)`.
 *   - User declines `confirmAction` → `CancelledError(flow.verb)`.
 *   - `buildInput` throws `CancelledError` → propagates to the
 *     same handler.
 *   - Any other error from `buildInput` / `execute` propagates to
 *     the caller (consistent with the rest of the command layer).
 *
 * Success:
 *   - Returns the `CommandResult` produced by `flow.execute(ctx, input)`.
 *     Most often this is a `{ success: true, output }` from the
 *     underlying non-interactive command.
 */
export async function runSelectableAction<T, TInput>(
  ctx: CommandContext,
  flow: SelectableActionFlow<T, TInput>
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

async function runSelectableActionImpl<T, TInput>(
  ctx: CommandContext,
  flow: SelectableActionFlow<T, TInput>
): Promise<CommandResult> {
  // 1. List & check empty.
  const items = flow.list(ctx);
  if (items.length === 0) {
    return { success: false, error: flow.emptyMessage };
  }

  // 2. Resolve the stable identity and the current-key lookup once.
  //    Both the single-item shortcut and the normal prompt use the
  //    same `keyOf` and `currentKey`, so the shortcut is semantically
  //    "the same flow with the prompt suppressed".
  const keyOf = flow.keyOf ?? ((item: T) => String(item));
  const currentKey = flow.currentKey ? flow.currentKey(ctx) : null;

  // 3. Optional single-item shortcut. When the caller asks for it
  //    AND the list has exactly one item AND its key matches the
  //    current-key (or there's no current-key concept), skip the
  //    prompt entirely. The "is the single item already current?"
  //    check is what the previous hand-rolled `switchCommandInteractive`
  //    pre-flight did; consolidating it here means a future
  //    `*Interactive` command gets the same shortcut for free.
  if (
    flow.skipSelectionWhenSingleMatch === true &&
    items.length === 1 &&
    (currentKey === null || keyOf(items[0]!) === currentKey)
  ) {
    return runFromSelected(ctx, flow, items[0]!);
  }

  // 4. Render choices and prompt the user.
  const format = flow.formatChoice ?? ((item: T) => String(item));
  const choices = items.map((item) => ({
    name: format(item, ctx),
    value: keyOf(item),
  }));
  const defaultIndex =
    currentKey === null
      ? 0
      : Math.max(0, choices.findIndex((c) => c.value === currentKey));

  const promptMessage = flow.prompt ?? `请选择要${flow.verb}的项:`;
  const { selected } = await inquirer.prompt({
    type: 'list',
    name: 'selected',
    message: promptMessage,
    choices,
    default: defaultIndex,
  });
  if (!selected) {
    throw new CancelledError(flow.verb);
  }

  // 5. Match the chosen key back to an item.
  const selectedKey = String(selected);
  const selectedItem = items.find((it) => keyOf(it) === selectedKey);
  if (selectedItem === undefined) {
    // Defensive: should be unreachable because the choices were
    // derived from the same items.
    throw new AppError(
      `Internal error: selected item '${selectedKey}' is not in the list`,
      'INTERNAL_ERROR',
    );
  }

  return runFromSelected(ctx, flow, selectedItem);
}

/**
 * The "post-selection" tail of the flow: build the input, optionally
 * confirm, then execute. Factored out so the single-item shortcut
 * and the normal selection path share it byte-for-byte.
 */
async function runFromSelected<T, TInput>(
  ctx: CommandContext,
  flow: SelectableActionFlow<T, TInput>,
  selected: T,
): Promise<CommandResult> {
  // 1. Build input (may include additional prompts that throw CancelledError).
  const input = await flow.buildInput(selected, ctx);

  // 2. Optional confirmation (has access to both selected item and built input).
  if (flow.confirm) {
    const message = typeof flow.confirm === 'function' ? flow.confirm(selected, input) : flow.confirm;
    const confirmed = await ctx.prompts.confirmAction(message);
    if (!confirmed) {
      throw new CancelledError(flow.verb);
    }
  }

  // 3. Delegate to the non-interactive command.
  return flow.execute(ctx, input);
}

// ── Back-compat surface ──────────────────────────────────────────────────

/**
 * The default `formatChoice` for a `Profile`-typed flow. Exposed so
 * the 7 `*Interactive` commands that select a profile don't have to
 * import `defaultProfileChoice` themselves; `runProfileAction`
 * wires it in automatically.
 */
export function profileChoice(item: Profile, ctx: CommandContext): string {
  return defaultProfileChoice(item, ctx);
}

/**
 * The default `keyOf` for a `Profile`-typed flow. A profile's name
 * is the stable identity used to match the user's choice back to
 * the object.
 */
export function profileKeyOf(profile: Profile): string {
  return profile.name;
}

/**
 * Back-compat alias: the original `runProfileAction` is
 * `runSelectableAction` with `T` fixed to `Profile` and the
 * profile-specific defaults wired in. New code should use
 * `runSelectableAction<Profile, TInput>` directly; this alias
 * exists so the 7 existing `*Interactive` commands keep their
 * `runProfileAction` import and don't have to wire
 * `formatChoice` / `keyOf` themselves.
 */
export async function runProfileAction<TInput>(
  ctx: CommandContext,
  flow: Omit<SelectableActionFlow<Profile, TInput>, 'list' | 'formatChoice' | 'keyOf'> & {
    list?: (ctx: CommandContext) => readonly Profile[];
    formatChoice?: (item: Profile, ctx: CommandContext) => string;
  },
): Promise<CommandResult> {
  return runSelectableAction<Profile, TInput>(ctx, {
    ...flow,
    // Defaults: profiles flow's `list` reads from the service,
    // `formatChoice` renders the rich profile row, and `keyOf`
    // matches by profile name. Callers may override any of these.
    list: flow.list ?? ((c) => c.profiles.listProfiles()),
    formatChoice: flow.formatChoice ?? profileChoice,
    keyOf: profileKeyOf,
  });
}

/**
 * Back-compat alias: the original `ProfileActionFlow` is
 * `SelectableActionFlow` with `T` fixed to `Profile`.
 */
export type ProfileActionFlow<TInput> = SelectableActionFlow<Profile, TInput>;
