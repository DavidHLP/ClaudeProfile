# ADR-0014: `runProfileAction` — the single home for the 6 profile-flow defaults

Status: Accepted (2026-07-02)

## Context

ADR-0013 introduced `runSelectableAction` as a fully generic
"select from a list" seam and `runProfileAction` as a back-compat
alias for the 6 existing `*Interactive` profile flows. The alias
was supposed to own four profile-flow defaults:

  1. `list` — read from `ctx.profiles.listProfiles()`
  2. `formatChoice` — render the rich `icon name — description token-marker` row
  3. `keyOf` — match by profile name
  4. (Implicit) `currentKey` — fall back to the active profile

ADR-0013 also stated, explicitly: "The 6 migrated `*Interactive`
commands each provide their own `list` (so the seam's `list`
requirement is honored) and accept the defaults for
`formatChoice` / `keyOf` from `runProfileAction`."

When the code was actually written (and is still in `main` as of
the day before this ADR), the 6 commands called
`runSelectableAction` *directly* — not `runProfileAction` — and
supplied `list: (c) => c.profiles.listProfiles()` and
`currentKey: (c) => c.profiles.getCurrentProfile()` by hand. They
also never supplied `formatChoice` or `keyOf`.

Three consequences flowed from the half-migration:

**1. Latent P0 rendering bug.** With `T = Profile` (inferred from
`list: (c) => c.profiles.listProfiles()`), the default
`formatChoice` is `(item: Profile) => String(item)` and the
default `keyOf` is `String(item)`. The inquirer `choices` were
`{ name: '[object Object]', value: '[object Object]' }`. A 1-line
probe (`runSelectableAction(ctx, { list: (c) => c.profiles.listProfiles(),
... })` with no `formatChoice` / `keyOf`) reproduces it. Users
running `claude-profile switch` (interactive), `delete`, `rename`,
`duplicate`, or `edit` would see inquirer prompts labeled
`[object Object]` for every profile — and when multiple profiles
existed, inquirer could not distinguish them by value either, so
selection was effectively broken.

**2. 6× duplicated boilerplate.** `list: (c) => c.profiles.listProfiles()`
and `currentKey: (c) => c.profiles.getCurrentProfile()` appeared
verbatim in `delete.ts`, `rename.ts`, `duplicate.ts`, `edit.ts`,
`switch.ts`, and was also the intended default in `runProfileAction`
itself (the `list` half only — `currentKey` was never defaulted).
A textbook shallow pass-through: delete the 6× duplication and
the inquirer behavior is identical.

**3. Untested territory.** `tests/commands.test.ts` exercises only
the non-interactive command paths; the `*Interactive` functions
are never called. `tests/interactiveSession.test.ts` covers
`runSelectableAction` and `runProfileAction` directly but always
supplies explicit `formatChoice` / `keyOf`, so the half-migrated
state in the 6 commands was never pinned by any test.

## Decision

Close the seam fracture. Migrate the 6 commands to
`runProfileAction` and wire `currentKey` into the alias's defaults.

**`runProfileAction` now owns four defaults.** `list` reads from
`ctx.profiles.listProfiles()`, `formatChoice` is `profileChoice`
(rich row formatter), `keyOf` is `profileKeyOf` (profile name),
and **`currentKey` defaults to `ctx.profiles.getCurrentProfile()`**
(new in this ADR — it was the de facto profile-flow default that
every caller supplied by hand). All four are optional in the flow
type; callers may still override any of them.

**The 6 commands drop the boilerplate.** `deleteCommandInteractive`,
`renameCommandInteractive`, `duplicateCommandInteractive`,
`editCommandInteractive`, and `switchCommandInteractive` now call
`runProfileAction(ctx, { ... })` and supply only the
command-specific bits (verb, empty message, input builder,
optional confirmation, the underlying non-interactive command).
The `list` and `currentKey` fields are gone from each call site.

**Dead module deleted.** `src/presenters/envPresenter.ts` was a
25-line back-compat re-export shim that re-exported
`envPresenter` (from `./envRenderer.js`) and 4 `build*` functions
(from `../engine/envDiff.js`). It existed only "to keep
`import { envPresenter, buildXxx } from '.../envPresenter.js'`
working during the transition" — the transition is complete
(13 ADRs later, all imports updated). Only
`tests/envPresenter.test.ts` still imported from the shim; that
file's import is updated to import `envPresenter` from
`envRenderer.js` and the `build*` functions from `engine/envDiff.js`
directly. The shim file is deleted.

**Regression tests pin the new behavior.** A new
`tests/runProfileAction.test.ts` (10 cases) covers:
  - The 4 defaults (list / formatChoice / keyOf / currentKey)
    behave as documented.
  - The migrated `deleteCommandInteractive`,
    `editCommandInteractive`, and `switchCommandInteractive`
    all render the profile name in the inquirer prompt —
    never `[object Object]`. This is the direct regression
    test for the latent P0.
  - The single-item shortcut still honors the default
    `currentKey`.
  - Callers can still override any of the 4 defaults.

