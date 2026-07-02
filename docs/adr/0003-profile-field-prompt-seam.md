# ADR-0003: ProfileFieldPrompt seam for schema-backed per-field input

Status: Accepted (2026-07-02)

## Context

ADR-0002 introduced the `ProfileSchema` (`domain/profileSchema.ts`) as
the single source of truth for the 5 first-class profile fields. The
schema's `FieldSpec` carries everything a caller needs to handle a
field: its `id`, its `label`, the env keys it controls, the
`required` flag, the `sensitive` flag, and a `validateInput` function
for prompt-time input validation.

After ADR-0002, **storage** (`applyField`), **read** (`getFieldValue`),
**validation** (`validateProfile`), **display** (`profileDetailRows`),
and **masking** (`maskProfileValue`, `SENSITIVE_ENV_KEYS`) all went
through the schema. But **prompt-time input collection** did not.

The `ui/prompt.ts` module still exposed 5 hand-rolled prompt functions
— `inputApiToken`, `inputBaseUrl`, `inputSonnetModel`,
`inputOpusModel`, `inputHaikuModel` — each with its own inline
`validate:` clause that **duplicated** the schema's `validateInput`.
Worse, the `validate` clauses had drifted out of sync with the
schema's validators: the prompt's `inputBaseUrl` checked
`startsWith('http://')` on the raw input, while the schema's
`baseUrl.validateInput` trimmed first and used a regex — so a value
like `"  https://x.com  "` would be rejected by the prompt and
accepted by the schema. The duplication was a latent bug surface.

`createCommandInteractive` reached **directly into the env-key names**
to compute the per-field default:

```ts
// before
const sonnetModel = await ctx.prompts.inputSonnetModel(
  provider.envTemplate.ANTHROPIC_DEFAULT_SONNET_MODEL || provider.defaultModel
);
const opusModel = await ctx.prompts.inputOpusModel(
  provider.envTemplate.ANTHROPIC_DEFAULT_OPUS_MODEL || provider.defaultModel
);
const haikuModel = await ctx.prompts.inputHaikuModel(
  provider.envTemplate.ANTHROPIC_DEFAULT_HAIKU_MODEL || provider.defaultModel
);
```

This re-implemented "which env key is the primary for field X" in the
caller. The schema already owns that knowledge (`getFieldValue`).
Adding a 6th field, or renaming the primary env key for any field,
required editing 3 sites in `create.ts` to keep them in sync — and
no test would catch a drift.

`editCommandInteractive#promptForEditableField` had a hand-rolled
`switch (field)` dispatching each `ProfileField` to the corresponding
`inputXxx` method:

```ts
// before
switch (field) {
  case 'token':       return ctx.prompts.inputApiToken();
  case 'baseUrl':     return ctx.prompts.inputBaseUrl(current);
  case 'sonnetModel': return ctx.prompts.inputSonnetModel(current);
  case 'opusModel':   return ctx.prompts.inputOpusModel(current);
  case 'haikuModel':  return ctx.prompts.inputHaikuModel(current);
}
```

The same field-aware logic, with the same drift risk. The inline
comment ("each prompt method enforces a different shape") described
the **cost** of not having the seam, not a reason against it.

## Decision

Introduce a `ProfileFieldPrompt` seam: a single `inputProfileField`
method on the `Prompts` interface that owns per-field input
collection. The schema's `FieldSpec` becomes the single source of
the prompt-time label and validator.

**Two new symbols in `domain/profileSchema.ts`:**

- `defaultFieldValue(env, field, fallback)` — pure function that
  resolves a field's default from a base env (e.g. a provider's
  `envTemplate`) and an optional fallback. Reads the field's primary
  env key only (consistent with `getFieldValue`).

**One new method on `Prompts`:**

- `inputProfileField(field, options?)` — composes `FieldSpec.label`
  (the prompt message) and `FieldSpec.validateInput` (the prompt
  validator). Implemented in `realPrompts` by delegating to
  `ui/prompt.ts#promptInput`. Implemented in `noopPrompts` as a
  sentinel empty string (consistent with the other `input*` noop
  defaults).

**Two callers refactored:**

- `createCommandInteractive` — every per-field prompt now goes
  through `inputProfileField`, with `defaultFieldValue` computing
  the default from `provider.envTemplate` + `provider.defaultModel`
  (or `provider.defaultBaseUrl` for the base URL). No more direct
  env-key access.
- `editCommandInteractive#promptForEditableField` — collapses to a
  single `ctx.prompts.inputProfileField(field, { defaultValue:
  getFieldValue(env, field) })` call. The 5-case `switch` is gone.

**Back-compat:** the 5 `inputApiToken` / `inputBaseUrl` /
`inputSonnetModel` / `inputOpusModel` / `inputHaikuModel` methods
remain on the `Prompts` interface and on `realPrompts` /
`noopPrompts`. They are now redundant for the create/edit paths but
preserved so any external embedder depending on them keeps working.
New code should call `inputProfileField`.

## Consequences

Positive:

- **The 5-field shape has one home for input collection too.** Adding
  a 6th field touches the schema, the create command, and the edit
  command — but the create/edit commands no longer mention the
  env-key names.
