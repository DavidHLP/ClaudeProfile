/**
 * Command execution context — the seam between CLI commands and the
 * collaborators they depend on.
 *
 * Why this exists
 * ---------------
 * Before this module, every command in `src/commands/*.ts` directly imported
 * two module-level singletons (`profileService`, `envPresenter`) and used
 * `await import('../ui/prompt.js')` to lazy-load `inquirer`. The
 * `ProfileService` and `EnvPresenter` interfaces existed but never flowed
 * through the command signatures. Consequences:
 *
 *   - Commands were untestable in isolation. `tests/commands.test.ts` had
 *     to `vi.mock('../src/services/profileService.js', ...)` at the top
 *     of the file and hand-build a mock chain covering every method.
 *   - Every interactive command carried the same `await import('...prompt')`
 *     dance, which was a workaround for not having a clean prompt seam.
 *   - The provider-to-profile materialization was inlined inside
 *     `commands/create.ts`, leaking provider details into the command.
 *
 * After this module:
 *   - Each command accepts a `CommandContext` as its first argument.
 *   - Tests construct a fresh context per test (no `vi.mock` needed).
 *   - Prompts flow through a `Prompts` interface, not a module import.
 *   - The bin constructs a real context once and threads it through.
 *
 * Backward compatibility
 * ----------------------
 * The legacy singletons (`profileService`, `envPresenter`) are still
 * exported from their original modules and remain the *defaults* used by
 * `createDefaultContext()`. Existing consumers of those exports are
 * unaffected. New code should depend on the interfaces, not the singletons.
 */
import type { Profile, ProviderTemplate } from '../types/index.js';
import type { EditableField } from '../types/command.js';
import type { ProfileService } from '../services/profileService.js';
import type { EnvPresenter } from '../presenters/envRenderer.js';
import { profileService as defaultProfileService } from '../services/profileService.js';
import { envPresenter as defaultEnvPresenter } from '../presenters/envRenderer.js';
import { realPrompts, type Prompts } from './prompts.js';

export type { Prompts } from './prompts.js';
export { realPrompts } from './prompts.js';

export interface CommandContext {
  /** Profile persistence + current-profile tracking. */
  readonly profiles: ProfileService;
  /** Human-facing output formatting. */
  readonly env: EnvPresenter;
  /** Interactive prompts — replaceable for tests / headless contexts. */
  readonly prompts: Prompts;
  /** Whether stdout is a TTY; controls banner vs shell-export output. */
  readonly isTTY: boolean;
}

/**
 * Construct the production context. Used by `bin/claude-profile.js` once
 * per invocation. Tests should construct a context directly via
 * `createTestContext()` (or by hand) rather than calling this.
 */
export function createDefaultContext(isTTY: boolean = process.stdout.isTTY): CommandContext {
  return {
    profiles: defaultProfileService,
    env: defaultEnvPresenter,
    prompts: realPrompts,
    isTTY,
  };
}

/**
 * Test-time context factory. Takes the dependencies you want to override;
 * any field not supplied falls back to the default. Returns a mutable
 * bag so tests can stub methods on the underlying service without
 * instantiating `ProfileServiceImpl`.
 */
export interface TestContextOverrides {
  profiles?: ProfileService;
  env?: EnvPresenter;
  prompts?: Prompts;
  isTTY?: boolean;
}

export function createTestContext(overrides: TestContextOverrides = {}): CommandContext {
  return {
    profiles: overrides.profiles ?? defaultProfileService,
    env: overrides.env ?? defaultEnvPresenter,
    prompts: overrides.prompts ?? noopPrompts,
    isTTY: overrides.isTTY ?? false,
  };
}

/**
 * No-op prompts — used as a safe default in tests so an accidentally-
 * interactive command fails loudly (because the no-op returns sentinel
 * empty strings, which then trigger validation errors) rather than
 * blocking on a real `inquirer` prompt.
 */
export const noopPrompts: Prompts = {
  selectProvider: async () => ({ id: 'custom', name: 'Custom', description: '', defaultBaseUrl: '', defaultModel: '', envTemplate: {} } as ProviderTemplate),
  inputProfileName: async () => '',
  promptForNewName: async () => null,
  inputApiToken: async () => '',
  inputBaseUrl: async () => '',
  inputSonnetModel: async () => '',
  inputOpusModel: async () => '',
  inputHaikuModel: async () => '',
  selectProfileFromList: async (_profiles: Profile[], _current: string | null) => null,
  selectEditField: async (_profile: Profile) => null as EditableField | null,
  selectBackup: async () => null,
  confirmAction: async () => false,
  promptInput: async () => '',
};
