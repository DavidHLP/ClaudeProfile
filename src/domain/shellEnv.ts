/**
 * Shell Env — the canonical extraction of "Claude env vars" from a
 * Node `process.env`-shaped object.
 *
 * Why this module exists
 * ----------------------
 * Before this module, `commands/status.ts` inlined two pieces of
 * domain knowledge that did not belong in a command:
 *
 *   1. The set of env-key prefixes that count as "Claude env keys":
 *      `ANTHROPIC_` and `CLAUDE_CODE_`. These are the env keys the
 *      `claude-profile` CLI knows how to inject via the eval-bridge
 *      and the env keys a user expects to see when they ask
 *      "what's in my shell right now?". The list is a domain
 *      concept — it is the canonical answer to "is this env key a
 *      Claude key?", not a presentation choice.
 *   2. The extraction logic: iterate `Object.keys(process.env)`,
 *      filter by prefix, and collect into a `Record<string, string>`
 *      with non-empty values only. The logic is pure and has its
 *      own test surface (empty input, mixed-case keys, empty
 *      values, missing prefixes).
 *
 * Both were buried inside an 8-line `lines.push(...)` block, with
 * the actual data being smuggled through a closure that read
 * `process.env` directly. Two consequences:
 *
 *   - The "what counts as a Claude env key" knowledge was
 *     unreachable from any other command (e.g. a future
 *     `doctorCommand` env-consistency check, or a future
 *     `explain` command that wants to map an env key to a profile
 *     field). The deletion test: if you delete this module, the
 *     filter reappears in `statusCommand`, and any 2nd caller
 *     would re-derive the same prefix list inline.
 *   - The presenter (`EnvPresenter`) had no clean way to render
 *     the shell-env block without re-implementing the filter. The
 *     alternative — passing `process.env` straight to the presenter
 *     — would leak Node globals into the rendering layer and make
 *     the presenter untestable in isolation.
 *
 * After this module:
 *   - `CLAUDE_ENV_KEY_PREFIXES` is the canonical, exported list of
 *     prefixes. Other modules import it; nobody re-declares it.
 *   - `extractClaudeShellEnv(processEnv)` is the single home for
 *     "given a process.env, return the Claude-relevant subset".
 *     The function is pure, takes a `Record<string, string | undefined>`,
 *     and returns a `Record<string, string>` with non-empty values.
 *   - `commands/status.ts` calls `extractClaudeShellEnv(process.env)`
 *     and hands the result to `ctx.env.formatStatus(...)`. The
 *     command shrinks to a 10-line shell.
 *
 * Locality: every "what is a Claude env key" decision lives here.
 * The deletion test: if you delete this module, the prefix list
 * reappears in `statusCommand` within 5 lines, and the iteration
 * reappears within 10. Both pieces of logic are earning their keep.
 *
 * Why not in `domain/profileSchema.ts`?
 * -------------------------------------
 * `profileSchema.ts` owns the 5 first-class **profile fields**
 * (baseUrl, token, sonnetModel, opusModel, haikuModel) and the
 * env keys each field **owns**. The prefix list here is the
 * broader "all env keys a Claude-related tool might inject" set
 * — it includes `CLAUDE_CODE_*` keys (e.g.
 * `CLAUDE_CODE_SUBAGENT_MODEL`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`)
 * that are not part of the 5-field profile schema. Conflating
 * the two would require a misleading widening of the schema's
 * contract ("these are the 5 fields", plus "and also all
 * CLAUDE_CODE_* keys"). A separate module is the honest
 * separation.
 */
import { isValidEnvKey } from '../utils/shellSafety.js';

/**
 * The env-key prefixes that identify a "Claude env key" — an env
 * var that `claude-profile` knows how to inject via the eval-bridge
 * or that a Claude-related tool (Claude Code, etc.) reads to
 * configure its behavior.
 *
 * Order is significant: the longer, more-specific prefix
 * (`CLAUDE_CODE_`) is listed first so that future logic that walks
 * the prefixes in order can rely on the most specific match
 * winning. Today the order is unused (the function only filters,
 * never resolves an env key to a field), but listing the more
 * specific prefix first is the safer default for the day that
 * resolution becomes a thing.
 */
export const CLAUDE_ENV_KEY_PREFIXES: ReadonlyArray<string> = ['CLAUDE_CODE_', 'ANTHROPIC_'];

/**
 * Pure: given a `process.env`-shaped bag, return a new
 * `Record<string, string>` containing only the entries whose key
 * starts with one of `CLAUDE_ENV_KEY_PREFIXES` and whose value is
 * a non-empty string.
 *
 * Contract:
 *   - Input keys are POSIX-validated via `isValidEnvKey`. A key
 *     that fails validation is **silently dropped** (matches the
 *     "process.env can contain garbage from a misbehaving parent
 *     shell" posture of `engine/envDiff.ts`).
 *   - Empty / undefined values are dropped (the caller wants the
 *     "what is actually set" list, not the "what is unset" list —
 *     the unset list is the diff layer's job).
 *   - Whitespace-only values are kept as-is. The status command
 *     uses the output to show the user what is in their shell;
 *     turning `ANTHROPIC_BASE_URL="   "` into `[hidden]` would
 *     hide a real misconfiguration. The shell is the source of
 *     truth; we display it.
 *   - Output preserves insertion order from the input, matching
 *     the iteration order of `Object.keys(process.env)`.
 *
 * The function is parameterized on the prefix list so that a
 * future call site (e.g. a "doctor: check for stray Claude env
 * keys from previous switches") can pass a custom set without
 * re-implementing the filter.
 */
export function extractClaudeShellEnv(
  processEnv: Record<string, string | undefined>,
  prefixes: ReadonlyArray<string> = CLAUDE_ENV_KEY_PREFIXES,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(processEnv)) {
    if (!isValidEnvKey(key)) continue;
    if (!prefixes.some((p) => key.startsWith(p))) continue;
    const value = processEnv[key];
    if (value === undefined || value === '') continue;
    out[key] = value;
  }
  return out;
}
