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
 */
import type { Profile, ProviderTemplate } from '../types/index.js';
import type { EditableField } from '../types/command.js';
import * as prompt from '../ui/prompt.js';

export interface Prompts {
  selectProvider(providers: ProviderTemplate[]): Promise<ProviderTemplate>;
  inputProfileName(defaultName: string): Promise<string>;
  promptForNewName(defaultName: string): Promise<string | null>;
  inputApiToken(): Promise<string>;
  inputBaseUrl(defaultValue?: string): Promise<string>;
  inputSonnetModel(defaultValue?: string): Promise<string>;
  inputOpusModel(defaultValue?: string): Promise<string>;
  inputHaikuModel(defaultValue?: string): Promise<string>;
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
  inputApiToken: () => prompt.inputApiToken(),
  inputBaseUrl: (defaultValue) => prompt.inputBaseUrl(defaultValue),
  inputSonnetModel: (defaultValue) => prompt.inputSonnetModel(defaultValue),
  inputOpusModel: (defaultValue) => prompt.inputOpusModel(defaultValue),
  inputHaikuModel: (defaultValue) => prompt.inputHaikuModel(defaultValue),
  selectProfileFromList: (profiles, currentProfile) => prompt.selectProfileFromList(profiles, currentProfile),
  selectEditField: (profile) => prompt.selectEditField(profile),
  selectBackup: (backups) => prompt.selectBackup(backups),
  confirmAction: (message) => prompt.confirmAction(message),
  promptInput: (options) => prompt.promptInput(options),
};
