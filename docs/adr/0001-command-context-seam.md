# ADR-0001: CommandContext seam for CLI commands

Status: Accepted (2026-07-02)

## Context

Every command in `src/commands/*.ts` imported two module-level
singletons — `profileService` from `services/profileService.ts` and
`envPresenter` from `presenters/envRenderer.ts` — and used
`await import('../ui/prompt.js')` to lazy-load inquirer. The
`ProfileService` and `EnvPresenter` interfaces existed but never
appeared in any command signature.

Consequences:

1. **Commands were untestable in isolation.** Tests had to use
   `vi.mock('../src/services/profileService.js', ...)` at the top of
   the file and hand-build a mock chain. Every new test file
   repeated the same fixture boilerplate.
2. **A workaround pattern leaked into the codebase.** Every
   `*Interactive` command carried the same
   `await import('../ui/prompt.js')` dance. This was originally a
   micro-optimization to avoid loading `inquirer` in non-TTY mode.
3. **Provider materialization was inlined.** `create.ts` had a 7-line
   `provider.envTemplate + 5 ANTHROPIC_* keys` spread that
   re-implemented "merge template with credentials" in one place
   that callers had to know about.
4. **Verbose detail was duplicated.** `listCommand` (verbose) and
   `validateCommand` (verbose) hand-formatted the same per-profile
   detail. Two callers, one set of facts.

## Decision

Introduce a `CommandContext` interface that carries the four
dependencies a command needs:

```ts
interface CommandContext {
  profiles: ProfileService;
  env: EnvPresenter;
  prompts: Prompts;
  isTTY: boolean;
}
```

Every command takes a `CommandContext` as its first argument. The CLI
bin file constructs a default context once and threads it through.
Tests construct fresh contexts in `beforeEach` and never reach for
module-level singletons.

Three supporting changes ship with this:

- **`Prompts` interface.** Replaces `await import('../ui/prompt.js')`
  in interactive commands. `realPrompts` is the inquirer-backed
  implementation; `noopPrompts` returns null/empty/false for tests.

- **`materializeProfile(provider, input, name)`** in
  `templates/providers.ts`. Single home for the
  "merge template defaults with user credentials" logic. Removed the
  inline spread from `create.ts`.

- **`envPresenter.formatProfileDetail(profile, isCurrent)`** in
  `presenters/envRenderer.ts`. Single home for the per-profile
  verbose-detail block. `listCommand` and `validateCommand` both
  call it.

## Consequences

Positive:

- **Commands are testable without `vi.mock`.** Every test now
  constructs a fresh `CommandContext` backed by `InMemoryConfigStore`
  and the real `EnvPresenter`. The mock-chain boilerplate is gone.
- **The Prompts interface is a real seam.** The interactive and
  non-interactive command variants can be tested independently.
- **The verbose list/validate duplication is gone.** Both call
  `formatProfileDetail`.
- **Provider materialization is one function.** Adding a new env
  field touches one file, not four.

Negative:

- **Public API signatures change.** Every command now takes `ctx` as
  its first argument. The bin and any embedders must construct a
  context. Migration: `createDefaultContext()` is provided and
  matches the previous singleton behavior.
- **A small indirection at every command.** Worth the testability
  tradeoff; the indirection is consistent and grep-able.

## Alternatives considered

- **Add `__test_context__` global with a reset hook.** Rejected —
  contaminates production code with testability hooks, doesn't fix
  the dynamic-import workaround, doesn't help with #3 or #4.
- **Keep the singleton but extract a `withServices(command, args)`
  wrapper.** Rejected — moves the coupling, doesn't remove it. The
  command signature still hides its dependencies.
- **Refactor only #3 and #4, leave the singleton.** Rejected — the
  singleton is the load-bearing coupling. Fixing only the symptoms
  leaves the deep seam absent.

## References

- `src/commands/context.ts` — the seam
- `src/commands/prompts.ts` — `Prompts` interface + `realPrompts`
- `src/templates/providers.ts` — `materializeProfile`
- `src/presenters/envRenderer.ts` — `formatProfileDetail`
- `tests/context.test.ts` — proves the seam
- `CONTEXT.md` — glossary entries for the new terms
