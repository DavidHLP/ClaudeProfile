# ADR-0011: Profile import pipeline seam

Status: Accepted (2026-07-02)

## Context

`commands/import.ts` was a 75-line blob that mixed 4 layers in one
file:

1. **File I/O** — `readFileSync` + `FileOperationError` wrap.
2. **Format detection** — `detectFormat(inputPath, format?)`, an
   extension-based dispatch with an explicit override.
3. **Format-specific parsing** — `parseProfileFile(content, format)`,
   a 4-line `JSON.parse` / `YAML.parse` switch.
4. **Validation pipeline** — `validateImportedProfile` (shape
   check) + 3 `validate*` calls from `utils/validation.ts`
   (`validateProfileName`, `validateEnvKey`, `validateEnvValue`)
   + a loop validating every env key + value.

Consequences:

1. **No test surface for the import pipeline.** The non-interactive
   path had zero direct tests. The 11 tests in
   `tests/validation.test.ts` exercised `validateUrl`,
   `validateToken`, and `ValidationError` — but **none of those
   were used by the import command** (or any other command). They
   were vestigial: 4 dead exports in `utils/validation.ts` and
   11 tests pinning a contract no caller cared about.
2. **`utils/validation.ts` was a pass-through.** The 3 exports
   the import command used (`validateProfileName`,
   `validateEnvKey`, `validateEnvValue`) were inlined into a
   `for (const [key, value] of Object.entries(parsed.env))` loop
   that re-wrapped each `ValidationError` into a fresh `AppError`
   — the `ValidationError` class carried no information not
   already on `AppError`. The "validate" function returned
   `null | ValidationError`, which the caller immediately
   unpacked and re-threw. The "validation" was a thin wrapper
   over `AppError` construction.
3. **The pattern violated the discipline established by ADR-0002
   and ADR-0006.** `domain/profileSchema.ts` owns "what does a
   valid profile look like" and `domain/diagnostic.ts` owns "what
   does a valid health-check shape look like". "What does a
   valid import look like" was the last "inline shape check in a
   command" left in the codebase.

## Decision

Introduce a `Profile Import` module at `src/domain/profileImport.ts`
that owns the parse + validate pipeline. Delete the dead exports
in `utils/validation.ts`. The import command shrinks to a 5-step
shell.

**`src/domain/profileImport.ts`** owns:

- `ImportFormat` type — `'json' | 'yaml'`.
- `ProfileImportError extends AppError` — the typed error for the
  pipeline. Extends `AppError` so the command's `runCommand`
  wrapper (which checks `err instanceof AppError`) catches it
  without any special-casing.
- `detectImportFormat(filePath, override?)` — pure path-based
  format detection. The override wins when present; otherwise
  the path extension is the source of truth. `.yml` is treated
  as `yaml` (community convention). Anything else (including
  no extension) defaults to `json`.
- `parseImportedProfile(content, format, profileNameOverride?)`
  — the single entry point the command calls. The validation
  order is load-bearing: parse → shape → name → env keys →
  env values. Stops at the first failure.
- Internal shape guard `isProfileShape(raw)` (implementation
  detail) and the profile-name regex (the policy previously
  inlined in `utils/validation.ts#PROFILE_NAME_REGEX`).

**`src/commands/import.ts`** collapses to:

```ts
export async function importFileCommand(ctx, input) {
  return runCommand('导入配置', async () => {
    const format = detectImportFormat(input.inputPath, input.format);
    let content: string;
    try {
      content = readFileSync(input.inputPath, 'utf-8');
    } catch (err) {
      throw new FileOperationError('read', input.inputPath, err);
    }
    const profile = parseImportedProfile(content, format, input.profileName);
    if (ctx.profiles.profileExists(profile.name) && !input.force) {
      throw new ProfileAlreadyExistsError(profile.name);
    }
    ctx.profiles.saveProfile(profile);
    return { success: true, output: ctx.env.formatImportSuccess(profile.name, input.inputPath) };
  });
}
```

The interactive path (`importFileCommandInteractive`) reuses
`detectImportFormat` (instead of the previous inline
`endsWith('.yaml')` check) so the two paths cannot drift on
what counts as a YAML file.

**`src/utils/validation.ts`** is deleted. The 3 used exports
(`validateProfileName`, `validateEnvKey`, `validateEnvValue`,
plus the `ValidationError` class) moved into the new module as
internal helpers. The 4 dead exports (`validateUrl`,
`validateToken`, `validateProfileUrl`, `validateProfileToken`)
and the unused `ProfileValidationResult` interface are gone.

**`tests/validation.test.ts`** is deleted (it pinned the dead
exports). **`tests/profileImport.test.ts`** is new — 35 tests
covering format detection, JSON / YAML happy paths, every
validation failure mode, and the `ProfileImportError` class.

## Consequences

Positive:

- **The import shape has one home.** "What does a valid
  imported profile look like?" is answered in one place. Adding
  a new format (e.g. `.toml`) is one branch in
  `detectImportFormat` and one branch in the parse loop, not 30
  lines of spread.
- **The dead code is gone.** `validateUrl`, `validateToken`,
  `validateProfileUrl`, `validateProfileToken`, and
  `ProfileValidationResult` were never called outside their own
  test file (verified via `grep -rn`). 60+ lines of code and
  11 tests are removed; the contracts they pinned are no longer
  part of the public API.
