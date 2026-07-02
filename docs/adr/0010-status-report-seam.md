# ADR-0010: StatusReport seam and ShellEnv primitive

Status: Accepted (2026-07-02)

## Context

`commands/status.ts` was the **last** command-layer file in the
codebase that inlined its output formatting. Every other command
(create, switch, list, edit, delete, rename, duplicate, import,
export, validate, backup, restore, doctor) routes through
`ctx.env.format*()` after the deepening series of
ADR-0005 / ADR-0006 / ADR-0007 / ADR-0009. `status.ts` was a
36-line blob that mixed 3 layers in one file:

1. **The "what counts as a Claude env key" knowledge** — a
   `startsWith('ANTHROPIC_') || startsWith('CLAUDE_CODE_')` check
   inlined inside an `if (key.startsWith(...))` filter. This is a
   domain concept, not a presentation choice: the same two
   prefixes are what the eval-bridge knows how to inject and what
   a user expects to see when they ask "what's in my shell right
   now?".
2. **The env-extraction loop** — `for (const key of Object.keys(process.env))`
   + a filter + a `Record<string, string>` accumulation. The
   logic is pure, has its own test surface (empty input, mixed
   prefixes, empty values, custom prefix set), and is the kind
   of thing a future `doctorCommand` env-consistency check would
   also want to call.
3. **An 8-line `lines.push(...)` formatting block** that built
   the "当前状态" header, the 3 context lines (current profile /
   store dir / profile count), and the "Shell 环境变量 (注入来源)"
   block. The "what does a status block look like" question was
   answered inline, with the surrounding `''` blanks and `'  '`
   indents hand-rolled.

The two domain pieces (the prefix list and the extraction
filter) had no test surface — they were untested in isolation.
The formatting piece violated the discipline established by
ADR-0005 (verbose header / issue block) and ADR-0006
(diagnostic report), where the 3-layer "domain → presenter →
command" split is the established pattern.

The `EnvPresenter` already owns 19 `format*` methods; adding a
20th (`formatStatus`) is the natural deepening. The `domain/`
folder already houses pure primitives (`profileSchema`,
`diagnostic`); a new `shellEnv` primitive sits next to them.

## Decision

Introduce two seams:

1. **`src/domain/shellEnv.ts`** — owns the Claude env-key
   concept and the extraction primitive.
   - `CLAUDE_ENV_KEY_PREFIXES: ReadonlyArray<string>` — the
     canonical `['CLAUDE_CODE_', 'ANTHROPIC_']` set. Order is
     longer-prefix-first; the function only filters today, but
     listing the more specific prefix first is the safer default
     for the day that resolution becomes a thing.
   - `extractClaudeShellEnv(processEnv, prefixes?): Record<string, string>`
     — the single home for "given a process.env, return the
     Claude-relevant subset". Pure, takes
     `Record<string, string | undefined>`, returns
     `Record<string, string>` with non-empty values. POSIX-invalid
     keys are silently dropped. Whitespace-only values are kept
     as-is (the shell is the source of truth — hiding
     `ANTHROPIC_BASE_URL="   "` would mask a real
     misconfiguration).

2. **`EnvPresenter.formatStatus(input)`** — owns the
   multi-section status block.
   - The caller supplies `currentProfile`, `storeLocation`,
     `profileCount`, `shellEnv` (already filtered), and
     `maskValue` (the masking function from
     `utils/sensitiveKeys.ts`). The presenter trusts the filter
     and the masking policy; it just renders.
   - Returns a string with leading and trailing blank lines so
     callers can drop the result into a `CommandResult.output`
     without further spacing.
   - The shell-env block uses the same `无 … 变量` empty-state
     wording the pre-seam command used, so user-facing output is
     identical.

3. **`commands/status.ts` shrinks to a 10-line shell:**

   ```ts
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
   ```

The 3-layer split mirrors `doctorCommand` (ADR-0006):
`domain/shellEnv.ts` owns the data shaping, the presenter owns
the rendering, and the command shell wires the two together.

## Consequences

Positive:

- **Completes the `EnvPresenter` pattern.** Status is the last
  command with inlined formatting. Every command now follows
  the same 3-layer split.
