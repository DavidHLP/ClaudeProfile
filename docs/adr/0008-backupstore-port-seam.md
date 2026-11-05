# ADR-0008: BackupStore port seam

Status: Accepted (2026-07-02)

## Context

`commands/backup.ts` was a 193-line god-file that mixed 3 layers:

1. **The command shape** (`backupCommand`, `restoreCommand`,
   `restoreCommandInteractive`) — the only thing the command layer
   is supposed to do.
2. **The backup-domain knowledge** (`getBackupDir`,
   `generateBackupName`, `listBackups`, `validateTarEntry` — the
   tar-specific path-traversal and symlink rejection).
3. **The 3rd-party I/O** (`tar.create`, `tar.extract`,
   `fs.{mkdir,readdir,stat}`).

Consequences:

1. **Tarball knowledge leaked into the command layer.** Adding a
   new archive format (zip, tar.zst, borg) would mean rewriting
   the command. The validation logic (path-traversal rejection,
   symlink rejection) lived alongside the dispatcher instead of
   at the I/O boundary.
2. **No backup tests at all.** The 7 check functions in
   `commands/doctor.ts` had 2 test cases each (per ADR-0006);
   `backup.ts` had **zero** — there was no `tests/backup.test.ts`.
   The security checks (`validateTarEntry`) were untested. A
   malicious tar payload could not be tested without a real
   tarball fixture.
3. **`restoreCommandInteractive` bypassed `runProfileAction`.** It
   hand-rolled the `list → select → cancel` sequence even though
   `runProfileAction` was introduced to consolidate that exact
   pattern. The only other `*Interactive` command that
   hand-rolled the dance was `importFileCommandInteractive`.

Two adapters justifying a port existed implicitly (filesystem in
prod, none in tests) but the second adapter was not built —
there was no `InMemoryBackupStore`, only the inlined filesystem
code.

## Decision

Introduce a `BackupStore` port with two adapters, and refactor
the command to be a thin shell.

**`src/services/backupStore.ts`** owns the port:

- `BackupEntry` — `{ name, path, date }`.
- `BackupStore` interface with 5 methods:
  `create(sourceDir, outputPath?)`, `extract(archivePath, targetDir)`,
  `list()`, `getBackupDir()`, `generateBackupName()`.
- `backupStore` — the production singleton.

**`src/services/fileSystemBackupStore.ts`** is the production
adapter. It implements every method using `tar` and `fs`. The
security validator (`validateTarEntry` — rejects absolute
paths, `..` traversal, and sym/hardlinks) lives at the I/O
boundary inside the `tar.extract` filter callback. The validator
throws `AppError('INVALID_BACKUP_ENTRY', ...)` to abort the
extract on any violation.

**`src/services/inMemoryBackupStore.ts`** is the test adapter.
It stores archives as `Buffer`s in a `Map` keyed by path. The
validator is exposed via `validateEntry()` so tests can drive
hostile payloads through the same code path. The adapter also
exposes `injectSourceDir()` and `injectArchive()` so tests can
set up state without touching the filesystem.

**`src/commands/context.ts`** gains `backup: BackupStore` as the
5th field of `CommandContext`. `createDefaultContext()` uses
the production singleton; `createTestContext({ backup: ... })`
lets tests inject `InMemoryBackupStore`.

**`src/commands/backup.ts`** shrinks from 193 → 97 lines. It
contains zero tar-specific code. The 3 commands just call the
port.

**`src/commands/interactiveSession.ts`** generalizes
`runProfileAction` to `runSelectableAction<TSelected, TInput>`.
The original `runProfileAction` becomes a thin alias that fixes
`TSelected` to `Profile`. `restoreCommandInteractive` uses
`runSelectableAction<string, RestoreConfigInput>` with a custom
`list` that reads the backup list from the port and a custom
`formatChoice` that renders the timestamp. The
"select-backup" dance is no longer hand-rolled.

## Consequences

Positive:

- **Two adapters justify a real port.** The filesystem adapter is
  prod; the in-memory adapter is the test stand-in. Adding a 3rd
  adapter (a remote backup target) is a single new file — no
  command-layer edits.
