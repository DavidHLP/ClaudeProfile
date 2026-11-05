# ADR-0004: ProfileFieldDisplay seam for schema-backed field rendering

Status: Accepted (2026-07-02)

## Context

ADR-0002 introduced the `ProfileSchema`
(`src/domain/profileSchema.ts`) as the single source of truth for the
5 first-class profile fields. ADR-0003 added the input-side seam
(`inputProfileField`) so prompt-time input collection went through the
schema too.

After ADR-0003, the input side of field-aware logic was fully covered
by the schema. The **display** side was not. Three sites in the
codebase each hand-rolled the same per-field "what string do I show
the user?" logic:

1. **`ui/prompt.ts#describeFieldValue`** (line ~158, before this
   ADR) — a 5-case `switch (field)` that returned the per-field
   indicator:

   ```ts
   // before
   case 'token':       return env.ANTHROPIC_AUTH_TOKEN ? '[*****]' : '[UNSET]';
   case 'baseUrl':     return env.ANTHROPIC_BASE_URL || '(未设置)';
   case 'sonnetModel': return env.ANTHROPIC_DEFAULT_SONNET_MODEL || env.ANTHROPIC_MODEL || '(未设置)';
   case 'opusModel':   return env.ANTHROPIC_DEFAULT_OPUS_MODEL || '(未设置)';
   case 'haikuModel':  return env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '(未设置)';
   ```

   The `sonnetModel` case in particular carried the SONNET
   primary-then-legacy fallback (`ANTHROPIC_DEFAULT_SONNET_MODEL ||
   ANTHROPIC_MODEL`) inline. That logic is the same concept as
   `getFieldValue`'s "read primary," except the display path needs
   the legacy fallback so older profiles (where only
   `ANTHROPIC_MODEL` is set) show their effective sonnet model.

2. **`ui/prompt.ts#selectProfileFromList`** (line ~136) — a one-line
   inline check:

   ```ts
   // before
   const apiKey = p.env.ANTHROPIC_AUTH_TOKEN ? '[*****]' : '[UNSET]';
   ```

   Same concept as the `token` case in #1, but reached from a
   different code path with no shared function.

3. **`presenters/envRenderer.ts#formatProfileList`** (line ~90) —
   another inline check, with a *different* visual variant (padded
   markers, `theme.dim` wrapping):

   ```ts
   // before
   const apiKey = profile.env.ANTHROPIC_AUTH_TOKEN ? theme.dim('[ ***** ]') : theme.dim('[ UNSET ]');
   ```

   Same concept, but the `[ ***** ]` / `[ UNSET ]` literals differ
   by a single space from #2, and the wrapping with `theme.dim` is
   the presenter's styling concern, not a property of the value
   itself.

The three sites were **conceptually the same operation** — "given a
profile field, produce a human-readable current-value indicator" —
but maintained by hand in three different files. Adding a 6th
field, or renaming `ANTHROPIC_AUTH_TOKEN` to something else,
required editing all three sites in lock-step. Worse, the three
sites had already drifted on the SONNET case: `describeFieldValue`
had the primary-then-legacy fallback; the other two didn't even
read `sonnetModel` (they only checked the token field). Any future
field that needed the legacy-fallback semantics would have to
re-implement the same iteration in yet another file.

The duplication was already explicitly called out as a follow-up
opportunity in the closing section of ADR-0003:

> The **display** side of the field-aware logic still hand-rolls
> env-key access in 3 sites that this ADR does not touch:
> `ui/prompt.ts#describeFieldValue`, `ui/prompt.ts#selectProfileFromList`,
> `presenters/envRenderer.ts#formatProfileList`.

## Decision

Introduce two new pure functions in `src/domain/profileSchema.ts`
and collapse the three sites to call them.

**`getEffectiveFieldValue(env, field)`** — read the first non-empty
env key for a field, in the canonical env-key order (primary first,
then legacy fallbacks). Returns `undefined` if all env keys for the
field are empty or whitespace.

This is a **separate** read function from `getFieldValue`. The
two reads have intentionally different semantics:

- `getFieldValue` returns the primary env key only. It's the
  write-side read: `applyField` writes to every env key the field
  owns in lock-step, so the "current value" for write purposes is
  whatever the primary holds. The validate path uses the same
  strict semantics ("a field is set if its primary env key is set").
