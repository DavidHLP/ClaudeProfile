/**
 * Pure env-diff module — machine-facing env transformation.
 *
 * Two families of outputs:
 *   1. JSON-shape (set/unset) for programmatic consumers (e.g. shell hook's jq path)
 *   2. Shell `export`/`unset` statements for `eval`-bridge consumers
 *
 * No I/O, no I/O-aware side effects, no class — these are functions whose
 * output is fully determined by their inputs. They sit in `engine/` rather
 * than `presenters/` because the contract is data, not display.
 */
import { EnvConfig } from '../types/index.js';
import { validateEnvKeyOrThrow, shellQuote } from '../utils/shellSafety.js';

export interface EnvJsonOutput {
  set: Record<string, string>;
  unset: string[];
}

/**
 * Build the env to apply when activating a profile in isolation (no prior profile).
 * Only `set` is meaningful; `unset` is always empty.
 */
export function buildExportJson(env: EnvConfig): EnvJsonOutput {
  const set: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value) {
      validateEnvKeyOrThrow(key);
      set[key] = value;
    }
  }
  return { set, unset: [] };
}

/**
 * Build the env diff between the previous profile and the new one.
 * - `set` contains every non-empty key in `newEnv`
 * - `unset` contains every non-empty key in `oldEnv` that is missing or empty in `newEnv`
 */
export function buildSwitchJson(oldEnv: EnvConfig | null, newEnv: EnvConfig): EnvJsonOutput {
  const set: Record<string, string> = {};
  const unset: string[] = [];

  const oldKeys = new Set<string>();
  if (oldEnv) {
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value) {
        oldKeys.add(key);
      }
    }
  }

  const newKeys = new Set<string>();
  for (const [key, value] of Object.entries(newEnv)) {
    if (value) {
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
 * Render env as a series of `export KEY='value';` statements, one per line.
 * Empty/undefined values are skipped. Keys are POSIX-validated.
 */
export function buildExportCommands(env: EnvConfig): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (value) {
      validateEnvKeyOrThrow(key);
      lines.push(`export ${key}=${shellQuote(value)};`);
    }
  }
  return lines.join('\n');
}

/**
 * Render the env transition as `unset KEY;` followed by `export KEY='value';` statements.
 * Order: all unsets first, then all exports. This matches the existing eval-bridge contract.
 */
export function buildSwitchCommands(oldEnv: EnvConfig | null, newEnv: EnvConfig): string {
  const lines: string[] = [];

  const oldKeys = new Set<string>();
  if (oldEnv) {
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value) {
        oldKeys.add(key);
      }
    }
  }

  const newKeys = new Set<string>();
  for (const [key, value] of Object.entries(newEnv)) {
    if (value) {
      newKeys.add(key);
    }
  }

  for (const key of oldKeys) {
    if (!newKeys.has(key)) {
      validateEnvKeyOrThrow(key);
      lines.push(`unset ${key};`);
    }
  }

  for (const [key, value] of Object.entries(newEnv)) {
    if (value) {
      validateEnvKeyOrThrow(key);
      lines.push(`export ${key}=${shellQuote(value)};`);
    }
  }

  return lines.join('\n');
}