- **The test surface explodes.** 35 new tests pin the import
  pipeline. Before this ADR, the import command had zero direct
  tests; the inline `validateImportedProfile` shape check was
  not exercised. The new tests cover every failure mode (bad
  JSON / YAML, missing name, missing env, bad env key, bad env
  value type, null bytes, newlines).
- **Mirrors the pattern from ADR-0002 and ADR-0006.**
  `domain/profileImport.ts` joins `domain/profileSchema.ts` and
  `domain/diagnostic.ts` as a "pure functions over a domain
  shape" primitive. The command layer no longer inlines any
  shape check.
- **`ProfileImportError extends AppError`.** The `runCommand`
  wrapper's `err instanceof AppError` branch catches it without
  any special-casing, and the existing test infrastructure
  (`tests/commands.test.ts`'s `runCommand` usage) applies
  unchanged. The new error class is additive — no existing call
  site changes.
- **The 2-adapter discipline is satisfied.** The seam has 2
  real callers (the non-interactive and interactive paths in
  `commands/import.ts`), so it earns its keep per the
  "1 adapter = hypothetical, 2 = real" rule from
  `DEEPENING.md`. The seam is also unit-tested in isolation
  with 35 tests.

Negative:

- **Behavior tightening for non-string descriptions.** The
  pre-refactor code's `parsed.description || ''` would accept
  any truthy value (e.g. `description: 1` would save as
  `"1"`). The new code's
  `typeof raw.description === 'string' ? raw.description : ''`
  rejects non-strings. This is a tightening, not a
  loosening — and the more-correct behavior — but it is a
  behavior change. No production profile uses a non-string
  description today.
- **`NAME_REQUIRED` error code is unreachable from the import
  pipeline.** The pre-refactor
  `validateProfileName(name: '')` would have thrown
  `NAME_REQUIRED`, but the import path's
  `isProfileShape(raw)` check rejects an empty `name` first
  with `INVALID_PROFILE_SCHEMA`. The branch is preserved
  inside the parser for defense-in-depth (a future caller
  could pre-validate a name from a different source), but no
  test exercises it through the import path. This was
  unreachable in the pre-refactor code too — the
  `validateProfileName` was called with `profileName =
  profileNameOverride?.trim() || parsed.name`, and the
  command layer's shape check rejected empty `parsed.name`
  before `validateProfileName` ever saw it.
- **`src/index.ts` adds 3 new public exports.** The
  re-exports are additive — no existing call site changes.
- **The 3 former `utils/validation.ts` exports are no longer
  importable from the `utils/` path.** This is intentional
  (they were coupled to a single caller), but any embedder
  that imported them directly would need to update. None do —
  `src/index.ts` never re-exported `utils/validation.ts`.

## Alternatives considered

- **Keep `utils/validation.ts` and add the import pipeline as
  a thin wrapper around its existing exports.** Rejected —
  this preserves the 4 dead exports and the
  `ValidationError`-into-`AppError` re-wrap dance. The point
  of the seam is to own the whole pipeline; leaving the
  "validation as a separate utility" framing defeats the
  purpose.
- **Put the import pipeline in `services/importParser.ts` or
  `engine/importParser.ts`.** Rejected — neither
  `services/` (which is the I/O-or-port layer) nor `engine/`
  (which is the data-shaping layer) is the right home for
  "what does a valid import look like". The pattern from
  ADR-0002 (profileSchema) and ADR-0006 (diagnostic) is to
  put pure-functions-over-a-domain-shape primitives in
  `domain/`. The import pipeline is the same shape of
  primitive.
- **Add a `runInputAction` higher-order function (the
  non-list variant of `runSelectableAction`) and route
  `importFileCommandInteractive` through it.** Rejected as
  out of scope. The interactive path is the canonical
  example of "no list, just an input prompt + confirm"; the
  right next refactor is a parallel `runInputAction` seam,
  but that's a separate ADR.
- **Make `ProfileImportError` a string union instead of a
  class.** Rejected — the rest of the codebase's error
  hierarchy is class-based (ADR-0001's `CommandResult` is
  the result of `runCommand`'s `err instanceof AppError`
  branch). A class keeps the error consistent with
  `ProfileNotFoundError`, `ProfileAlreadyExistsError`, etc.
- **Inline the parse + validate into `parseImportedProfile`
  as a single regex-based parser.** Rejected — JSON and YAML
  have different syntaxes; the format dispatch belongs at
  the top level, not inside a single function body.

## References

- `src/domain/profileImport.ts` — new module
- `src/commands/import.ts` — shrinks 75 → 59 lines
- `src/index.ts` — adds `detectImportFormat`,
  `parseImportedProfile`, `ProfileImportError`,
  `ImportFormat` re-exports
- `src/utils/validation.ts` — deleted (4 dead exports + 1
  unused interface + 1 class with no callers outside its
  own test)
- `tests/validation.test.ts` — deleted (pinned dead exports)
- `tests/profileImport.test.ts` — new (35 tests)
- ADR-0002 — `domain/profileSchema.ts` established the
  pattern of pure functions over a domain shape
- ADR-0006 — `domain/diagnostic.ts` established the 3-layer
  `domain → presenter → command` split
