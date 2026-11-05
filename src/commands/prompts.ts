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
 * Historical note
 * ---------------
 * The 5 hand-rolled `inputApiToken` / `inputBaseUrl` /
 * `inputSonnetModel` / `inputOpusModel` / `inputHaikuModel` methods
 * were removed from this interface in ADR-0009, then removed from
 * `ui/prompt.ts` itself in this deepening (the deletion test
 * confirmed nothing in the codebase called them once the `Prompts`
 * interface stopped exposing them).
 *
 * The `selectProfileFromList` method was also removed in this
 * deepening. Its responsibility — the rich profile choice formatting
 * (icon + name + provider + token marker) — is now owned by
 * `commands/interactiveSession.ts#defaultProfileChoice`, wired into
 * `runProfileAction` automatically. The previous hand-rolled copy in
 * `ui/prompt.ts` returned a `string | null` (the profile name) and
 * forced callers to re-derive the full `Profile` object from the
 * name; the deepening returns the `Profile` directly through the
 * `runSelectableAction` seam.
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
   * that used to live here. The 5 functions themselves were deleted
   * from `ui/prompt.ts` after the deepening's deletion test
   * confirmed nothing in the codebase still called them.
   */
  inputProfileField(
    field: ProfileField,
    options?: { defaultValue?: string }
  ): Promise<string>;
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
  selectEditField: (profile) => prompt.selectEditField(profile),
  selectBackup: (backups) => prompt.selectBackup(backups),
  confirmAction: (message) => prompt.confirmAction(message),
  promptInput: (options) => prompt.promptInput(options),
};
