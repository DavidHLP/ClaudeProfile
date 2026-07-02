/**
 * Prompts interface — the seam between commands and interactive UI.
 *
 * This file owns two surfaces:
 *   1. The `Prompts` interface — every method a command can invoke.
 *   2. The `realPrompts` implementation — wraps the inquirer-backed
 *      functions from `ui/prompt.ts` so commands don't reach into UI
 *      directly.
 *
 * Why a separate `realPrompts` object instead of re-exporting each
 * function? Because then commands can take a single `ctx.prompts`
 * dependency, and tests can supply a mock that satisfies the whole
 * interface at once. Individual function re-exports would force tests
 * to mock one function at a time and to import the module.
 *
 * Note on the per-field prompt methods
 * -----------------------------------
 * ADR-0003 preserved the 5 hand-rolled `inputApiToken` / `inputBaseUrl` /
 * `inputSonnetModel` / `inputOpusModel` / `inputHaikuModel` methods on
 * `Prompts` "for back-compat with any external embedder that depended
 * on them." Since this is a CLI with no embedders (and the create /
 * edit paths use `inputProfileField` exclusively), the 5 shims have
 * been removed from the `Prompts` interface. The underlying functions
 * still exist as top-level exports of `ui/prompt.ts` for any future
 * embedder that wants them — they are simply no longer part of the
 * command-facing seam.
 */
import type { Profile, ProviderTemplate } from '../types/index.js';
import type { EditableField } from '../types/command.js';
import type { ProfileField } from '../domain/profileSchema.js';
import { PROFILE_FIELDS } from '../domain/profileSchema.js';
import * as prompt from '../ui/prompt.js';

export interface Prompts {
  selectProvider(providers: ProviderTemplate[]): Promise<ProviderTemplate>;
  inputProfileName(defaultName: string): Promise<string>;
  promptForNewName(defaultName: string): Promise<string | null>;
  /**
   * Schema-backed per-field input prompt. Owns the per-field label
   * and the input-time validator (`FieldSpec.validateInput`).
   *
   * Replaces the 5 hand-rolled `inputApiToken` / `inputBaseUrl` /
   * `inputSonnetModel` / `inputOpusModel` / `inputHaikuModel` methods
   * for the `create` and `edit` interactive paths. The per-field
   * prompt functions below are still available as top-level exports
   * of `ui/prompt.ts` for any embedder; new code should call
   * `inputProfileField` instead.
   */
  inputProfileField(
    field: ProfileField,
    options?: { defaultValue?: string }
  ): Promise<string>;
  selectProfileFromList(profiles: Profile[], currentProfile: string | null): Promise<string | null>;
  selectEditField(profile: Profile): Promise<EditableField | null>;
  selectBackup(backups: { name: string; path: string; date: Date }[]): Promise<string | null>;
  confirmAction(message: string): Promise<boolean>;
  promptInput(options: {
    message: string;
    default?: string;
    validate?: (input: string) => string | true;
  }): Promise<string>;
}

/**
 * Real, inquirer-backed implementation. Functions are re-bound here so
 * `this`-style and partial-application issues never leak into command
 * code.
 */
export const realPrompts: Prompts = {
  selectProvider: (providers) => prompt.selectProvider(providers),
  inputProfileName: (defaultName) => prompt.inputProfileName(defaultName),
  promptForNewName: (defaultName) => prompt.promptForNewName(defaultName),
  inputProfileField: (field, options) => {
    const spec = PROFILE_FIELDS[field];
    return prompt.promptInput({
      message: spec.label,
      default: options?.defaultValue,
      validate: spec.validateInput,
    });
  },
  selectProfileFromList: (profiles, currentProfile) => prompt.selectProfileFromList(profiles, currentProfile),
  selectEditField: (profile) => prompt.selectEditField(profile),
  selectBackup: (backups) => prompt.selectBackup(backups),
  confirmAction: (message) => prompt.confirmAction(message),
  promptInput: (options) => prompt.promptInput(options),
};
