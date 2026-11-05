/**
 * Pure env-diff module — machine-facing env transformation.
 *
 * Two families of outputs:
 *   1. JSON-shape (set/unset) for programmatic consumers (e.g. shell hook's jq path)
 *   2. Shell `export`/`unset` statements for `eval`-bridge consumers
 *
 * Architecture
 * ------------
 * The "diff two envs" primitive (`diffEnvs`) is the single deep module
 * behind every output format. Each formatter is a 5-line adapter that
 * turns `{ set, unset }` into the wire format the consumer wants.
 *
 * Before this seam, `buildSwitchJson` and `buildSwitchCommands` both
 * re-implemented the same `oldKeys`/`newKeys` iteration, and
 * `validateEnvKeyOrThrow` was called 4 times across the file (twice
 * per builder). The deletion test: if you delete the primitive, the
 * diff logic reappears inside `switchCommand` and `exportCommand` —
 * they would both need to know how to compute set/unset. Keeping
 * the diff in one place means adding a new output format (e.g.
 * fish-shell `set -gx`) is 4 lines, not 20.
 *
 * No I/O, no I/O-aware side effects, no class — these are functions whose
 * output is fully determined by their inputs. They sit in `engine/`
 * rather than `presenters/` because the contract is data, not display.
 */
import { EnvConfig } from '../types/index.js';
import { validateEnvKeyOrThrow, shellQuote } from '../utils/shellSafety.js';

/**
 * The diff primitive.
 *
 *   - `set` contains every non-empty key in `newEnv` (POSIX-validated).
 *   - `unset` contains every non-empty key in `oldEnv` that is missing
 *     or empty in `newEnv` (POSIX-validated).
 *
 * Whitespace-only values are treated as empty, consistent with the
 * schema's `applyField` / `validateProfile` semantics.
 *
 * The order of `set` follows `Object.entries(newEnv)`; the order of
 * `unset` follows `Object.entries(oldEnv)`. Callers that need a
 * stable order should sort the result themselves.
 */
export interface EnvJsonOutput {
  set: Record<string, string>;
  unset: string[];
}

export interface EnvDiff extends EnvJsonOutput {}

export function diffEnvs(oldEnv: EnvConfig | null, newEnv: EnvConfig): EnvDiff {
  const set: Record<string, string> = {};
  const unset: string[] = [];

  const oldKeys = new Set<string>();
  if (oldEnv) {
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value && value.trim()) {
        oldKeys.add(key);
      }
    }
  }

  const newKeys = new Set<string>();
  for (const [key, value] of Object.entries(newEnv)) {
    if (value && value.trim()) {
      newKeys.add(key);
      validateEnvKeyOrThrow(key);
      set[key] = value;
    }
  }

  for (const key of oldKeys) {
    if (!newKeys.has(key)) {
      validateEnvKeyOrThrow(key);
      unset.push(key);
    }
  }

  return { set, unset };
}

/**
 * Build the env to apply when activating a profile in isolation (no prior profile).
 * Only `set` is meaningful; `unset` is always empty.
 */
export function buildExportJson(env: EnvConfig): EnvJsonOutput {
  return diffEnvs(null, env);
}

/**
 * Build the env diff between the previous profile and the new one.
 * - `set` contains every non-empty key in `newEnv`
 * - `unset` contains every non-empty key in `oldEnv` that is missing or empty in `newEnv`
 */
export function buildSwitchJson(oldEnv: EnvConfig | null, newEnv: EnvConfig): EnvJsonOutput {
  return diffEnvs(oldEnv, newEnv);
}

/**
 * Render env as a series of `export KEY='value';` statements, one per line.
 * Empty/undefined values are skipped. Keys are POSIX-validated.
 */
export function buildExportCommands(env: EnvConfig): string {
  const diff = diffEnvs(null, env);
  return formatExportShell(diff);
}

/**
 * Render the env transition as `unset KEY;` followed by `export KEY='value';` statements.
 * Order: all unsets first, then all exports. This matches the existing eval-bridge contract.
 */
export function buildSwitchCommands(oldEnv: EnvConfig | null, newEnv: EnvConfig): string {
  const diff = diffEnvs(oldEnv, newEnv);
  return formatSwitchShell(diff);
}

/**
 * Render a `diff` as a single JSON string. Format-stable: object keys
 * appear in insertion order (insertion order = `Object.entries(newEnv)`).
 */
export function formatEnvJson(diff: EnvDiff): string {
  return JSON.stringify(diff);
}

/**
 * Render a `diff` as `export KEY='value';` statements, one per line.
 * Keys appear in insertion order. `unset` is ignored — this formatter
 * is for the "first-time export" case where nothing needs unsetting.
 */
export function formatExportShell(diff: EnvDiff): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(diff.set)) {
    lines.push(`export ${key}=${shellQuote(value)};`);
  }
  return lines.join('\n');
}

/**
 * Render a `diff` as the eval-bridge contract:
 *   - every `unset` key first (in `unset` order)
 *   - then every `set` entry as `export KEY='value';`
 *
 * This ordering is the eval bridge's contract: env keys that disappear
 * must be unset before the new values are exported, otherwise the
 * stale value would survive if a subsequent command reads the env.
 */
export function formatSwitchShell(diff: EnvDiff): string {
  const lines: string[] = [];
  for (const key of diff.unset) {
    lines.push(`unset ${key};`);
  }
  for (const [key, value] of Object.entries(diff.set)) {
    lines.push(`export ${key}=${shellQuote(value)};`);
  }
  return lines.join('\n');
}
