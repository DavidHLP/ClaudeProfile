# ADR-0013: `runSelectableAction` deepening — one codepath, pre-flight in the seam

Status: Accepted (2026-07-02)

## Context

The interactive selection module (`src/commands/interactiveSession.ts`)
existed since the first round of deepening, but two related
shallownesses remained after ADR-0009 dropped the 5 `input*` shims
from the `Prompts` interface:

**1. Two codepaths for "select from a list".** `runSelectableAction`
had an `if (flow.list === undefined)` branch that routed the default
profile flow through `ctx.prompts.selectProfileFromList` (which
returned a `string | null` — the profile's name) and then a manual
`find` re-derivation of the full `Profile` object from the name.
Non-profile flows (e.g. `restoreCommandInteractive`, which selects
backup paths) used a separate inline `inquirer.prompt` codepath.
Two implementations of the same conceptual operation.

**2. Pre-flight checks lived in the commands.** `switchCommandInteractive`
hand-rolled a `profiles.length === 1 && profiles[0].name === currentProfile`
shortcut before calling `runSelectableAction` at all. A future
`*Interactive` command that wanted the same shortcut (e.g. an
"archive" command for old profiles) would have to re-discover the
pattern. The "empty list returns `emptyMessage`" check was the only
one the seam already owned.

**3. Dead code in `ui/prompt.ts`.** The 5 hand-rolled prompt
functions (`inputApiToken`, `inputBaseUrl`, `inputSonnetModel`,
`inputOpusModel`, `inputHaikuModel`) were removed from the
`Prompts` interface by ADR-0009, but their top-level exports in
`ui/prompt.ts` survived as "back-compat for hypothetical
embedders." The deletion test: nothing in the codebase called them
once the interface stopped exposing them. The companion
`describeFieldValue` was a 1-line pass-through to
`formatFieldDisplayValue` — a textbook shallow module.

**4. `selectProfileFromList` straddled two layers.** It lived in
`ui/prompt.ts` (a UI-implementation module) but it returned the
profile's *name* — a domain-shaped answer. Callers had to do the
`find` lookup themselves. The right home for "render a profile
list row" is the seam that owns the selection flow, not the UI
prompt module.

## Decision

Deepen `runSelectableAction` into a single, fully generic interactive
selection seam, and dissolve the related dead surface in
`ui/prompt.ts` and the `Prompts` interface.

**`runSelectableAction<T, TInput>` is now fully generic.** No
`if (flow.list === undefined)` branch. Required fields: `list`,
`buildInput`, `execute`, `verb`, `emptyMessage`. Optional fields
with sensible defaults: `formatChoice` (default `String(item)`),
`currentKey` (default `null`), `keyOf` (default `String(item)`),
`confirm`, `cancelMessage`, `prompt`, and a new
`skipSelectionWhenSingleMatch` (default `false`).

**The seam owns the pre-flight.** Two new behaviors consolidated
out of the command layer:

  1. `list(ctx)` returns `[]` → return
     `{ success: false, error: flow.emptyMessage }` (already
     present; unchanged).
  2. `skipSelectionWhenSingleMatch === true` AND `items.length === 1`
     AND its `keyOf` matches `currentKey(ctx)` (or `currentKey` is
     `null`) → skip the inquirer prompt and go directly to
     `buildInput`. This replaces the hand-rolled pre-flight that
     used to live in `switchCommandInteractive`; a future
     `*Interactive` command that wants the same shortcut just sets
     the flag.

**Selection returns the item directly.** The seam calls
`inquirer.prompt` once with a uniform shape
(`{ type: 'list', name: 'selected', message, choices, default }`),
matches the chosen key back to an item via `keyOf`, and threads
that item into `buildInput`. The previous "selectProfileFromList
returns a name → caller re-derives the Profile" dance is gone;
the seam now returns `T` (a `Profile` for the profile flow) all
the way through.

**`runProfileAction<TInput>` is the convenience alias.** It fixes
`T = Profile` and wires the profile-specific defaults:
`list = (c) => c.profiles.listProfiles()`,
`formatChoice = defaultProfileChoice` (icon + name + description +
token marker, sourced from the schema's `formatFieldDisplayValue`),
and `keyOf = profileKeyOf` (profile name). Callers may override
any of these. The 6 migrated `*Interactive` commands each
provide their own `list` (so the seam's `list` requirement is
honored) and accept the defaults for `formatChoice` / `keyOf`.

**Dead code removed.** From `ui/prompt.ts`:

  - `inputApiToken`, `inputBaseUrl`, `inputSonnetModel`,
    `inputOpusModel`, `inputHaikuModel` — 5 functions, ~60 lines.
  - `describeFieldValue` — a 1-line pass-through to
    `formatFieldDisplayValue`, inlined at its single call site
    (`selectEditField`).

From the `Prompts` interface and `realPrompts` / `noopPrompts`:

  - `selectProfileFromList` — replaced by the seam's
    `formatChoice` field, driven by the new
    `commands/interactiveSession.ts#defaultProfileChoice`.

The `icon` re-export from `ui/prompt.ts` survives so any
embedder that imported it via the old `selectProfileFromList`
path can keep its import line.

## Consequences

Positive:

- **One codepath, no branches.** `runSelectableAction` is a single
  function. A new `*Interactive` command that selects from a
  different shape (e.g. an "archive" command) is 5 lines, not 30.
- **Pre-flight lives where it belongs.** The "single-item
  shortcut" check moves from `switchCommandInteractive` into the
  seam; `switchCommandInteractive` now just sets the flag.
- **Item identity is part of the interface.** Callers declare
  `keyOf` (or accept the `String(item)` default for primitives);
  the seam handles the inquirer round-trip and the back-lookup.
- **Less dead code.** `ui/prompt.ts` shrinks from 212 → 173 lines
  (the 5 `input*` functions + `describeFieldValue` removed; the
  `selectProfileFromList` reformat is replaced by inline
  `formatFieldDisplayValue` in `selectEditField`).
- **Tests are denser.** The `runSelectableAction` test surface
  grew from 14 → 22 cases: pre-flight short-circuit (positive and
  negative), `formatChoice` plumbing through to inquirer, custom
  `prompt` message, and the `defaultProfileChoice` formatter
  itself.
- **Public surface clarifies.** `defaultProfileChoice`,
  `profileChoice`, and `profileKeyOf` are now exported from
  `index.ts` for any future embedder (web UI, programmatic
  caller) that wants the same rich profile-row formatting.

Negative:

- **`Prompts#selectProfileFromList` removed.** A hypothetical
  embedder that called `ctx.prompts.selectProfileFromList(...)`
  must now either use `runProfileAction` (which wires the rich
  formatting automatically) or import `defaultProfileChoice`
  from `commands/interactiveSession.js` and build the seam's
  flow by hand. There are no known embedders.
- **`ui/prompt.ts#inputApiToken` et al. removed.** Same reasoning:
  no embedders. The 5 functions are gone from the file; an
  embedder that wanted them now reads the schema's
  `PROFILE_FIELDS[field].label` / `.validateInput` and calls
  `ctx.prompts.inputProfileField` directly.
- **Inquirer mock is now required for selection tests.** The
  previous test strategy mocked `prompts.selectProfileFromList` to
  control the user's choice; the new design uses `inquirer.prompt`
  directly, so `tests/interactiveSession.test.ts` mocks the
  `inquirer` module with `vi.mock('inquirer', ...)`. This is a
  more honest test surface (it exercises the actual code path
  the production bin executes) at the cost of slightly more
  mocking boilerplate.

## Alternatives considered

- **Keep the dual codepath and add `keyOf` as a separate
  `mapKeyToItem` callback.** Rejected — the dual codepath was
  the original shallowness; the whole point of the deepening is
  to dissolve it. Adding more fields to the existing shape
  preserves the seam fracture.
- **Migrate the pre-flight out of `switchCommandInteractive` but
  leave the rest of the module unchanged.** Rejected — without
  the rest of the deepening, the pre-flight extraction would
  have nowhere to land. The seam already owns "empty list"; the
  natural next step is "single item shortcut," and once that's
  in, the seam owns all the pre-flight, and the inquirer
  special-case is the only thing left.
- **Drop `runProfileAction` entirely and force the 6 callers to
  use `runSelectableAction<Profile, TInput>` directly with
  explicit `list` / `formatChoice` / `keyOf` wiring.** Rejected —
  `runProfileAction` is the 1-line convenience that captures the
  "this is a profile flow" decision in one place. Forcing every
  caller to re-wire the same three defaults would re-introduce
  the same coupling at a different level. The alias is the right
  home for "profiles use the rich row formatter."
- **Keep `selectProfileFromList` and just make it return a
  `Profile` instead of a name.** Rejected — the
  `selectProfileFromList` method belongs to the UI prompts layer,
  but the "rich profile row formatting" decision belongs to the
  selection seam. Returning a `Profile` from a `Prompts` method
  is a layering violation: the prompts layer would have to know
  the `Profile` shape, which it currently doesn't. The right
  shape is "the seam owns the row formatter; the prompts layer
  doesn't know about it."

## Migration map

| File | Before | After |
|---|---|---|
| `src/commands/interactiveSession.ts` | Two codepaths (default profile path + custom list path); 5-line inline `find` lookup; no pre-flight. | One codepath; `runFromSelected` factored out; `skipSelectionWhenSingleMatch` pre-flight; new `defaultProfileChoice` / `profileChoice` / `profileKeyOf` exports. |
| `src/commands/switch.ts` | Manual pre-flight `profiles.length === 1 && profiles[0].name === currentProfile`; passes no `list` to the seam. | `skipSelectionWhenSingleMatch: true`; explicit `list: (c) => c.profiles.listProfiles()` and `currentKey`. |
| `src/commands/delete.ts`, `rename.ts`, `duplicate.ts`, `edit.ts` | Pass no `list` (relied on the back-compat default of `runProfileAction`). | Explicit `list: (c) => c.profiles.listProfiles()`; accept the default `formatChoice` / `keyOf` from `runProfileAction`. |
| `src/commands/backup.ts` (already used `runSelectableAction`) | No `keyOf` (relied on `String(path)` default for primitive `T`). | Unchanged — primitive `T` means the default `String(path)` is correct. |
| `src/ui/prompt.ts` | 212 lines; 5 `input*` functions + `describeFieldValue` + `selectProfileFromList`. | 173 lines; `selectProfileFromList` deleted; `describeFieldValue` inlined; 5 `input*` functions deleted; `icon` re-exported. |
| `src/commands/prompts.ts` | `Prompts#selectProfileFromList` (returned a name string). | `selectProfileFromList` removed from the interface; `realPrompts` and `noopPrompts` updated. |
| `src/commands/context.ts` | `noopPrompts.selectProfileFromList: async () => null`. | `selectProfileFromList` removed from `noopPrompts`. |
| `tests/interactiveSession.test.ts` | 14 cases; mocked `prompts.selectProfileFromList`. | 22 cases; mocks the `inquirer` module with `vi.mock`; covers pre-flight short-circuit (positive + negative), `formatChoice` plumbing, custom `prompt` message, and `defaultProfileChoice` / `profileKeyOf`. |
| `tests/context.test.ts` | Asserted `selectProfileFromList` exists on `realPrompts`; sentinel for `noopPrompts.selectProfileFromList`. | Both removed; the test surface matches the shrunken `Prompts` interface. |
| `src/index.ts` | Re-exported `runSelectableAction` / `runProfileAction` / `CancelledError` / `SelectableActionFlow` / `SelectableConfirmMessage` / `ProfileActionFlow` / `ConfirmMessage`. | Adds `defaultProfileChoice` / `profileChoice` / `profileKeyOf` to the re-export. |

## References

- `src/commands/interactiveSession.ts` — deepened seam
- `src/commands/switch.ts` — pre-flight extraction
- `src/commands/{delete,rename,duplicate,edit,backup}.ts` — `list` made explicit
- `src/ui/prompt.ts` — 5 dead `input*` functions + `describeFieldValue` + `selectProfileFromList` removed
- `src/commands/prompts.ts`, `src/commands/context.ts` — `selectProfileFromList` removed from the `Prompts` interface
- `src/index.ts` — new public exports
- `tests/interactiveSession.test.ts` — 22 cases covering the deepening
- `tests/context.test.ts` — anti-regression for the `Prompts` shrinkage
- `CONTEXT.md` — "Run-Selectable Action Flow" entry reflects the new shape
- ADR-0003 — established `inputProfileField` as the schema-backed prompt
- ADR-0009 — first round of `Prompts` interface shrinkage (5 `input*` shims removed from the interface; this ADR removes them from `ui/prompt.ts`)
- ADR-0012 — `Profile.cloneProfile` seam (the previous deepening on the rename/duplicate commands; the surface this ADR cleans up)
