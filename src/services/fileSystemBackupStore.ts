/**
 * FileSystemBackupStore — the production `BackupStore` adapter.
 *
 * Uses `tar` (a 3rd-party library) to read and write archives, and
 * `fs` for the surrounding directory and metadata operations. All
 * archive validation (`validateTarEntry`) lives here, at the I/O
 * boundary, so a hostile archive cannot reach the command layer.
 *
 * Security checks
 * ---------------
 *   - Reject entries with absolute paths.
 *   - Reject entries with `..` path segments (path traversal).
 *   - Reject symlinks and hardlinks.
 *   - Reject entries with no `path` (defensive — should be impossible).
 *
 * The checks run in `tar.extract`'s `filter` callback. The filter is
 * invoked once per entry; rejecting the entry causes tar to skip it
 * (it is never written to disk). The `AppError` is thrown to abort
 * the entire extract operation, matching the original behavior.
 */
import * as tar from 'tar';
import type { Stats } from 'fs';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { dirname } from 'path';
import { AppError, FileOperationError } from '../errors.js';
import type { BackupEntry, BackupStore } from './backupStore.js';

const BACKUP_DIR_NAME = '.claude-profile-backups';
const BACKUP_PREFIX = 'claude-profile-backup-';
const BACKUP_EXTENSION = '.tar.gz';
const BACKUP_TAR_FILTER_ERROR_CODE = 'INVALID_BACKUP_ENTRY';

interface TarEntry {
  path?: string;
  type?: string;
}

function validateTarEntry(entry: TarEntry): boolean {
  if (!entry.path) {
    return false;
  }
  const path = entry.path;
  if (path.startsWith('/')) {
    return false;
  }
  const parts = path.split('/');
  if (parts.includes('..')) {
    return false;
  }
  if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
    return false;
  }
  return true;
}

function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '~';
}

export class FileSystemBackupStore implements BackupStore {
  getBackupDir(): string {
    return `${getHomeDir()}/${BACKUP_DIR_NAME}`;
  }

  generateBackupName(): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `${BACKUP_PREFIX}${timestamp}${BACKUP_EXTENSION}`;
  }

  async create(sourceDir: string, outputPath?: string): Promise<string> {
    if (!existsSync(sourceDir)) {
      throw new AppError(`源目录不存在: ${sourceDir}`, 'SOURCE_DIR_NOT_FOUND', { sourceDir });
    }

    const backupDir = this.getBackupDir();
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    const target = outputPath || `${backupDir}/${this.generateBackupName()}`;

    const parentDir = dirname(target);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    try {
      await tar.create(
        {
          gzip: true,
          file: target,
          cwd: sourceDir,
        },
        ['.']
      );
    } catch (err) {
      throw new FileOperationError('create backup', target, err);
    }

    return target;
  }

  async extract(archivePath: string, targetDir: string): Promise<void> {
    if (!existsSync(archivePath)) {
      throw new FileOperationError('read backup', archivePath, new Error('File not found'));
    }
    if (!existsSync(targetDir)) {
      throw new AppError(`目标目录不存在: ${targetDir}`, 'TARGET_DIR_NOT_FOUND', { targetDir });
    }

    try {
      await tar.extract({
        file: archivePath,
        cwd: targetDir,
        filter: (entryPath: string, entry: tar.ReadEntry | Stats) => {
          const type = 'type' in entry ? entry.type : undefined;
          if (!validateTarEntry({ path: entryPath, type })) {
            throw new AppError(
              `备份包含非法条目: ${entryPath}（拒绝绝对路径、路径穿越或符号链接）`,
              BACKUP_TAR_FILTER_ERROR_CODE,
              { entryPath, type }
            );
          }
          return true;
        },
      });
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new FileOperationError('restore from backup', archivePath, err);
    }
  }

  list(): BackupEntry[] {
    const backupDir = this.getBackupDir();
    if (!existsSync(backupDir)) {
      return [];
    }

    try {
      const files = readdirSync(backupDir)
        .filter((f) => f.endsWith(BACKUP_EXTENSION))
        .map((f) => {
          const path = `${backupDir}/${f}`;
          const stats = existsSync(path) ? { mtime: statSync(path).mtime } : null;
          return {
            name: f,
            path,
            date: stats?.mtime || new Date(),
          };
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime());

      return files;
    } catch {
      return [];
    }
  }
}