- **The latent base-URL trim bug is fixed.** The schema's validator
  (trim-then-check) is now the one the prompt runs. Values like
  `"  https://x.com  "` are accepted as expected.
- **The `createCommandInteractive` body shrank and deduped.** The 5
  hand-rolled per-field blocks became a uniform
  `inputProfileField(field, { defaultValue })` pattern.
- **The `promptForEditableField` body shrank to 5 lines.** The
  per-field switch is gone; the schema owns the dispatch.
- **7 new tests pin the seam** — 5 in `tests/profileSchema.test.ts`
  for `defaultFieldValue` (covers the SONNET primary-vs-legacy
  subtlety, the empty-fallback case, and the missing-fallback case),
  and 2 in `tests/context.test.ts` for `inputProfileField` (covers
  the `noopPrompts` contract and the schema→inquirer wiring through
  `realPrompts`).

Negative:

- **The `Prompts` interface grew by one method.** Embedders building
  a custom `Prompts` impl must add `inputProfileField`. The method
  is the load-bearing one for the create/edit paths; embedders
  wanting the new behavior must implement it. (The 5 old methods
  remain on the interface, so embedders that only need those are
  unaffected.)
- **A subtle wire change.** The prompt message for "API Token" /
  "API Base URL" / "SONNET 模型" / "OPUS 模型" / "HAIKU 模型" is
  now the schema's `FieldSpec.label` rather than the per-function
  literal. The strings are equivalent to the eye (the old per-field
  functions used `"API Token:"`, `"API Base URL:"`, etc.; the
  trailing colon is added by inquirer's prompt renderer). The
  behavior change is the trim-first base-URL fix described above.

## Alternatives considered

- **Make `inputXxx` methods on `Prompts` schema-aware individually
  (e.g. `inputBaseUrl(spec)` that consults the spec at call time).**
  Rejected — 5 methods is still 5 adapters, and the per-field
  default-merge logic in `createCommandInteractive` would still
  hand-roll the env-key access. The whole point is to collapse the
  field-aware dispatch to one entry point.
- **Inline the schema's prompt-time logic into `ui/prompt.ts`'s
  `inputXxx` functions directly, no `Prompts` interface change.**
  Rejected — the `Prompts` interface is the public seam (per
  ADR-0001), and moving the logic into `ui/prompt.ts` would mean
  `ui/prompt.ts` depends on the schema, which is the wrong direction
  (UI depends on domain, not the other way around). Keeping the
  composition in `realPrompts` (which already imports the schema
  via `materializeProfile`'s neighbors) preserves the layering.
- **Skip the seam and rely on `getFieldValue` only.** Rejected —
  the prompt-time `validate` is not just "get the current value",
  it's the schema's `FieldSpec.validateInput` (with the trim-first
  behavior). Without the seam, the per-field validator would still
  be duplicated in the prompt functions.
- **Drop the 5 `inputXxx` methods entirely.** Rejected — they're
  public surface (re-exported from `src/index.ts` indirectly via
  the `Prompts` interface), and removing them is a breaking change
  for any embedder. Keeping them as back-compat shims costs nothing
  and gives a clear migration path.

## Follow-up opportunities (not addressed here)

The **display** side of the field-aware logic still hand-rolls
env-key access in 3 sites that this ADR does not touch:

- `ui/prompt.ts#describeFieldValue` (line ~158) — the "current value"
  hint in the field-picker, which uses `env.ANTHROPIC_*` directly and
  has special-case logic for `token` (returns `[*****]` / `[UNSET]`)
  and `sonnetModel` (tries the primary first, then the legacy
  `ANTHROPIC_MODEL`).
- `ui/prompt.ts#selectProfileFromList` — the row text uses
  `p.env.ANTHROPIC_AUTH_TOKEN` directly to compute the
  `[* * *]` / `[UNSET]` indicator.
- `presenters/envRenderer.ts#formatProfileList` — the same
  `[* * *]` / `[UNSET]` indicator, duplicated again.

A future ADR could introduce a `formatFieldDisplayValue(field,
value)` in the schema and a `formatProfileRow(profile, isCurrent)`
in the presenter layer, mirroring the `inputProfileField` shape on
the display side. This ADR explicitly scopes itself to the
**input** collection to keep the change focused and reviewable.

## References

- `src/domain/profileSchema.ts` — adds `defaultFieldValue`
- `src/commands/prompts.ts` — adds `inputProfileField` to `Prompts` + `realPrompts`
- `src/commands/context.ts` — adds `inputProfileField` to `noopPrompts`
- `src/commands/create.ts#createCommandInteractive` — uses
  `inputProfileField` + `defaultFieldValue`; no more direct env-key access
- `src/commands/edit.ts#editCommandInteractive#promptForEditableField`
  — uses `inputProfileField`; per-field switch removed
- `src/index.ts` — re-exports `defaultFieldValue`
- `CONTEXT.md` — new "Profile Field Prompt" glossary entry
- `tests/profileSchema.test.ts` — 5 new tests for `defaultFieldValue`
- `tests/context.test.ts` — 2 new tests for `inputProfileField`