- `getEffectiveFieldValue` returns the first non-empty env key.
  It's the display-side read: the user wants to know "what's
  actually in effect for this field?" — which can include a
  legacy-only value if the primary happens to be empty.

Both reads are needed; conflating them would force the display
path to re-implement the iteration.

**`formatFieldDisplayValue(env, field, options?)`** — the canonical
"what string do I show for this field?" function.

- For the `token` field: returns the set / unset marker (token is
  never rendered raw, to avoid leaking secrets into the TUI).
- For all other fields: returns the effective value if set, or
  the unset text otherwise.
- Accepts an optional `FieldDisplayOptions` object so callers can
  pick the visual variant (e.g. `[ ***** ]` vs `[*****]`) without
  forcing the schema to know about padding or ANSI dimming.

Defaults match the original `describeFieldValue` and
`formatProfileList` literals, so callers that don't need a custom
variant call the function with no options and get the byte-identical
output they had before.

**Three callers refactored:**

1. `ui/prompt.ts#describeFieldValue` — the 5-case `switch` becomes
   a one-line delegation to `formatFieldDisplayValue(profile.env,
   field)`. The function stays as a thin adapter so `selectEditField`
   doesn't have to import the schema directly.
2. `ui/prompt.ts#selectProfileFromList` — the inline
   `p.env.ANTHROPIC_AUTH_TOKEN ? '[*****]' : '[UNSET]'` becomes
   `formatFieldDisplayValue(p.env, 'token')`.
3. `presenters/envRenderer.ts#formatProfileList` — the inline
   `profile.env.ANTHROPIC_AUTH_TOKEN ? theme.dim('[ ***** ]') :
   theme.dim('[ UNSET ]')` becomes
   `theme.dim(formatFieldDisplayValue(profile.env, 'token', { setMarker:
   '[ ***** ]', unsetMarker: '[ UNSET ]' }))`. The `theme.dim`
   wrapping and the padded markers stay at the presenter layer
   (the schema is pure data, the presenter owns styling).

## Consequences

Positive:

- **The display side of the field-aware logic has one home.** Adding
  a 6th field touches the schema, the create command, the edit
  command, the validate command, the display seam — but the three
  display-side callers no longer mention env-key names.
- **The SONNET primary-then-legacy fallback lives in the schema.**
  Any future display surface that needs the effective sonnet model
  gets it for free from `getEffectiveFieldValue`. The fallback is
  testable in isolation; previously it was buried in the
  `describeFieldValue` switch.
- **The `[* * *]` / `[UNSET]` and `[ ***** ]` / `[ UNSET ]` marker
  drift is no longer possible.** Both forms are now produced by
  the same function; the only difference is the options passed.
- **A new concept — "effective field value" — has a name and a
  test surface.** `getEffectiveFieldValue` and `getFieldValue`
  coexist with documented, distinct semantics. Future readers no
  longer have to reverse-engineer "why is there a 5-case switch
  here?" from the call site.
- **The `FieldDisplayOptions` seam is the load-bearing extension
  point.** A future field that needs a different visual convention
  (e.g. a truncated URL for the baseUrl field) can override
  `unsetText` or add a new option without touching the schema's
  core.
