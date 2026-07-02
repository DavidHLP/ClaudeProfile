import { CommandResult } from '../types/command.js';
import { renderShellHook } from '../engine/shellHook.js';

/**
 * `init` — emit the shell hook script for `eval "$(claude-profile init)"`.
 *
 * The script itself is composed by `engine/shellHook.ts#renderShellHook`
 * from 4 named, individually testable pieces:
 *   - bin discovery
 *   - plain-text safe-eval bridge
 *   - JSON eval bridge
 *   - dispatch function
 *   - default env baseline block
 *
 * The snapshot test in `tests/shellHook.test.ts` pins the rendered output.
 *
 * Note: `init` does not take a `CommandContext` because it has no
 * dependency on the profile service or the env presenter. It is
 * intentionally pure (output is fully determined by `renderShellHook`),
 * which is why the test for it doesn't need a context either.
 */
export async function initCommand(): Promise<CommandResult> {
  return {
    success: true,
    output: renderShellHook(),
  };
}
