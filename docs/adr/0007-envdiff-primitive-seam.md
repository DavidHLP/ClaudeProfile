# ADR-0007: EnvDiff primitive seam

Status: Accepted (2026-07-02)

## Context

`engine/envDiff.ts` exposed 4 functions for converting env state
into wire formats:

- `buildExportJson(env)` — for the "first-time export" JSON shape.
- `buildSwitchJson(oldEnv, newEnv)` — for the diff JSON shape.
- `buildExportCommands(env)` — for the "first-time export" shell
  `export` lines.
- `buildSwitchCommands(oldEnv, newEnv)` — for the diff shell
  `export`/`unset` lines.

Two of them (`buildSwitchJson` and `buildSwitchCommands`)
re-implemented the same diff logic:

```ts
// buildSwitchJson
const oldKeys = new Set<string>();
if (oldEnv) {
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value) oldKeys.add(key);
  }
}
// ...
// buildSwitchCommands — same iteration, same Set construction
const oldKeys = new Set<string>();
if (oldEnv) {
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value) oldKeys.add(key);
  }
}
```

`validateEnvKeyOrThrow` was called 4 times across the file
(twice per builder) — 2x more than needed. The `if (value)` check
was duplicated 4x. Adding a new output format (e.g. fish-shell
`set -gx`) meant copy-pasting the iteration yet again. The
deletion test: delete `envDiff.ts` and the diff logic reappears
inside `switchCommand` and `exportCommand` — both would need to
know how to compute set/unset.

The module had **zero direct tests**. Every test exercised
envDiff indirectly through the command layer. The duplicate
logic made test refactors fragile: changing the diff semantics
required updating tests in 4 places.

## Decision

Introduce a `diffEnvs` primitive at the top of `envDiff.ts`. The
4 builders become 1-line adapters that consume the primitive.
Three formatters (`formatEnvJson`, `formatExportShell`,
`formatSwitchShell`) are exported so callers that already have
a diff can format it without re-computing.

**`diffEnvs(oldEnv, newEnv): { set, unset }`** is the deep
module. It:

- Builds the `set` map from non-empty keys in `newEnv`.
- Builds the `unset` array from non-empty keys in `oldEnv` that
  are missing or empty in `newEnv`.
- Treats whitespace-only values as empty (consistent with
  `applyField` / `validateProfile` semantics in the schema).
- Calls `validateEnvKeyOrThrow` once per key.
- Preserves insertion order for `set` and `unset`.

**The 4 builders** are now thin adapters:

```ts
export function buildExportJson(env: EnvConfig): EnvJsonOutput {
  return diffEnvs(null, env);
}
export function buildSwitchJson(oldEnv: EnvConfig | null, newEnv: EnvConfig): EnvJsonOutput {
  return diffEnvs(oldEnv, newEnv);
}
export function buildExportCommands(env: EnvConfig): string {
  return formatExportShell(diffEnvs(null, env));
}
export function buildSwitchCommands(oldEnv: EnvConfig | null, newEnv: EnvConfig): string {
  return formatSwitchShell(diffEnvs(oldEnv, newEnv));
}
```

**The 3 formatters** are 5-line functions each, exported for
callers that have a diff already in hand (e.g. a future "dry-run"
command that wants to show the diff in both shell and JSON form
without re-computing).

The public API surface (`buildExportJson`, `buildSwitchJson`,
`buildExportCommands`, `buildSwitchCommands`) is unchanged —
every existing caller continues to work.

## Consequences

Positive:

- **One diff primitive.** The `oldKeys`/`newKeys` iteration lives
  in one place. Adding a new output format is 4 lines (a new
  formatter), not 20.
- **One place to test the diff.** `tests/envDiff.test.ts`
  exercises 29 new test cases covering the diff primitive, all 4
  builders, and all 3 formatters. The diff semantics
  (whitespace handling, insertion order, key validation) are
  pinned in one place.
- **`validateEnvKeyOrThrow` is called once per key, not 4×.**
  The formatters trust the diff; the diff owns the key
  validation.
- **Public API is preserved.** Every existing call site
  (`switchCommand`, `exportCommand`, `exportCurrentCommand`,
  `run.ts#printEnv`) keeps working without edits.

Negative:

- **A new type (`EnvDiff`) is exported.** The type is identical
  to `EnvJsonOutput` (both `{ set, unset }`). `EnvDiff` is the
  "diff primitive output" name; `EnvJsonOutput` is the
  "JSON-shaped output" name. They are interchangeable today;
  a future change that adds (say) a `from` field would split
  them.
- **The formatters add a small new public surface.** They are
  additive — no existing call site changes. The 3 formatters
  are 5 lines each.

## Alternatives considered

- **Reuse `buildSwitchJson` inside `buildSwitchCommands` and
  just stringify.** Rejected — the eval-bridge contract requires
  `unset` lines first, then `export` lines. The 4-line formatter
  is clearer than threading an "ordering mode" through the
  builder.
- **Inline the diff into the command layer.** Rejected — that
  is exactly what we are trying to avoid. The diff is the
  one thing the module owns; it should be named.
- **Add a `EnvDiff#toJson()` and `EnvDiff#toShell()` method
  on the diff value.** Rejected — the diff is a plain data
  object (`{ set, unset }`); methods on it would couple the
  data to the formatters. Free functions are the right shape
  for the formatters.
- **Skip the ADR and ship the refactor in one commit.**
  Rejected — the change touches the public API surface (new
  types, new exports) and is the kind of refactor future
  explorers will want to understand "why was the diff split
  out?"

## References

- `src/engine/envDiff.ts` — adds `diffEnvs` and 3 formatters;
  the 4 builders become 1-line adapters
- `tests/envDiff.test.ts` — 29 new tests
- `CONTEXT.md` — new "Env Diff Primitive" glossary entry
- `index.ts` — `EnvJsonOutput` re-export unchanged; `EnvDiff`
  and the formatters are additive
