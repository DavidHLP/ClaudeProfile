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
 *   - `runProfileAction(ctx, flow)` is the single home for steps 1-6.
 *   - The shape is testable as a unit: pass a fake prompts bag and a
 *     flow descriptor, assert the resulting `CommandResult`.
 *   - Cancellation is one concept (`CancelledError`) honored uniformly
 *     by `runner.toCommandResult` and the inner try/catch in
 *     `runProfileAction` itself.
 *   - Adding a new "interactive command that operates on a profile"
 *     is now ~10 lines, not ~40.
 *
 * Locality: every "select a profile, optionally confirm, then execute"
 * decision now lives here. Callers only own the bits that are actually
 * unique to their command (the empty-state message, the input builder,
 * the underlying non-interactive command).
 *
 * What this module is NOT
 * -----------------------
 * This module is not a general "command runner". It is the
 * "select-profile" interactive flow. The non-interactive commands
 * continue to use `runner.runCommand` for the try/catch envelope;
 * this module's `runProfileAction` is itself called from outside any
 * `runCommand` wrapper, because the function returns `CommandResult`
 * directly.
 */
import { AppError } from '../errors.js';
import { CommandResult } from '../types/command.js';
import { Profile } from '../types/index.js';
import type { CommandContext } from './context.js';

/**
 * Thrown by `buildInput` (or anywhere inside an interactive flow) to
 * signal "the user backed out of an intermediate prompt". Caught by
 * `runProfileAction`'s outer try/catch and converted to a
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
 * every-profile-the-same confirmations; a function is used when the
 * message embeds the selected profile's name or fields from the
 * already-built input (e.g. "确定要将配置 'minimax' 重命名为 'new' 吗？").
 */
export type ConfirmMessage<TInput> = string | ((selected: Profile, input: TInput) => string);

/**
 * Descriptor for the "select a profile, build input, optionally confirm,
 * then execute" interactive flow.
 *
 * Required fields:
 *   - `verb` — the action in Chinese, used in the cancel message
 *   - `emptyMessage` — what to return when no profiles exist
 *   - `buildInput` — produces the input for the underlying command;
 *     may issue additional prompts and throw `CancelledError` to back
 *     out of them
 *   - `execute` — the non-interactive command to delegate to
 *
 * Optional fields:
 *   - `cancelMessage` — overrides the default `已取消${verb}。`
 *   - `confirm` — if present, the user is asked to confirm; if absent,
 *     the flow skips the confirmation step
 */
export interface ProfileActionFlow<TInput> {
  /** The verb in Chinese, e.g. "删除" / "重命名" / "复制". */
  readonly verb: string;
  /** Returned when `ctx.profiles.listProfiles()` is empty. */
  readonly emptyMessage: string;
  /** Optional override of the cancel message. Defaults to `已取消${verb}。`. */
  readonly cancelMessage?: string;
  /** Confirmation prompt. Omit to skip the confirmation step. */
  readonly confirm?: ConfirmMessage<TInput>;
  /**
   * Build the input for the non-interactive command. Receives the
   * selected profile and the full context (for accessing prompts).
   * Throws `CancelledError` to back out of any intermediate prompt
   * (`promptForNewName`, `inputApiToken`, etc.) — `runProfileAction`
   * catches it and returns a uniform cancellation result.
   */
  readonly buildInput: (selected: Profile, ctx: CommandContext) => TInput | Promise<TInput>;
  /** The non-interactive command to delegate to once the input is built. */
  readonly execute: (ctx: CommandContext, input: TInput) => Promise<CommandResult>;
}

/**
 * The "select a profile, build input, optionally confirm, then execute"
 * flow.
 *
 * Failure modes:
 *   - No profiles exist → returns `{ success: false, error: emptyMessage }`.
 *   - User backs out of the profile selection → returns
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
export async function runProfileAction<TInput>(
  ctx: CommandContext,
  flow: ProfileActionFlow<TInput>
): Promise<CommandResult> {
  try {
    return await runProfileActionImpl(ctx, flow);
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

async function runProfileActionImpl<TInput>(
  ctx: CommandContext,
  flow: ProfileActionFlow<TInput>
): Promise<CommandResult> {
  // 1. List & check empty.
  const profiles = ctx.profiles.listProfiles();
  if (profiles.length === 0) {
    return { success: false, error: flow.emptyMessage };
  }

  // 2. Select from list.
  const currentProfileName = ctx.profiles.getCurrentProfile();
  const selectedName = await ctx.prompts.selectProfileFromList(profiles, currentProfileName);
  if (!selectedName) {
    throw new CancelledError(flow.verb);
  }

  // The name was just returned from `selectProfileFromList`, which
  // promises to return one of `profiles[i].name`. We re-derive the
  // full profile object so the caller can use it in `buildInput`.
  const selected = profiles.find((p) => p.name === selectedName);
  if (!selected) {
    // Defensive: should be unreachable.
    throw new AppError(
      `Internal error: selected profile '${selectedName}' is not in the list`,
      'INTERNAL_ERROR'
    );
  }

  // 3. Build input (may include additional prompts that throw CancelledError).
  const input = await flow.buildInput(selected, ctx);

  // 4. Optional confirmation (has access to both selected profile and built input).
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
