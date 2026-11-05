# ADR-0006: Diagnostic module seam

Status: Accepted (2026-07-02)

## Context

`commands/doctor.ts` was a 189-line blob that mixed 3 layers in one
file:

1. **7 hand-rolled check functions** (`checkConfigDir`,
   `checkProfileFiles`, `checkProfiles`, `checkCurrentProfile`,
   `checkHook`, `checkGitRepo`, `checkEnvConsistency`), each
   carrying its own try/catch and its own I/O (fs.statSync,
   fs.readdirSync, fs.readFileSync, homedir, process.cwd()).
2. **An 11-line `lines.push(...)` report block** that lived at
   the bottom of `doctorCommand` and constructed the
   "诊断报告 / ✗ 配置目录: … / 总结: N 通过, M 警告, K 错误"
   shape.
3. **The command shape** (`runCommand` wrapper, `CommandResult`
   return) — the only thing a command layer is supposed to do.

Consequences:

1. **Each check was a shallow module.** The interface
   (`{ name, status, message, suggestion }`) was nearly as wide as
   the 15-line implementation, and the report shape lived in the
   command, not in a presenter. Adding a new check meant editing
   both the check list and the report block.
2. **No test surface for individual checks.** `tests/doctor.test.ts`
   had 2 cases. The 7 checks had zero isolated coverage; the only
   thing tested was the "diagnostic report" string appearing in
   the output.
3. **The pattern violated the discipline established by ADR-0005.**
   `validateCommand`'s verbose header and issue block were already
   owned by `EnvPresenter.formatVerboseHeader` /
   `formatValidationIssues`. `doctorCommand`'s report was the
   last "inline report shape in a command" left in the codebase.

## Decision

Introduce a `Diagnostic` module at `src/domain/diagnostic.ts` that
owns the check shape and the runner. Add `formatDiagnosticReport`
to the `EnvPresenter`. The command shrinks to a 10-line shell.

**`src/domain/diagnostic.ts`** owns:

- `CheckStatus` type — `'ok' | 'warning' | 'error'`.
- `CheckResult` interface — `{ name, status, message, suggestion? }`.
- 7 check functions (the same logic that was inlined in
  `commands/doctor.ts`, lifted verbatim to keep behavior identical).
- `runDiagnostics(ctx: CommandContext): CheckResult[]` — the single
  entry point the command calls. The individual check functions
  are not exported (they are implementation detail).

**`src/presenters/envRenderer.ts`** gains:

- `formatDiagnosticReport(results: ReadonlyArray<CheckResult>): string`
  on the `EnvPresenter` interface and the `EnvPresenterImpl`
  implementation. Owns the per-check line shape
  (`${icon} ${name}: ${message}` + optional `→ ${suggestion}`) and
  the `总结: N 通过, M 警告, K 错误` summary line.

**`src/commands/doctor.ts`** collapses to:

```ts
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
```

## Consequences

Positive:

- **The 7-check shape has one home.** Adding a check is one new
  function in `domain/diagnostic.ts` plus adding it to the
  `CHECKS` array. Removing a check is removing it from the array.
- **The report shape has one home.** The icon-per-status,
  per-line indent, suggestion rendering, and summary line live in
  `formatDiagnosticReport`. Changing the report is a one-file edit.
- **The test surface explodes.** `tests/diagnostic.test.ts` has
  17 new tests covering every check (empty case, error case,
  warning case, ok case) plus 6 presenter tests for the report
  shape. `tests/doctor.test.ts` is reduced to 2 integration
  tests (the command shape itself).
- **Mirrors the pattern from ADR-0005.** `formatDiagnosticReport`
  joins `formatVerboseHeader` and `formatValidationIssues` on
  the presenter; the command layer no longer inlines any report
  shape.
- **No new port.** All 7 checks are local-substitutable with
  the existing `InMemoryConfigStore` + `vi.mock('fs')` pattern
  (already in `tests/doctor.test.ts`). The deepening is
  in-process per `DEEPENING.md`.

Negative:

- **`doctorCommand` no longer carries the check list inline.** A
  reader looking at `commands/doctor.ts` has to follow the import
  to `domain/diagnostic.ts` to see what gets checked. This is the
  same trade-off ADR-0001 took with `runProfileAction`.
- **The check functions live in a domain module but reach into
  `fs` / `os` / `process.cwd()`.** The module is "domain" in the
  sense of "what does a diagnostic look like" — the I/O is
  implementation detail, not part of the public surface. The seam
  the test exercises is `runDiagnostics`, not the individual
  checks.

## Alternatives considered

- **Add the report rendering to `ui/prompt.ts` (the prompts
  seam).** Rejected — the prompts seam is for *input*, not output.
  Output belongs in the presenter.
- **Make each check a class with a `run(ctx)` method.** Rejected
  — the 7 checks are 5-line functions; classes would be more
  ceremony than the domain warrants. The `runDiagnostics`
  function is the deep module; the individual check functions
  are private helpers.
- **Move the 7 check functions into `services/` alongside the
  other ports.** Rejected — none of the checks needs a port.
  `checkProfiles` reads from `ctx.profiles`; the rest read from
  `fs` / `os` / `process.cwd()`. A service-level location would
  imply a port that doesn't exist.
- **Skip the ADR and ship the deepening in one commit.** Rejected
  — the change touches 3 files (the new `diagnostic.ts`, the
  presenter, the command) and 2 test files. The ADR is the
  durable record of why the seam exists and what to do if a 8th
  check ever needs to be added.

## References

- `src/domain/diagnostic.ts` — new module
- `src/presenters/envRenderer.ts` — adds `formatDiagnosticReport`
- `src/commands/doctor.ts` — shrinks from 189 → 34 lines
- `tests/diagnostic.test.ts` — 17 new tests
- `CONTEXT.md` — new "Diagnostic" glossary entry
- ADR-0005 — established the inline-report→presenter pattern
- ADR-0001 — established the CommandContext seam
