/**
 * Doctor — runs the diagnostic checks (owned by
 * `domain/diagnostic.ts`) and formats the report (owned by
 * `presenters/envRenderer.ts#formatDiagnosticReport`).
 *
 * The command itself is a 10-line shell: the 7 check functions and
 * the report shape used to be inlined here. The deepening is:
 *
 *   1. `runDiagnostics(ctx)` — single entry point in
 *      `domain/diagnostic.ts`; returns the ordered `CheckResult[]`.
 *   2. `ctx.env.formatDiagnosticReport(results)` — owns the line
 *      shape (icon + name + message + summary) and the spacing.
 *   3. This file maps `{ success, output }` based on whether any
 *      check was an error.
 *
 * Mirrors the pattern ADR-0005 used for `validateCommand`'s
 * `formatValidationIssues` and `formatVerboseHeader`.
 */
import { CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';
import { runDiagnostics } from '../domain/diagnostic.js';
import type { CommandContext } from './context.js';

export async function doctorCommand(ctx: CommandContext): Promise<CommandResult> {
  return runCommand('诊断检查', async () => {
    const results = runDiagnostics(ctx);
    const output = ctx.env.formatDiagnosticReport(results);
    const hasErrors = results.some((c) => c.status === 'error');
    if (hasErrors) {
      return { success: false, error: output };
    }
    return { success: true, output };
  });
}
