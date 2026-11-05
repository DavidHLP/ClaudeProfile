# ADR-0005: VerboseReport seam for EnvPresenter

Status: Accepted (2026-07-02)

## Context

`listCommand` and `validateCommand` both implement a `--verbose` mode that
emits (a) a 5-line "where am I looking" header and (b) per-profile detail
blocks. After ADR-0001 introduced `CommandContext` and the four
`*Command` families started sharing `ctx.env.formatProfileDetail`, the
field-order drift was fixed — but two more shallow duplications were
left in place:

1. **The verbose header.** Four copies of the same 5-line array literal:

   ```ts
   const header = [
     '',
     '详细信息:',
     `  配置目录: ${ctx.profiles.getStoreLocation() || '未知'}`,
     `  当前配置: ${currentProfile || '无'}`,
     `  配置数量: ${profiles.length}`,
   ];
   ```

   Once in `listCommand`, three times in `validateCommand` (the
   no-errors-verbose path, the with-errors-and-verbose path, and a
   subtle hand-rolled variant for the with-errors-and-verbose path
   that pushes `'\\n详细信息:'` instead of starting with `''`).

2. **The issue-block renderer.** `validateCommand`'s with-errors path
   emits two parallel blocks (one for errors, one for warnings) that
   differ only in icon and label. The inner bullet line —
   `  • [${issue.profile}] ${issue.envKey}: ${issue.message}` — is
   the same shape, copy-pasted twice.

ADR-0004's "Follow-up opportunities" section explicitly named the
verbose-header duplication as the next deepening. The issue-block
duplication was a related concern that surfaced as I traced the same
duplication pattern.

The `EnvPresenter` interface is the natural home for both: it already
owns `formatProfileDetail` (the third piece of the verbose report),
`formatError` / `formatWarning` (single-message variants), and
`formatBackupList` (a small structured-list helper).

## Decision

Extend the `EnvPresenter` seam with two new methods:

- **`formatVerboseHeader(input)`** — renders the 5-line "where am I
  looking" header. Returns the 5 lines joined with `\\n`, with no
  leading or trailing newline. The caller supplies the data
  (`storeLocation`, `currentProfile`, `profileCount`) and the
  surrounding whitespace context.

- **`formatValidationIssues(issues)`** — renders the
  "❌ 发现 N 个错误 / ⚠️ 发现 N 个警告" block. Accepts the
  display-shaped issue (`{ profile, envKey, message, severity }`),
  not the schema's profile-free `ValidationIssue` — the seam is
  honest about what it needs. Returns `''` when the input is empty
  so the caller no longer has to guard.

Both methods ship with full JSDoc explaining the contract and a
short note on why the seam exists.

The two callers refactor to:

- **`listCommand`** — single `formatVerboseHeader` call replaces the
  5-line array. One extra `''` separator is kept between `baseOutput`
  and the header to preserve the original 3-newline / 2-blank-line
  spacing exactly.
- **`validateCommand`** — single `formatValidationIssues` call
  replaces the duplicated errors+warnings blocks. The verbose header
  is also called via `formatVerboseHeader`. The `''` separators
  between the issues block, the header, and the detail blocks
  preserve the original 2-newline / 1-blank-line spacing.

10 new tests in `tests/envPresenter.test.ts` cover both methods
(data variants, empty case, ordering invariant, spacing).

## Consequences

Positive:

- **The verbose report has one home.** The 5-line header shape and
  the issue-block shape each live in exactly one place. Changing
  either is a single-file edit.
- **Validate and list stay in lock-step.** Both commands consume
  the same `formatVerboseHeader` — adding a 6th field to the
  header (e.g. "总配置大小") touches the presenter only.
- **The issue-block shape is testable in isolation.** The 10 new
  presenter tests cover the empty case, the errors-only case, the
  warnings-only case, the mixed case, the ordering invariant
  (errors before warnings), and the data-variant fallbacks
  (`未知` / `无`).
- **The legacy command `lines.push('\\n详细信息:')` workaround is
  gone.** The leading-`\\n` push was a copy-paste artifact of the
  original array layout; the new code uses an empty-string separator
  in the array instead, which is the same idiom as the rest of the
  command layer.
- **The schema's `ValidationIssue` and the presenter's
  display-shaped issue are kept distinct.** The schema stays a pure
  function over env (no `profile`); the presenter only needs the
  four fields it renders. The command's adapter
  (`{ ...issue, profile: profile.name }`) is the documented seam.

Negative:

- **Two new methods on the `EnvPresenter` interface.** The interface
  is now 20 methods (was 18). Both new methods are small and have
  documented contracts; the additive growth is justified by the
  4-site deduplication.
- **The presenter now knows the "issue" shape.** It accepts a
  readonly array of `{ profile, envKey, message, severity }` — a
  presenter-shaped type, not the schema's `ValidationIssue`. This
  is intentional: the seam is honest about what it needs, and the
  command's adapter is the test surface for the schema→display
  translation.
- **The `--verbose` spacing is preserved with extra `''`
  separators.** This is a minor readability cost in the command
  layer; the alternative would be to change the user-visible
  spacing, which we chose not to do.

## Alternatives considered

- **One presenter method `formatProfilesReport({ profiles,
  currentProfile, storeLocation, includeDetails, issues? })`.**
  Rejected — the interface would be larger than the two specialized
  methods combined, and tests would have to cover the full matrix
  of `includeDetails × issues × error-count`. Two focused methods
  with smaller test surfaces keep the seam narrower.
- **Move the verbose-header logic into `validateCommand` and have
  `listCommand` import it.** Rejected — `listCommand` does not
  import from `validateCommand` (commands don't depend on each
  other). The presenter is the right place for cross-command
  formatting helpers.
- **Add the issue-block rendering to the `Prompts` interface.**
  Rejected — the `Prompts` interface is for **input** (interactive
  collection), not output. Output belongs in the presenter.
- **Drop the `profile` field from the schema's `ValidationIssue`
  and have callers supply it on display.** Already the case — the
  schema returns profile-free issues, the command attaches
  `profile` for the presenter. This ADR doesn't change that
  layering.
- **Make `formatValidationIssues` accept the schema's
  `ValidationIssue` and call it with `{ ...issue, profile }`.**
  Rejected — that would force the schema's profile-free shape into
  the presenter's input, even though the presenter only needs
  four fields. The adapter is a one-line `{ ...issue, profile }`
  in the command; the seam is the cleaner place to put it.

## References

- `src/presenters/envRenderer.ts` — adds `formatVerboseHeader` and
  `formatValidationIssues` to the interface and the impl
- `src/commands/list.ts` — single `formatVerboseHeader` call
- `src/commands/validate.ts` — single `formatValidationIssues` call
  + single `formatVerboseHeader` call
- `tests/envPresenter.test.ts` — 10 new tests (4 for
  `formatVerboseHeader`, 6 for `formatValidationIssues`)
- `CONTEXT.md` — glossary entry for "Verbose Report" and "Issue
  Block"
- ADR-0004 §"Follow-up opportunities" — explicitly named the
  verbose-header duplication as the next deepening
