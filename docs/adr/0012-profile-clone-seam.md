# ADR-0012: ProfileClone seam for deriving a new profile from an existing one

Status: Accepted (2026-07-02)

## Context

Two commands in `src/commands/*.ts` — `renameCommand` and
`duplicateCommand` — derived a new `Profile` from an existing one
in the exact same way:

```ts
const sourceProfile = ctx.profiles.getProfile(input.sourceName);
if (ctx.profiles.profileExists(input.newName)) {
  throw new ProfileAlreadyExistsError(input.newName);
}
const newProfile = {
  name: input.newName,
  description: sourceProfile.description,
  env: { ...sourceProfile.env },
};
ctx.profiles.saveProfile(newProfile);
```

`renameCommand` then layered two rename-specific side effects on top
(re-pointing the active marker, deleting the source). `duplicateCommand`
stopped right after the save.

| File | What it knew about cloning |
|---|---|
| `src/commands/rename.ts` | 4-line clone block + 2 rename-specific side effects |
| `src/commands/duplicate.ts` | 4-line clone block (verbatim copy) |
| `src/services/profileService.ts` | Nothing — `saveProfile` was the only persistence primitive and callers re-orchestrated it |
| `tests/profileService.test.ts` | No direct clone test; clone behavior was only ever asserted through `renameCommand` / `duplicateCommand` integration tests |

Consequences:

1. **The "build a new profile from an existing one" pattern had no
   canonical home.** Adding a field to `Profile` (e.g. a future
   `tags: string[]` per profile) required editing both commands in
   lock-step or the two paths would drift in which fields they
   preserve.
2. **The existence-check policy was duplicated.** Both commands
   threw `ProfileAlreadyExistsError` on `profileExists(newName)` —
   including the degenerate `source === target` case (rename a
   profile to its own name was already refused, but the contract
   lived in two places).
3. **Clone was untested in isolation.** The 5 invariants the
   command layer relies on — description preserved, every env key
   preserved, env is an independent copy, source must exist, target
   must not exist — were only indirectly asserted through the
   rename/duplicate integration tests. A regression in the
   shallow-copy policy (e.g. someone switching `{ ...source.env }`
   to `source.env` and sharing the reference) would slip through.
4. **The shape was shallow at the command layer.** The two
   commands carried 4 lines of orchestration that did not differ
   between them, mixed with the command-specific behavior. Per the
   glossary: "a lot of behaviour behind a small interface" is
   depth; "interface nearly as complex as the implementation" is
   shallow. The two commands were the latter.

## Decision

Introduce `cloneProfile(sourceName, newName): void` on
`ProfileService` (interface + impl). It is the single home for
the "derive a new profile from an existing one" operation:

```ts
cloneProfile(sourceName: string, newName: string): void {
  const source = this.getProfile(sourceName);   // throws ProfileNotFoundError
  if (this.profileExists(newName)) {            // includes source === target
    throw new ProfileAlreadyExistsError(newName);
  }
  this.saveProfile({
    name: newName,
    description: source.description,
    env: { ...source.env },
  });
}
```

Three supporting changes ship with this:

- **`renameCommand`** in `src/commands/rename.ts` collapses to:

  ```ts
  ctx.profiles.cloneProfile(input.oldName, input.newName);
  if (ctx.profiles.getCurrentProfile() === input.oldName) {
    ctx.profiles.setCurrentProfile(input.newName);
  }
  ctx.profiles.deleteProfile(input.oldName);
  ```

  The 4-line clone block is gone; the 2 rename-specific side
  effects (active-marker re-pointing, source deletion) stay
  because they are not part of "what does a clone do."

- **`duplicateCommand`** in `src/commands/duplicate.ts` collapses
  to:

  ```ts
  ctx.profiles.cloneProfile(input.sourceName, input.newName);
  ```

  The 4-line block is gone; the command is a one-liner over the
  seam.

- **6 new tests in `tests/profileService.test.ts`** pin the seam:
  description preserved, env preserved, source still exists after
  the call, env is an independent copy (mutating the source's env
  via the underlying store does not affect the clone),
  `ProfileNotFoundError` on missing source, `ProfileAlreadyExistsError`
  on a taken target (including the degenerate `source === target`
  case).

The `Profile` shape (3 fields: `name`, `description`, `env`) is
the schema's contract; `cloneProfile` is the only place outside
`materializeProfile` that constructs a `Profile` from scratch
beyond the create path.

## Consequences

Positive:

- **The clone logic has one home.** Adding a new field to `Profile`
  touches `cloneProfile` (and `materializeProfile`, the create
  path's twin), not the two commands. Drift between rename and
  duplicate becomes structurally impossible.
- **The existence-check policy is one line.** The "refuse on
  collision, including the self-clone degenerate case" contract
  is encoded once in `cloneProfile` and re-asserted by a focused
  test.
- **The two commands are now thin shells.** `renameCommand` is
  the clone + 2 rename-specific side effects; `duplicateCommand`
  is the clone + the success-message. The command layer no
  longer knows how a `Profile` is shaped beyond the field
  references the side effects touch.
- **Clone is testable without the command layer.** 6 focused
  tests in `tests/profileService.test.ts` cover the invariants
  directly. The integration tests in `tests/commands.test.ts`
  for `renameCommand` / `duplicateCommand` continue to pass
  unchanged, so the command surface is preserved.
- **The shallow-copy policy is anchored.** The "env spread is
  the right deep copy because `EnvConfig` is a flat string
  record" claim is a comment in `cloneProfile` and a test in
  `tests/profileService.test.ts#cloneProfile > should produce
  an env that is independent of the source`. A future field
  change has two clear signposts.

Negative:

- **The `ProfileService` interface grew by one method.** Embedders
  implementing a custom `ProfileService` must add `cloneProfile`.
  The method is small (5 lines) and the only plausible
  alternative — letting the two commands keep inlining the
  pattern — leaks the schema's `Profile` shape back into the
  command layer and is the exact problem this seam is solving.
- **A small surface for misuse.** A caller that wants the
  "overwrite on collision" semantics must use `saveProfile`
  directly (the seam refuses on collision by design). The
  documentation on `saveProfile` now explicitly points at
  `cloneProfile` for the "refuse on conflict" case.

## Alternatives considered

- **Add a higher-level `renameCommand` / `duplicateCommand`
  helper on the service** (e.g. `renameProfile(oldName, newName)`
  that does the clone + active-marker re-point + delete in one
  call). Rejected — the active-marker re-point is a rename
  concern, not a profile-clone concern. Bundling it into the
  clone seam would force `duplicateCommand` to either no-op
  the re-point/delete or live with a "rename-without-active-side-
  effects" variant. The current seam is the smaller, more
  honest shape.
- **Keep the duplication, add a "render an error if collision"
  helper on the service.** Rejected — the helper would be 1
  line, the duplication is 4 lines, and the helper does not
  address the testability problem. The seam earns its keep by
  being the operation, not a policy fragment.
- **Make `saveProfile` itself refuse on collision.** Rejected —
  the create flow legitimately wants overwrite (the in-place
  create-after-error case in `createCommandInteractive`),
  and the backup / restore paths also rely on
  overwrite-on-save. Encoding "refuse on collision" in
  `saveProfile` would invert the existing contract.
- **Use a single `cloneOrRename(sourceName, newName, opts)` that
  fuses both shapes.** Rejected — `clone` is the deep module
  here; "rename" is `clone` + 2 lines of side effects, and
  "duplicate" is `clone` + 1 line. Fusing them would hide the
  fact that the side effects are genuinely rename-specific and
  make the seam shallower.

## Follow-up opportunities (not addressed here)

- **`materializeProfile`** in `src/templates/providers.ts` (the
  create path) builds a `Profile` from a `ProviderTemplate` plus
  user credentials. It is a different shape (template → profile,
  not profile → profile), so it does not consume `cloneProfile`.
  A future ADR could add a `ProfileBuilder` seam that hosts
  both `materializeProfile` and `cloneProfile` as the two
  constructors of a `Profile` from non-`Profile` inputs. The
  current ADR does not address this; the two constructors are
  not duplicates, just siblings.
- **The `importFileCommand` in `commands/import.ts`** still does
  its own `profileExists` + `saveProfile` triplet inline (and
  also imports `ProfileAlreadyExistsError` directly). A future
  ADR could make `cloneProfile` the single home for that
  triplet as well, by treating the imported profile as
  "essentially a profile named `newName` whose description and
  env come from the parsed file." The current ADR scopes itself
  to the rename/duplicate pair to keep the change focused.

## References

- `src/services/profileService.ts` — adds `cloneProfile` to the
  `ProfileService` interface and `ProfileServiceImpl`
- `src/commands/rename.ts` — calls `cloneProfile`; rename-specific
  side effects remain
- `src/commands/duplicate.ts` — collapses to a single
  `cloneProfile` call
- `tests/profileService.test.ts` — 6 new tests for the seam
- `CONTEXT.md` — new "Profile Clone" glossary entry
- `docs/adr/0011-profile-import-pipeline.md` — sibling seam
  (the import path's "refuse on collision" twin)
- `docs/adr/0002-profile-schema-seam.md` — the
  `Profile` shape is owned by the schema
