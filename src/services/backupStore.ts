/**
 * BackupStore — the port for backup / restore of the config directory.
 *
 * Why this module exists
 * ----------------------
 * Before this module, `commands/backup.ts` was a 193-line god-file
 * that mixed 3 layers: (a) the command shape (`backupCommand` /
 * `restoreCommand` / `restoreCommandInteractive`); (b) the
 * backup-domain knowledge (`getBackupDir`, `generateBackupName`,
 * `listBackups`, `validateTarEntry` — the tar-specific path-traversal
 * and symlink rejection); (c) the 3rd-party I/O (`tar.create`,
 * `tar.extract`, `fs.*`). Tarball knowledge leaked into the command
 * layer; the security checks (path traversal, symlink rejection)
 * lived alongside the dispatcher instead of at the I/O boundary.
 *
 * After this module:
 *   - `BackupStore` is the port. Two adapters ship: `FileSystemBackupStore`
 *     (prod, tar-based) and `InMemoryBackupStore` (tests, in-memory blobs).
 *   - The security checks live at the port boundary, where the hostile
 *     payload (a tar file) crosses into our process. They are testable
 *     with the in-memory adapter — pass a malicious tar, assert rejection.
 *   - `commands/backup.ts` is a thin shell that calls the port; it
 *     contains zero tar-specific code.
 *   - `restoreCommandInteractive` uses `runSelectableAction` (a
 *     generalization of `runProfileAction`), the same flow that
 *     `delete` / `rename` / `duplicate` use for profile selection.
 *
 * Dependency category
 * -------------------
 * Ports & adapters (per `DEEPENING.md`). The 3rd-party tar library
 * is the remote-external dependency; the in-memory adapter is the
 * test stand-in. The seam exists because two adapters justify it
 * (filesystem in prod, in-memory in tests) — not just one.
 *
 * Locality: every "what does a backup look like" decision lives
 * here. Changing the archive format (zip, tar.zst, borg) is a
 * single-adapter swap; the command layer doesn't change.
 */
import { FileSystemBackupStore } from './fileSystemBackupStore.js';

export interface BackupEntry {
  readonly name: string;
  readonly path: string;
  readonly date: Date;
}

/**
 * The backup port.
 *
 *   - `create(sourceDir, outputPath?)` — create a new archive of
 *     `sourceDir`; return the path of the archive. When `outputPath`
 *     is omitted, the port picks a default name and location.
 *   - `extract(archivePath, targetDir)` — restore an archive into
 *     `targetDir`. Throws `AppError('INVALID_BACKUP_ENTRY', ...)` for
 *     any security violation (path traversal, symlink, absolute path).
 *   - `list()` — return all known backups, sorted newest-first.
 *     Returns `[]` when no backup directory exists.
 *   - `getBackupDir()` — the directory where `create` writes by
 *     default. Callers can pass an `outputPath` to `create` to
 *     override this.
 *   - `generateBackupName()` — produce a fresh, timestamped
 *     filename suitable for `create`'s default.
 */
export interface BackupStore {
  create(sourceDir: string, outputPath?: string): Promise<string>;
  extract(archivePath: string, targetDir: string): Promise<void>;
  list(): BackupEntry[];
  getBackupDir(): string;
  generateBackupName(): string;
}

/**
 * Production singleton. Tests can construct their own `BackupStore`
 * (typically `InMemoryBackupStore`) and pass it to `ctx.backup` via
 * `createTestContext({ backup: ... })`.
 */
export const backupStore: BackupStore = new FileSystemBackupStore();
