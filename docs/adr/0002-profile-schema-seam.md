# ADR-0002: ProfileSchema seam for first-class profile fields

Status: Accepted (2026-07-02)

## Context

The CLI is built around a "profile" — a named bundle of API credentials
and configuration that the user can switch into. The profile is
**shaped** by 5 first-class fields (base URL, auth token, sonnet/opus/
haiku models), each of which corresponds to one or two specific env
keys. Before this ADR, that "5 fields × env keys" shape was implicit
and replicated across 9 places in the codebase:

| File | What it knew about the field shape |
|---|---|
| `src/templates/providers.ts#materializeProfile` | The 5 env keys to write on create |
| `src/commands/edit.ts#FIELD_TO_ENV_KEYS` | The 5 fields → env keys (for edit) |
| `src/commands/validate.ts#validateProfile` | 6 hardcoded checks for the 5 fields (SONNET's check is duplicated for `ANTHROPIC_MODEL` and `ANTHROPIC_DEFAULT_SONNET_MODEL`) |
| `src/presenters/envRenderer.ts#formatProfileDetail` | A 6-row inline `[[shortLabel, env.X \|\| '未设置'], ...]` table for the same 5 fields + 1 secondary |
| `src/utils/sensitiveKeys.ts#SENSITIVE_ENV_KEYS` | The token field is sensitive |
| `src/ui/prompt.ts#input{ApiToken,BaseUrl,SonnetModel,OpusModel,HaikuModel}` | 5 separate prompt methods for the same 5 fields |
| `src/commands/prompts.ts#Prompts` | The 5-method `Prompts` surface (re-binds the 5 above) |
| `src/types/command.ts#EditableField` | A hardcoded union of 5 strings |
| `src/types/command.ts#EDITABLE_FIELD_LABELS` | A hardcoded label map |

The shape is also reflected in the test suites for `validate` and
`envPresenter.formatProfileDetail`, which assert on the 6-row display
and the per-env-key warning messages.

Consequences:

1. **The 5-field shape had no canonical home.** Adding a 6th field
   (e.g. `reasoningEffort`) required editing 9 files and risking
   drift between the create path, the edit path, the validate path,
   and the display path.
2. **SONNET was duplicated across two env keys.** `materializeProfile`
   set both `ANTHROPIC_MODEL` and `ANTHROPIC_DEFAULT_SONNET_MODEL` to
   the sonnet model. `FIELD_TO_ENV_KEYS` did the same on edit. The
   validate path treated them as **independent** fields and could
   warn twice for the same user intent.
3. **Sensitive-field logic lived in `utils/sensitiveKeys.ts`** with
   a hand-maintained `SENSITIVE_ENV_KEYS` set. The token's
   masking policy was in `maskValue` (4 chars + `****`), but the
   detail panel needed a slightly different policy (already-set
   display). Two places, two functions, same concept.
4. **The detail panel's 6 rows** (BASE URL, TOKEN, MODEL, SONNET,
   OPUS, HAIKU) were an inline literal in `formatProfileDetail`. The
   test suite (`tests/context.test.ts`) pinned the exact labels.
5. **`EditableField` and `PROFILE_FIELDS.id` were the same union**
   maintained twice, once in `types/command.ts` and once in the
   schema-to-be.

## Decision

Introduce a `ProfileSchema` module at `src/domain/profileSchema.ts`
that owns the canonical shape of a profile's first-class fields:

```ts
export type ProfileField = 'baseUrl' | 'token' | 'sonnetModel' | 'opusModel' | 'haikuModel';

export interface FieldSpec {
  readonly id: ProfileField;
  readonly label: string;
  readonly envKeys: readonly string[];
  readonly required: boolean;
  readonly sensitive: boolean;
  readonly validateInput: (value: string) => true | string;
}

export const PROFILE_FIELDS: Readonly<Record<ProfileField, FieldSpec>> = { /* ... */ };
```

Three pure functions are the test surface:

- `applyField(env, field, value)` — apply a field change immutably.
  Writes to **every** env key the field owns (so SONNET updates both
  `ANTHROPIC_DEFAULT_SONNET_MODEL` and the legacy `ANTHROPIC_MODEL`
  in lock-step).
- `validateProfile(env)` — produce validation issues, one per
  empty/empty-equivalent env key (preserving the original behaviour
  where SONNET produces two warnings when both env keys are empty).
- `profileDetailRows(env, mask?)` — produce the 6 detail rows for
  the per-profile panel, derived from the schema's display-row list.

Two derived views come for free:

- `PROFILE_DISPLAY_ROWS` — the 6-row display panel
  (BASE URL, TOKEN, MODEL, SONNET, OPUS, HAIKU), in the exact order
  the existing tests expect.