- **Tarball knowledge concentrates in one file.** Changing to
  `zip` or `tar.zst` is a single-adapter swap; the command
  layer doesn't change.
- **Security checks at the port boundary.** The path-traversal
  and symlink rejection checks live with the I/O, where the
  hostile payload crosses into our process. They are testable
  with the in-memory adapter (pass a synthetic entry, assert
  rejection).
- **Removes the last `*Interactive` bypass.** `restoreCommandInteractive`
  now goes through `runSelectableAction`, the same flow that 7
  other `*Interactive` commands use. Cancel semantics are
  uniform.
- **5 new tests in `tests/backupStore.test.ts` + 13 contract
  tests** pin the port surface, the security validator, and the
  in-memory adapter's create/list/extract flow. Before this ADR
  there were zero direct backup tests.

Negative:

- **`CommandContext` grew from 4 fields to 5.** The
  `TestContextOverrides` interface grows accordingly. The
  additive growth is justified by the 193-line deduplication.
- **The `selectBackup` method on `Prompts` is now unused by
  the command layer.** It stays in the `Prompts` interface for
  embedder back-compat (the same rationale ADR-0003 used for
  the 5 `inputXxx` methods). The function lives as a top-level
  export of `ui/prompt.ts`.
- **A new `CancelledError` catch was needed in
  `restoreCommandInteractive`** because `runSelectableAction`
  converts `CancelledError` to a uniform
  `{ success: false, wasCancelled: true }` result with a
  different error message (`已取消恢复。` vs the flow's
  default `已取消恢复。`). The catch normalizes both. This is
  a leaky seam that should be revisited if a 3rd
  "selectable" flow is added.
- **`runSelectableAction` adds 3 optional fields to the flow
  descriptor** (`list`, `formatChoice`, `currentKey`). These
  are only used by non-profile flows; the 7 profile flows
  continue to use the simplified `runProfileAction` alias.

## Alternatives considered

- **Keep the tarball code in `commands/backup.ts` but extract a
  `tarHelpers.ts` module.** Rejected — the helpers would still
  be inlined; only the file split would change. The port is the
  real seam; without it, the 193-line command has nowhere to
  move the tarball knowledge.
- **Add `BackupStore` to the context as a static
  import** (like `profileService` is imported by
  `ProfileServiceImpl`). Rejected — the context seam is the
  project's testability pattern (per ADR-0001). Putting
  `BackupStore` on the context matches the existing
  `ProfileService` pattern and lets `createTestContext` swap
  the adapter.
- **Use the in-memory adapter as the default singleton.** Rejected
  — the production singleton must hit the real filesystem. The
  in-memory adapter exists only to be injected by tests.
- **Skip the `selectBackup` removal.** The function lives but
  is unreachable from the command layer. Per the principle
  "1 adapter = hypothetical seam, 2 adapters = real seam", a
  method no caller uses is dead code. Leaving it in costs
  nothing today; removing it is a separate, smaller ADR.
- **Skip the ADR and ship the port in one commit.** Rejected —
  the change touches 6 files (the new port, the 2 new
  adapters, the context, the command, the interactive session,
  the index) and reverses a real bypass in the existing
  command flow. The ADR is the durable record of why the port
  exists and what "use a different archive format" means in
  the future.

## References

- `src/services/backupStore.ts` — new port + singleton
- `src/services/fileSystemBackupStore.ts` — new prod adapter
- `src/services/inMemoryBackupStore.ts` — new test adapter
- `src/commands/context.ts` — adds `backup` field
- `src/commands/backup.ts` — shrinks from 193 → 97 lines
- `src/commands/interactiveSession.ts` — adds `runSelectableAction`
- `src/index.ts` — re-exports `BackupStore`, `BackupEntry`,
  `FileSystemBackupStore`, `InMemoryBackupStore`
- `tests/backupStore.test.ts` — 18 new tests
- `CONTEXT.md` — new "BackupStore" glossary entry
- ADR-0001 — established the CommandContext seam pattern
- ADR-0003 — established the "back-compat shim lives in
  `ui/prompt.ts`" pattern
