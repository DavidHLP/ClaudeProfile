import { execSync } from 'child_process';
import { mkdirSync, existsSync, readdirSync } from 'fs';
import { dirname } from 'path';
import { profileService } from '../services/profileService.js';
import { envPresenter } from '../presenters/envPresenter.js';
import { BackupConfigInput, RestoreConfigInput, CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';
import { FileOperationError, AppError } from '../errors.js';

const BACKUP_DIR = '.claude-profile-backups';

function getBackupDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
  return `${homeDir}/${BACKUP_DIR}`;
}

function ensureBackupDir(): void {
  const dir = getBackupDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function generateBackupName(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `claude-profile-backup-${timestamp}.tar.gz`;
}

function createTarGz(sourceDir: string, targetPath: string): void {
  // Use tar command to create gzip compressed archive
  execSync(`tar -czf "${targetPath}" -C "${sourceDir}" .`, { stdio: 'pipe' });
}

function extractTarGz(sourcePath: string, targetDir: string): void {
  // Use tar command to extract gzip compressed archive
  execSync(`tar -xzf "${sourcePath}" -C "${targetDir}"`, { stdio: 'pipe' });
}

export async function backupCommand(input: BackupConfigInput): Promise<CommandResult> {
  return runCommand('备份配置', async () => {
    const storeLocation = profileService.getStoreLocation();
    if (!storeLocation) {
      throw new AppError('无法获取配置目录位置', 'CONFIG_DIR_NOT_FOUND');
    }

    ensureBackupDir();

    const backupName = generateBackupName();
    const backupDir = getBackupDir();
    const backupPath = input.outputPath || `${backupDir}/${backupName}`;

    // Ensure parent directory exists
    const parentDir = dirname(backupPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    try {
      // Create tar.gz archive of the config directory
      createTarGz(storeLocation, backupPath);
    } catch (err) {
      throw new FileOperationError('create backup', backupPath, err);
    }

    return { success: true, output: envPresenter.formatBackupSuccess(backupPath) };
  });
}

function listBackups(): { name: string; path: string; date: Date }[] {
  const backupDir = getBackupDir();

  if (!existsSync(backupDir)) {
    return [];
  }

  try {
    const files = readdirSync(backupDir)
      .filter(f => f.endsWith('.tar.gz'))
      .map(f => {
        const path = `${backupDir}/${f}`;
        const stats = existsSync(path) ? { mtime: new Date() } : null;
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

export async function restoreCommand(input: RestoreConfigInput): Promise<CommandResult> {
  return runCommand('恢复配置', async () => {
    if (input.backupPath) {
      // Restore from specific backup
      if (!existsSync(input.backupPath)) {
        throw new FileOperationError('read backup', input.backupPath, new Error('File not found'));
      }

      const storeLocation = profileService.getStoreLocation();
      if (!storeLocation) {
        throw new AppError('无法获取配置目录位置', 'CONFIG_DIR_NOT_FOUND');
      }

      try {
        extractTarGz(input.backupPath, storeLocation);
      } catch (err) {
        throw new FileOperationError('restore from backup', input.backupPath, err);
      }

      return { success: true, output: envPresenter.formatRestoreSuccess(input.backupPath) };
    }

    // List available backups for interactive selection
    const backups = listBackups();
    if (backups.length === 0) {
      return { success: false, error: '没有可用的备份' };
    }

    // Return list of backups for interactive selection
    return {
      success: true,
      output: envPresenter.formatBackupList(backups),
    };
  });
}

export async function restoreCommandInteractive(backupPath?: string): Promise<CommandResult> {
  if (backupPath) {
    return restoreCommand({ backupPath });
  }

  const backups = listBackups();
  if (backups.length === 0) {
    return { success: false, error: '没有可用的备份' };
  }

  const { selectBackup } = await import('../ui/prompt.js');
  const selected = await selectBackup(backups);

  if (!selected) {
    return { success: false, error: '已取消恢复。', wasCancelled: true };
  }

  return restoreCommand({ backupPath: selected });
}