- **A subtle behavior alignment in the whitespace case.** The
  pre-ADR-0004 `describeFieldValue` used `env.X || '(未设置)'`,
  which only catches `undefined` / `null` / `''` — a whitespace-only
  value like `'   '` was rendered as `'   '` (the 3 spaces) and a
  whitespace token was rendered as `[*****]`. The new code routes
  through `getEffectiveFieldValue`, which uses a `v.trim()` check
  consistent with `validateProfile`, `profileDetailRows`, and
  `applyField`. Whitespace is now treated as unset everywhere on
  the display path. This is a bug fix, not a regression — but it
  is technically a behavior change for any hand-edited profile with
  whitespace values. The behavior is covered by the new tests in
  `tests/profileSchema.test.ts` ("treats whitespace-only values as
  unset" and the corresponding `getEffectiveFieldValue` test).

Negative:

- **Two new symbols in the schema** (`getEffectiveFieldValue`,
  `formatFieldDisplayValue`) plus a new type (`FieldDisplayOptions`).
  The schema's public surface grows by 3. The additions are
  additive and tested; embedders that depended only on the
  pre-ADR-0004 surface are unaffected.
- **The `Prompts` interface does not grow.** `describeFieldValue`
  is a *display* helper, not a prompt — it returns a string for
  display, not a value collected from the user. Keeping it on
  `ui/prompt.ts` (where it's used to render the field-picker
  choices) rather than on `Prompts` preserves the layering
  (input goes through `Prompts`, output goes through the
  presenter / display seam).
- **The verbose header construction in `listCommand` and
  `validateCommand` is still duplicated.** This ADR does not
  address it (it has a different shape: it's a 5-line block
  copy-pasted between the two commands, not a per-field
  concern). A future ADR could extract a `formatVerboseHeader`
  helper in the presenter layer; it's explicitly out of scope
  here.

## Alternatives considered

- **Reuse `getFieldValue` for the display path with a
  `{ fallback: true }` option.** Rejected — it conflates the
  two read semantics. `getFieldValue` is used by `defaultFieldValue`
  and by `applyField`'s "is the field currently set?" check, both
  of which want strict primary-only. A boolean flag would force
  every existing caller to think about a parameter they don't care
  about. Two named functions with documented semantics are clearer.
- **Make `formatFieldDisplayValue` aware of `theme.dim` and
  padding directly.** Rejected — the schema is supposed to be pure
  data with no I/O and no styling. `presenters/envRenderer.ts` and
  `ui/prompt.ts` already own the styling; letting the schema know
  about ANSI escapes would couple the domain layer to the UI layer.
  The `FieldDisplayOptions` marker strings give the callers the
  right seam: they pick the literal, the schema picks the per-field
  policy.
- **Inline the 5-case switch into `formatFieldDisplayValue`
  directly (no `getEffectiveFieldValue` indirection).** Rejected
  — `getEffectiveFieldValue` is a separately useful read function.
  The validate path might want it next (to issue a single "no
  effective sonnet" warning instead of two per-key warnings), and
  the export is the test surface that proves the SONNET
  primary-then-legacy semantics.
- **Drop `describeFieldValue` and inline the call to
  `formatFieldDisplayValue` in `selectEditField`.** Rejected —
  the inliner would have to import the schema from `ui/prompt.ts`,
  which already imports from `domain/profileSchema.ts` only via
  the new import. The local helper preserves the existing layering
  (`ui/prompt.ts` is the place that knows about field-picker
  rendering, and it can call the schema helper directly without
  going through `Prompts`).

## Follow-up opportunities (not addressed here)

- **`listCommand` and `validateCommand` verbose-header
  duplication.** Both commands construct the same
  `['配置目录: …', '当前配置: …', '配置数量: …']` block in
  lock-step. A `formatVerboseHeader(profiles, storeLocation,
  currentProfile)` helper in the presenter layer would
  deduplicate this. Out of scope for this ADR.
- **`validateProfile` per-key vs per-field warning aggregation.**
  The current behaviour produces two SONNET warnings when both
  env keys are empty. The new `getEffectiveFieldValue` could back
  a "per-field" aggregation that emits a single warning with the
  field name (instead of two with env-key names). This is a
  behaviour change and needs its own ADR.

## References

- `src/domain/profileSchema.ts` — adds `getEffectiveFieldValue`,
  `formatFieldDisplayValue`, and `FieldDisplayOptions`
- `src/ui/prompt.ts#describeFieldValue` — 5-case switch collapsed
  to one-line delegation
- `src/ui/prompt.ts#selectProfileFromList` — inline `apiKey`
  literal replaced with `formatFieldDisplayValue`
- `src/presenters/envRenderer.ts#formatProfileList` — inline
  `apiKey` literal replaced with `formatFieldDisplayValue` +
  padded markers
- `src/index.ts` — re-exports `getEffectiveFieldValue`,
  `formatFieldDisplayValue`, `FieldDisplayOptions`
- `CONTEXT.md` — new "Effective Field Value" and
  "Profile Field Display" glossary entries
- `tests/profileSchema.test.ts` — new tests for both functions
- ADR-0003 §"Follow-up opportunities" — explicitly named this
  seam as the next deepening
