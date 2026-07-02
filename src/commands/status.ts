/**
 * Status — a 10-line shell over the `formatStatus` presenter and the
 * `extractClaudeShellEnv` domain primitive.
 *
 * The 3 layers and their owners (mirrors the `doctorCommand`
 * pattern from ADR-0006):
 *
 *   1. **Domain shaping** (`domain/shellEnv.ts`) — owns the
 *      "what counts as a Claude env key" question and the
 *      `extractClaudeShellEnv` filter.
 *   2. **Rendering** (`presenters/envRenderer.ts#formatStatus`) —
 *      owns the "what does a status block look like" question,
 *      including the `maskValue` policy for sensitive keys.
 *   3. **Command shell** (this file) — wires the two together and
 *      surfaces the result as a `CommandResult`.
 *
 * Pre-seam this file was a 36-line blob: an 8-line `lines.push(...)`
 * formatting block inlined alongside a `startsWith('ANTHROPIC_')` /
 * `startsWith('CLAUDE_CODE_')` filter and a `for…of Object.keys(process.env)`
 * iteration. The deletion test: remove the two seams and both
 * pieces of logic reappear in this file within 15 lines.
 */
import { CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';
import { extractClaudeShellEnv } from '../domain/shellEnv.js';
import { maskValue } from '../utils/sensitiveKeys.js';
import type { CommandContext } from './context.js';

export async function statusCommand(ctx: CommandContext): Promise<CommandResult> {
  return runCommand('状态查询', async () => {
    const shellEnv = extractClaudeShellEnv(process.env);
    return {
      success: true,
      output: ctx.env.formatStatus({
        currentProfile: ctx.profiles.getCurrentProfile(),
        storeLocation: ctx.profiles.getStoreLocation(),
        profileCount: ctx.profiles.listProfiles().length,
        shellEnv,
        maskValue,
      }),
    };
  });
}