- **Creates a real `domain/` primitive.** `extractClaudeShellEnv`
  is parameterized on the prefix set, so a future
  `doctorCommand` env-consistency check can reuse the filter
  with a custom set (e.g. "are there any `ANTHROPIC_*` keys in
  the shell that don't belong to the active profile?"). The
  "two adapters" test now has a real second caller candidate.
- **Pins the security policy in one place.** The `maskValue`
  function is now passed in by the command, so the presenter's
  test suite can verify that `ANTHROPIC_AUTH_TOKEN` is masked
  without needing to mock `maskValue` in every test. The masking
  contract is owned by the presenter's interface, not by a
  closure over `utils/sensitiveKeys.ts`.
- **17 new tests** (12 in `tests/shellEnv.test.ts`, 7 in
  `tests/envPresenter.test.ts`, plus 2 updated tests in
  `tests/status.test.ts`) pin the contracts of both new seams.
  Before this ADR, the prefix filter and the extraction loop
  had zero direct tests; both are now exhaustively covered.
- **`commands/status.ts` shrinks 36 → 11 lines.** The shell is
  readable in one screen and impossible to misinterpret.
- **Behavior is preserved.** The output of
  `node bin/claude-profile.js status` is byte-for-byte identical
  to the pre-seam output (same headers, same context lines, same
  shell-env list).

Negative:

- **`formatStatus` takes a `maskValue` callback as input.** A
  simpler API would have the presenter import `maskValue`
  directly. The callback parameter is the price of testability:
  the presenter's tests assert the masking contract end-to-end
  without needing to mock the `utils/sensitiveKeys` module. The
  command is the single caller that knows where the real
  `maskValue` lives, and threads it in once.
- **A new public re-export in `src/index.ts`** (the two
  `shellEnv` exports). The new exports are additive — no
  existing call site changes.
- **The new domain module is a "real seam" with one caller
  today.** Per the discipline "1 adapter = hypothetical seam,
  2 adapters = real seam", a primitive with one caller is on
  the borderline. The decision to extract it anyway is based
  on the fact that the prefix list is a stable, named domain
  concept ("Claude env keys") that the comment in
  `commands/status.ts` would otherwise have to keep re-naming
  inline. The seam is "real" in the sense that the concept is
  named, even if the function has one caller today.

## Alternatives considered

- **Put the prefix list and the extraction logic inside
  `formatStatus`.** Rejected — that conflates the "what is a
  Claude env key" question (a domain concept) with the "what
  does a status block look like" question (a presentation
  choice). A future caller that wants the filter without the
  rendering would have to re-derive the prefix list inline.
- **Put the prefix list in `domain/profileSchema.ts` next to
  `SENSITIVE_ENV_KEYS`.** Rejected — the schema owns the
  5 first-class profile fields and the env keys each field
  owns. The prefix list here is the broader "all env keys a
  Claude-related tool might inject" set, which includes
  `CLAUDE_CODE_*` keys that are not part of the 5-field
  profile schema. Conflating the two would require a
  misleading widening of the schema's contract.
- **Skip the `maskValue` callback parameter; import `maskValue`
  directly in the presenter.** Rejected — the masking policy
  is a security-sensitive contract, and the presenter's test
  suite should be able to assert the contract end-to-end with
  a stubbed `maskValue` rather than relying on the real
  `utils/sensitiveKeys.ts`. The callback parameter is the
  cost of testability; the command is the natural place to
  thread it (the command is the only caller that knows where
  the real `maskValue` lives).
- **Inline the format and add unit tests for the command
  directly (skip the presenter seam).** Rejected — every
  other command in the codebase already routes through the
  presenter. Skipping the seam for `status` would leave it as
  the lone outlier, and the next deepening pass would
  re-suggest the same extraction. The discipline pays off
  precisely because it is applied uniformly.

## References

- `src/domain/shellEnv.ts` — new module
- `src/presenters/envRenderer.ts` — adds `formatStatus`
- `src/commands/status.ts` — shrinks 36 → 11 lines
- `src/index.ts` — re-exports `CLAUDE_ENV_KEY_PREFIXES`,
  `extractClaudeShellEnv`
- `tests/shellEnv.test.ts` — 12 new tests
- `tests/envPresenter.test.ts` — 7 new tests for `formatStatus`
- `tests/status.test.ts` — 2 tests refactored to assert via
  the seam
- `CONTEXT.md` — new "Status Report" and "Claude Env Key
  Prefix Set" glossary entries
- ADR-0005 — established the `format*` method pattern
- ADR-0006 — established the 3-layer `domain → presenter →
  command` split
- ADR-0007 — established the "one place owns the data
  shaping" pattern