- `SENSITIVE_ENV_KEYS` — derived from the `sensitive` flag in each
  field spec, replacing the hand-maintained set in
  `utils/sensitiveKeys.ts`.

The legacy `EditableField` type and `EDITABLE_FIELD_LABELS` constant
in `types/command.ts` are preserved as back-compat aliases that
re-export from the schema. New code imports `ProfileField` directly.

Three supporting changes ship with this:

- **`materializeProfile`** in `templates/providers.ts` now calls
  `applyField` once per field instead of writing 6 env keys by hand.
  SONNET's dual-write (the `ANTHROPIC_MODEL` legacy key) is now
  owned by the schema, not by the create path.
- **`editCommand`** in `commands/edit.ts` replaces the
  `FIELD_TO_ENV_KEYS` map with a single `applyField` call. The
  SONNET dual-write happens in the schema, not in the edit path.
- **`formatProfileDetail`** in `presenters/envRenderer.ts` iterates
  `profileDetailRows(env, maskProfileValue)`. The 6-row display,
  the `已设置/未设置` convention for the token row, and the short
  labels are all schema-owned.

## Consequences

Positive:

- **The 5-field shape has one home.** Adding a 6th field touches
  one file plus its tests.
- **SONNET's two env keys are owned by the schema.** The create,
  edit, validate, and display paths no longer carry their own
  copies of the SONNET dual-write logic.
- **Validation is a pure function.** 43 new tests in
  `tests/profileSchema.test.ts` exercise the field shape end-to-end
  without touching the command layer, the inquirer layer, or the
  filesystem.
- **Sensitive fields are derived.** Flipping `sensitive: true` on a
  new field is enough; the masking policy in `maskProfileValue` and
  the `SENSITIVE_ENV_KEYS` set follow automatically.
- **Display order is explicit.** `PROFILE_FIELDS_ORDER` and
  `PROFILE_DISPLAY_ROWS` make the canonical 6-row layout
  testable.

Negative:

- **Public surface grew.** `src/index.ts` now re-exports 9 new
  symbols from the schema. Embedders depending on a tight surface
  see a wider import list, but the additions are additive — no
  symbols were removed.
- **`types/command.ts` now has an import cycle risk** with the
  schema. Resolved by having `EditableField` re-export as a
  `type`-only import (`import type { ProfileField }`) and
  `EDITABLE_FIELD_LABELS` computed from `PROFILE_FIELDS` at module
  load. The re-export is the back-compat surface, not a duplicate.
- **One test changed.** The "should warn when current profile is
  missing model" test in `tests/validate.test.ts` was asserting on
  the old "per-env-key independent warning" behaviour. The new
  behaviour ("a field is set if any of its env keys is set") is
  the contract under the schema, and the test was updated to
  exercise a profile where **both** SONNET env keys are empty so
  the warning still fires.

## Alternatives considered

- **Add a 6th "secondary env key" concept to the schema** so SONNET
  becomes a single field with a "writes to" list. Rejected —
  collapses the distinction between "primary env key for read" and
  "secondary env key for write", which the existing code happens to
  match. Keeping `envKeys: readonly string[]` with "primary first"
  is the minimum shape that preserves the existing semantics.
- **Move the schema into `src/templates/`** alongside the provider
  templates. Rejected — the schema is not a template concept. It
  spans templates, commands, presenters, and validators. A new
  `src/domain/` directory matches the language better
  (per `CONTEXT.md`: "domain" already exists as a concept in the
  repo for cross-cutting domain decisions).
- **Make the prompts interface schema-aware** (replace
  `inputApiToken` etc. with a single `inputProfileField`). Rejected
  for this ADR — the prompts interface is a public seam, and
  collapsing it changes every embedder. The schema's
  `validateInput` is exported as a pure function, ready to be
  reused in a follow-up ADR that does collapse the prompts
  surface.
- **Skip the ADR and ship the schema in one commit.** Rejected —
  the field-shape migration touches 8 files across templates,
  commands, presenters, and utils. An ADR is the only place future
  explorers can read "why is the schema a thing and not just a
  shared `Record<>` in `templates/providers.ts`?"

## References

- `src/domain/profileSchema.ts` — the seam
- `src/templates/providers.ts#materializeProfile` — calls `applyField`
- `src/commands/edit.ts#editCommand` — calls `applyField`
- `src/commands/validate.ts#validateCommand` — calls `validateProfile`
- `src/presenters/envRenderer.ts#formatProfileDetail` — iterates
  `profileDetailRows`
- `src/utils/sensitiveKeys.ts` — derives `SENSITIVE_ENV_KEYS` from the
  schema
- `src/types/command.ts#EditableField` — back-compat alias for
  `ProfileField`
- `tests/profileSchema.test.ts` — 43 tests, the test surface
- `CONTEXT.md` — glossary entry for "Profile Field" and
  "Profile Schema"
