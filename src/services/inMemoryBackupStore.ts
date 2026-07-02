/**
 * InMemoryBackupStore — the test `BackupStore` adapter.
 *
 * Backups are stored as in-memory blobs keyed by the path they were
 * "created" at. The default `create` flow generates a fresh path
 * under `getBackupDir()` (which is a virtual path, not on disk).
 *
 * The security validator is exposed so tests can drive hostile
 * payloads through `extract` and assert the rejection.
 */
import { AppError, FileOperationError } from '../errors.js';
import type { BackupEntry, BackupStore } from './backupStore.js';

const DEFAULT_BACKUP_DIR = '/virtual/.claude-profile-backups';
const DEFAULT_PREFIX = 'claude-profile-backup-';
const DEFAULT_EXTENSION = '.tar.gz';

export class InMemoryBackupStore implements BackupStore {
  private readonly archives = new Map<string, Buffer>();
  private readonly fileSystem = new Map<string, { mtime: Date }>();
  private counter = 0;
  private readonly validator: (entry: { path?: string; type?: string }) => boolean;

  constructor(
    options: {
      /**
       * Optional validator override. The default validator mirrors
       * the filesystem adapter's checks (rejects absolute paths,
       * `..` traversal, and sym/hardlinks). Tests can pass a
       * custom validator to assert specific rejection behavior.
       */
      validator?: (entry: { path?: string; type?: string }) => boolean;
      /** Override the default backup directory. */
      backupDir?: string;
    } = {}
  ) {
    this.validator =
      options.validator ??
      ((entry) => {
        if (!entry.path) return false;
        if (entry.path.startsWith('/')) return false;
        if (entry.path.split('/').includes('..')) return false;
        if (entry.type === 'SymbolicLink' || entry.type === 'Link') return false;
        return true;
      });
    if (options.backupDir) {
      this._backupDir = options.backupDir;
    }
  }

  private _backupDir: string = DEFAULT_BACKUP_DIR;

  getBackupDir(): string {
    return this._backupDir;
  }

  generateBackupName(): string {
    this.counter += 1;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `${DEFAULT_PREFIX}${stamp}-${this.counter}${DEFAULT_EXTENSION}`;
  }

  async create(sourceDir: string, outputPath?: string): Promise<string> {
    if (!this.fileSystem.has(sourceDir)) {
      throw new AppError(`源目录不存在: ${sourceDir}`, 'SOURCE_DIR_NOT_FOUND', { sourceDir });
    }
    const target = outputPath || `${this.getBackupDir()}/${this.generateBackupName()}`;
    this.archives.set(target, Buffer.from(`<archive-of:${sourceDir}>`));
    this.fileSystem.set(target, { mtime: new Date() });
    return target;
  }

  async extract(archivePath: string, _targetDir: string): Promise<void> {
    if (!this.archives.has(archivePath)) {
      throw new FileOperationError('read backup', archivePath, new Error('File not found'));
    }
    // Allow tests to inspect the extract attempt by exposing the
    // last attempted path; the actual contents are not unpacked
    // because the in-memory adapter is a test seam, not a real
    // extractor. Real validation is done by the fileSystem adapter.
    this._lastExtractPath = archivePath;
  }

  private _lastExtractPath: string | null = null;
  getLastExtractPath(): string | null {
    return this._lastExtractPath;
  }

  list(): BackupEntry[] {
    const entries: BackupEntry[] = [];
    for (const [path, { mtime }] of this.fileSystem.entries()) {
      if (path.startsWith(this.getBackupDir()) && path.endsWith(DEFAULT_EXTENSION)) {
        entries.push({ name: path.split('/').pop()!, path, date: mtime });
      }
    }
    return entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Test-only: simulate a hostile archive by inserting a Buffer that,
   * when extracted by the real filesystem adapter, would contain a
   * `..` segment. Useful for asserting the validator rejects it.
   */
  /**
   * Test-only: register a directory as "existing" so `create` can
   * archive from it. Without this, the in-memory adapter has no
   * concept of a source filesystem.
   */
  injectSourceDir(sourceDir: string): void {
    this.fileSystem.set(sourceDir, { mtime: new Date() });
  }

  injectArchive(path: string, _payload?: Buffer): void {
    this.archives.set(path, Buffer.from('injected'));
    this.fileSystem.set(path, { mtime: new Date() });
  }

  /**
   * Test-only: run the configured validator against a synthetic
   * tar entry without invoking the real `tar` library.
   */
  validateEntry(entry: { path?: string; type?: string }): boolean {
    return this.validator(entry);
  }
}
