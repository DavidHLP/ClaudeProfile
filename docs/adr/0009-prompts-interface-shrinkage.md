# ADR-0009: Prompts interface shrinkage

Status: Accepted (2026-07-02)

## Context

ADR-0003 introduced `inputProfileField` as the canonical
schema-backed per-field prompt and preserved the 5 hand-rolled
methods — `inputApiToken` / `inputBaseUrl` / `inputSonnetModel` /
`inputOpusModel` / `inputHaikuModel` — on the `Prompts` interface
"for back-compat with any external embedder that depended on
them."

After ADR-0003, the 5 methods were 1-line delegations to
`ui/prompt.ts` that hardcoded messages and validators the schema
now owned. The `Prompts` interface was 14 methods wide; the 5
shims accounted for 36% of the surface area. Adding a 6th field
meant adding a 6th shim. `noopPrompts` (in `commands/context.ts`)
hand-rolled 14 sentinel values to keep in lock-step with the
interface, including a `selectProvider` placeholder that leaked
the `ProviderTemplate` shape (a `{ id: 'custom', name: 'Custom',
... }` value the test framework had to know to ignore).

This is a CLI with **no embedders**. The "back-compat for
embedders" rationale was speculative. The 5 shims were dead
surface — they existed in case an embedder showed up, not because
an embedder was using them.

The deletion test: if you delete the 5 shims, the only thing
that breaks is a hypothetical embedder. Every internal command
already uses `inputProfileField`.

## Decision

Remove the 5 `inputXxx` methods from the `Prompts` interface,
from `realPrompts`, and from `noopPrompts`. The 5 functions
remain as top-level exports of `ui/prompt.ts` for any future
embedder (e.g. a web UI or a programmatic caller) that wants
them.

The `Prompts` interface shrinks from 14 → 9 methods. `noopPrompts`
shrinks accordingly. `tests/context.test.ts` adds an explicit
"does not expose the dropped 5 shims" test to prevent the
interface from re-growing by accident.

## Consequences

Positive:

- **Interface shrinks 14 → 9.** The test surface is 5 smaller
  (`tests/context.test.ts` enumerates every method).
- **Locality.** The 5 functions live where their implementation
  lives (`ui/prompt.ts`), not duplicated on the `Prompts` seam.
- **Removes the `ProviderTemplate` shape leak** from
  `noopPrompts#selectProvider` (a separate concern, but a side
  benefit of `noopPrompts` being a more honest sentinel now).
- **Reveals the next seam.** A future embedder (a web UI) would
  hit the missing methods at compile time, prompting the
  question "should this be in `Prompts` or as a top-level
  export?" The answer is usually the latter, which is what the
  embedder would discover.

Negative:

- **Public API break.** `Prompts#inputApiToken`,
  `Prompts#inputBaseUrl`, `Prompts#inputSonnetModel`,
  `Prompts#inputOpusModel`, `Prompts#inputHaikuModel` no longer
  exist. Any external embedder (real or hypothetical) that
  called them via `ctx.prompts.inputApiToken()` would need to
  import the top-level function from `ui/prompt.ts` instead.
- **An explicit anti-regression test is required** in
  `tests/context.test.ts` because the silent re-addition of
  the 5 shims would compile cleanly otherwise.

## Alternatives considered

- **Keep the 5 shims but mark them `@deprecated`.** Rejected —
  deprecation without removal is "shims forever." The deletion
  test confirms the shims are dead surface; the only way to
  actually shrink the interface is to remove them.
- **Move the 5 functions into a `legacyPrompts` namespace.**
  Rejected — the embedder would import `legacyPrompts.inputApiToken`
  and we would have just moved the indirection. The cleaner
  contract is "use `inputProfileField` for the schema-backed
  path; import the 5 functions from `ui/prompt.ts` directly if
  you need them."
- **Wait for an embedder to actually appear before removing the
  shims.** Rejected — by the time an embedder shows up, the
  maintainer will have forgotten why the shims exist (or not
  existed). The right time to remove dead surface is while the
  history is still fresh.
- **Drop the 5 shims AND `selectBackup`.** Rejected — the HTML
  review (and the file's purpose) calls out exactly the 5
  `inputXxx` shims. `selectBackup` is on a parallel path: it
  became dead after ADR-0008 (the `BackupStore` port moved the
  selection flow into `runSelectableAction`). A separate, small
  follow-up ADR can address it.

## References

- `src/commands/prompts.ts` — drops 5 methods
- `src/commands/context.ts` — `noopPrompts` drops 5 sentinel
  values
- `src/ui/prompt.ts` — `inputApiToken` etc. remain as top-level
  exports
- `tests/context.test.ts` — adds anti-regression test
- `CONTEXT.md` — updates the "Prompts" glossary entry to
  remove the back-compat language
- ADR-0003 — established `inputProfileField` as the canonical
  schema-backed prompt
