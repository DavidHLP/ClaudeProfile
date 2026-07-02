/**
 * Backup / Restore — thin command layer over the `BackupStore` port.
 *
 * The tarball knowledge, the security checks (path-traversal,
 * symlink rejection), the default backup directory, and the
 * timestamped filename generator all live in
 * `services/backupStore.ts` and its two adapters
 * (`FileSystemBackupStore` / `InMemoryBackupStore`). This file
 * contains zero tar-specific code; the command layer just calls
 * the port.
 *
 * `restoreCommandInteractive` uses `runSelectableAction` (the
 * generalization of `runProfileAction` introduced for the backup
 * flow) with `TSelected = string` and a custom `list` that reads
 * the backup list from the port. The deletion test for the
 * pre-port version of this command: it hand-rolled the
 * list → select → cancel sequence; with the seam in place, the
 * command is 10 lines and the cancel semantics are uniform with
 * the 7 other `*Interactive` commands.
 */
import { BackupConfigInput, RestoreConfigInput, CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';
import { runSelectableAction, CancelledError } from './interactiveSession.js';
import { AppError } from '../errors.js';
import type { CommandContext } from './context.js';

export async function backupCommand(ctx: CommandContext, input: BackupConfigInput): Promise<CommandResult> {
  return runCommand('备份配置', async () => {
    const storeLocation = ctx.profiles.getStoreLocation();
    if (!storeLocation) {
      throw new AppError('无法获取配置目录位置', 'CONFIG_DIR_NOT_FOUND');
    }
    const backupPath = await ctx.backup.create(storeLocation, input.outputPath);
    return { success: true, output: ctx.env.formatBackupSuccess(backupPath) };
  });
}

export async function restoreCommand(ctx: CommandContext, input: RestoreConfigInput): Promise<CommandResult> {
  return runCommand('恢复配置', async () => {
    if (!input.backupPath) {
      // No path → list backups and render them via the presenter's
      // dedicated list formatter. The interactive entry point
      // (`restoreCommandInteractive`) handles the user-driven
      // selection via `runSelectableAction`.
      const backups = ctx.backup.list();
      if (backups.length === 0) {
        return { success: false, error: '没有可用的备份' };
      }
      return { success: true, output: ctx.env.formatBackupList(backups) };
    }

    const storeLocation = ctx.profiles.getStoreLocation();
    if (!storeLocation) {
      throw new AppError('无法获取配置目录位置', 'CONFIG_DIR_NOT_FOUND');
    }
    await ctx.backup.extract(input.backupPath, storeLocation);
    return { success: true, output: ctx.env.formatRestoreSuccess(input.backupPath) };
  });
}

export async function restoreCommandInteractive(ctx: CommandContext, backupPath?: string): Promise<CommandResult> {
  // Direct path: skip the selection flow entirely.
  if (backupPath) {
    return restoreCommand(ctx, { backupPath });
  }

  // Empty-list short-circuit: don't even ask the user.
  const initialList = ctx.backup.list();
  if (initialList.length === 0) {
    return { success: false, error: '没有可用的备份' };
  }

  // Selectable flow: enumerates the backup list, prompts the user
  // to pick one, and delegates to `restoreCommand`. The list may
  // grow between the empty-check and the user's selection (e.g.
  // another process created a backup) — the runner handles that by
  // re-listing at the moment of selection.
  return runSelectableAction<string, RestoreConfigInput>(ctx, {
    verb: '恢复',
    emptyMessage: '没有可用的备份。',
    list: (c) => c.backup.list().map((b) => b.path),
    formatChoice: (path) => {
      const entry = ctx.backup.list().find((b) => b.path === path);
      const dateStr = entry ? entry.date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '';
      return dateStr ? `${path.split('/').pop()} - ${dateStr}` : path;
    },
    currentKey: () => null,
    confirm: (path) => `确定要从备份 '${path.split('/').pop()}' 恢复吗？\n${ctx.env.formatWarning('当前配置目录中的文件将被覆盖。')}`,
    buildInput: async (path) => ({ backupPath: path }),
    execute: restoreCommand,
  }).catch((err) => {
    if (err instanceof CancelledError) {
      return { success: false, error: '已取消恢复。', wasCancelled: true };
    }
    throw err;
  });
}