## Migration map

| File | Before | After |
|---|---|---|
| `src/commands/interactiveSession.ts` | `runProfileAction` defaulted only `list` / `formatChoice` / `keyOf`. Doc comment: "back-compat alias…7 existing commands keep their import." | `runProfileAction` defaults all 4 fields including `currentKey`. Doc comment rewritten to claim the alias as the *single home* for the 6 profile flows, with a paragraph about the half-migration bug. |
| `src/commands/delete.ts` | `runSelectableAction` + `list: (c) => c.profiles.listProfiles()` + `currentKey: (c) => c.profiles.getCurrentProfile()` | `runProfileAction` with the 2 fields dropped. |
| `src/commands/rename.ts` | same boilerplate | same simplification. |
| `src/commands/duplicate.ts` | same boilerplate | same simplification. |
| `src/commands/edit.ts` | same boilerplate | same simplification. |
| `src/commands/switch.ts` | `runSelectableAction<typeof profiles[number], SwitchProfileInput>` + boilerplate | `runProfileAction<SwitchProfileInput>`; the `typeof profiles[number]` projection is gone (T is fixed to `Profile` by the alias). |
| `src/presenters/envPresenter.ts` | 25-line back-compat re-export shim | File deleted. |
| `tests/envPresenter.test.ts` | `import { envPresenter, buildExportCommands, buildSwitchCommands } from '../src/presenters/envPresenter.js'` | Two-line import: `envPresenter` from `envRenderer.js`, the `build*` functions from `engine/envDiff.js`. |
| `tests/runProfileAction.test.ts` | (new file) | 10 cases pinning the 4 defaults, the migrated-command regression, and the override escape hatches. |

## What this deepening is NOT

- **Not a new abstraction.** `runProfileAction` already existed;
  this ADR just completes the migration that ADR-0013 claimed to
  have done.
- **Not a breaking change to the public API.** The 6 `*Interactive`
  commands keep their signatures, their cancellation semantics,
  and their user-visible behavior (other than the rendering fix).
  Embedders that depended on the `runProfileAction` type signature
  see a strictly more permissive type (`currentKey` is now
  optional, defaulted to the active profile).
- **Not a refactor of `runSelectableAction`.** The generic seam
  stays generic. Only the profile-flow alias tightens.

## Rejected alternatives

- **Fix the bug by adding a `T = Profile` overload on
  `runSelectableAction` that defaults to `defaultProfileChoice`
  when `T` is `Profile`.** Rejected — too magic. The seam
  fracture is real: the 6 profile flows have a stable, named
  concept (a profile) and that concept deserves a named seam
  (`runProfileAction`). A `T`-based overload is the kind of
  conditional behavior that earns a `// do not remove this
  magic` comment and a future bug report when someone adds a
  7th `*Interactive` command that also happens to pass a
  `Profile[]` list for a different reason.

- **Leave the 6 commands on `runSelectableAction` and supply
  `formatChoice: profileChoice` / `keyOf: profileKeyOf` by
  hand in each command.** Rejected — that fixes the rendering
  bug but still leaves the `list` / `currentKey` boilerplate
  duplicated, and it scatters "the profile-flow decision"
  across 6 call sites instead of centralizing it in the alias.
  The alias is the right home for "this is a profile flow"
  decisions, full stop.

- **Delete `runProfileAction` entirely and force the 6 callers
  to use `runSelectableAction<Profile, TInput>` directly.** This
  was rejected in ADR-0013 ("forcing every caller to re-wire
  the same defaults would re-introduce the same coupling at a
  different level") and rejected again here. The alias is the
  1-line convenience that captures the "this is a profile
  flow" decision in one place.

- **Delete the `envPresenter.ts` shim in a separate PR.** Rejected
  — the shim is dead surface area, and a 1-line import update
  in the only remaining test file is too small to warrant a
  separate change. Batching it with the migration keeps the
  diff focused on the seam closure.

## References

- `src/commands/interactiveSession.ts` — `runProfileAction`
  now defaults all 4 fields; doc comment rewritten.
- `src/commands/{delete,rename,duplicate,edit,switch}.ts` —
  migrated to `runProfileAction`; `list` and `currentKey`
  fields dropped.
- `src/presenters/envRenderer.ts` — unchanged but now the
  single home for `envPresenter` (the shim is gone).
- `src/engine/envDiff.ts` — unchanged but now the single home
  for `buildExportCommands` / `buildSwitchCommands` /
  `buildExportJson` / `buildSwitchJson`.
- `tests/envPresenter.test.ts` — import updated to the two
  direct paths.
- `tests/runProfileAction.test.ts` — 10-case regression test
  pinning the seam closure.
- ADR-0009 — first round of `Prompts` interface shrinkage
  (5 `input*` shims removed from the interface).
- ADR-0013 — introduced `runSelectableAction` and
  `runProfileAction` as the interactive seam; this ADR
  completes the migration that ADR-0013 claimed to have
  done.
