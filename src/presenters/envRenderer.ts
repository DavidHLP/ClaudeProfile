/**
 * Env renderer — human-facing ANSI/text formatting for CLI output.
 *
 * Owns all TTY-bound output for the CLI. Everything that produces colored
 * text, banners, success/warning lines, and table-style profile lists lives
 * here. The 19 `format*` methods share a single purpose: present state to a
 * human at a terminal.
 *
 * Pure-data env transformation (machine-facing) lives in `engine/envDiff.ts`.
 */
import { EnvConfig, Profile } from '../types/index.js';
import { EditableField, EDITABLE_FIELD_LABELS } from '../types/command.js';
import { theme, icon, padVisualEnd, box } from '../ui/theme.js';
import { profileDetailRows, maskProfileValue, formatFieldDisplayValue } from '../domain/profileSchema.js';

export interface EnvPresenter {
  formatBanner(): string;
  formatProfileList(profiles: Profile[], currentProfile: string | null): string;
  formatCreateSuccess(profileName: string, profilePath: string): string;
  formatSwitchSuccess(profileName: string, env: EnvConfig): string;
  formatDeleteSuccess(profileName: string, wasActive: boolean): string;
  formatEditSuccess(profileName: string, field?: EditableField): string;
  formatRenameSuccess(oldName: string, newName: string): string;
  formatDuplicateSuccess(sourceName: string, newName: string): string;
  formatImportSuccess(profileName: string, filePath: string): string;
  formatExportSuccess(profileName: string, filePath: string): string;
  formatBackupSuccess(backupPath: string): string;
  formatRestoreSuccess(backupPath: string): string;
  formatBackupList(backups: { name: string; path: string; date: Date }[]): string;
  formatError(message: string): string;
  formatWarning(message: string): string;
  formatProfileDetail(profile: Profile, isCurrent: boolean): string;
  formatNoProfiles(): string;
  formatCancel(message: string): string;
  /**
   * Render the 5-line "verbose context" header that `listCommand` and
   * `validateCommand` both emit when the user passes `--verbose`. The
   * shape is stable across commands; the data (`storeLocation`,
   * `currentProfile`, `profileCount`) is supplied by the caller.
   *
   * The returned string is the 5 lines joined with `\n`, with **no**
   * leading or trailing newline. Callers are responsible for the
   * surrounding whitespace — `listCommand` joins with `''` separators,
   * `validateCommand` joins with `'\n'` — so the seam stays neutral
   * and the command can produce its own spacing context.
   *
   * Why this exists: before this seam, the 5-line `['', '详细信息:',
   *   '  配置目录: …', '  当前配置: …', '  配置数量: …']` array was
   * copy-pasted across `listCommand` and the three verbose branches of
   * `validateCommand`. The "where am I looking" header is conceptually
   * one fact; the deletion test confirms it: remove the seam and the
   * 5-line block reappears across 4 sites within a few lines of edit.
   */
  formatVerboseHeader(input: {
    storeLocation: string | null;
    currentProfile: string | null;
    profileCount: number;
  }): string;
  /**
   * Render a list of profile-attached validation issues as the
   * "❌ 发现 N 个错误 / ⚠️ 发现 N 个警告" block that `validateCommand`
   * emits. Issues are split by severity; the inner bullet line
   * (`• [profile] envKey: message`) is the same shape for both
   * severities.
   *
   * Accepts the display-shaped issue (with `profile` attached) rather
   * than the schema's profile-free `ValidationIssue`, so the seam
   * stays honest about what it needs: `profile`, `envKey`, `message`,
   * `severity`. The `field` info is unused by the presenter (the
   * message already embeds the env key).
   *
   * Returns `''` when `issues` is empty — the caller no longer has to
   * guard against the no-issues case.
   */
  formatValidationIssues(
    issues: ReadonlyArray<{
      readonly profile: string;
      readonly envKey: string;
      readonly message: string;
      readonly severity: 'error' | 'warning';
    }>
  ): string;
}

class EnvPresenterImpl implements EnvPresenter {
  formatBanner(): string {
    const title = '环境切换器';
    const innerWidth = 30;
    const titlePad = Math.max(0, innerWidth - title.length);
    const padLeft = Math.floor(titlePad / 2);
    const padRight = titlePad - padLeft;
    return `${box.tl}${box.h.repeat(innerWidth + 2)}${box.tr}
${box.v}${' '.repeat(padLeft + 1)}${theme.bold(title)}${' '.repeat(padRight + 1)}${box.v}
${box.bl}${box.h.repeat(innerWidth + 2)}${box.br}`;
  }

  formatProfileList(profiles: Profile[], currentProfile: string | null): string {
    const lines: string[] = [];

    if (profiles.length === 0) {
      lines.push('');
      lines.push(`  ${theme.dim('(没有可用的配置，请使用 claude-profile create 添加)')}`);
      return lines.join('\n');
    }

    const profileWidth = Math.max(
      'PROFILE'.length,
      ...profiles.map(p => p.name.length + 2),
    );
    const providerWidth = Math.max(
      'PROVIDER'.length,
      ...profiles.map(p => (p.description || 'Unknown').length),
    );
    const statusWidth = Math.max(
      'STATUS'.length,
      '已激活'.length,
      '待命'.length,
    );
    const apiKeyWidth = Math.max(
      'API KEY'.length,
      '[ ***** ]'.length,
      '[ UNSET ]'.length,
    );

    const innerWidth = profileWidth + providerWidth + statusWidth + apiKeyWidth + 6;
    const topLine = `  ${box.tl}${box.h.repeat(innerWidth)}${box.tr}`;
    const headerLine = `  ${box.v} ${padVisualEnd(theme.bold('PROFILE'), profileWidth)} ${padVisualEnd(theme.bold('PROVIDER'), providerWidth)} ${padVisualEnd(theme.bold('STATUS'), statusWidth)} ${theme.bold('API KEY')} ${box.v}`;
    const sepLine = `  ${box.lj}${box.h.repeat(innerWidth)}${box.rj}`;

    lines.push('');
    lines.push(topLine);
    lines.push(headerLine);
    lines.push(sepLine);

    for (const profile of profiles) {
      const isActive = profile.name === currentProfile;
      const status = isActive ? theme.active('已激活') : theme.standby('待命');
      const apiKey = theme.dim(formatFieldDisplayValue(profile.env, 'token', {
      setMarker: '[ ***** ]',
      unsetMarker: '[ UNSET ]',
    }));
      const provider = profile.description || 'Unknown';

      const marker = isActive ? icon.active : icon.standby;
      const name = isActive ? theme.bold(profile.name) : profile.name;

      lines.push(`  ${box.v} ${padVisualEnd(`${marker} ${name}`, profileWidth)} ${padVisualEnd(provider, providerWidth)} ${padVisualEnd(status, statusWidth)} ${apiKey} ${box.v}`);
    }

    const bottomLine = `  ${box.bl}${box.h.repeat(innerWidth)}${box.br}`;
    lines.push(bottomLine);
    lines.push('');

    return lines.join('\n');
  }

  formatCreateSuccess(profileName: string, _profilePath: string): string {
    return `${icon.success} 配置 '${profileName}' 已创建`;
  }

  formatSwitchSuccess(profileName: string, _env: EnvConfig): string {
    return `
  ${icon.arrow} 已切换到: ${theme.active(profileName)}

  ${theme.dim('(环境变量已注入当前 shell)')}
`;
  }

  formatDeleteSuccess(profileName: string, wasActive: boolean): string {
    if (wasActive) {
      return `${icon.success} 配置 '${profileName}' 已删除 ${theme.dim('(当前激活)')}`;
    }
    return `${icon.success} 配置 '${profileName}' 已删除`;
  }

  formatEditSuccess(profileName: string, field?: EditableField): string {
    if (!field) {
      return `${icon.success} 配置 '${profileName}' 已更新`;
    }
    return `${icon.success} 已更新 ${theme.bold(profileName)} 的 ${theme.info(EDITABLE_FIELD_LABELS[field])}`;
  }

  formatRenameSuccess(oldName: string, newName: string): string {
    return `${icon.success} 配置 '${oldName}' 已重命名为 '${newName}'`;
  }

  formatDuplicateSuccess(sourceName: string, newName: string): string {
    return `${icon.success} 配置 '${sourceName}' 已复制到 '${newName}'`;
  }

  formatImportSuccess(profileName: string, filePath: string): string {
    return `${icon.success} 配置 '${profileName}' 已从 '${filePath}' 导入`;
  }

  formatExportSuccess(profileName: string, filePath: string): string {
    return `${icon.success} 配置 '${profileName}' 已导出到 '${filePath}'`;
  }

  formatBackupSuccess(backupPath: string): string {
    return `${icon.success} 备份已创建: ${theme.info(backupPath)}`;
  }

  formatRestoreSuccess(backupPath: string): string {
    return `${icon.success} 配置已从 '${backupPath}' 恢复`;
  }

  formatBackupList(backups: { name: string; path: string; date: Date }[]): string {
    const lines: string[] = [];
    lines.push('');
    lines.push('  可用的备份:');
    lines.push('');
    for (const backup of backups) {
      const dateStr = backup.date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      lines.push(`  ${theme.info(backup.name)} - ${theme.dim(dateStr)}`);
    }
    lines.push('');
    return lines.join('\n');
  }

  formatError(message: string): string {
    return `${theme.error('错误:')} ${message}`;
  }

  formatWarning(message: string): string {
    return `${theme.warning('警告:')} ${message}`;
  }

  formatProfileDetail(profile: Profile, isCurrent: boolean): string {
    const marker = isCurrent ? icon.active : icon.standby;
    const nameLine = `  ${marker} ${isCurrent ? theme.bold(profile.name) : profile.name} (${profile.description || '无描述'})`;
    // The 6 detail rows are derived from the profile schema, so the
    // order, the short labels, and the "sensitive → 已设置" convention
    // live in exactly one place. `maskProfileValue` enforces the
    // mask policy for the token row.
    const rows = profileDetailRows(profile.env, maskProfileValue);
    const lines: string[] = [nameLine];
    for (const row of rows) {
      lines.push(`    ${theme.dim(row.shortLabel + ':')} ${row.displayValue}`);
    }
    return lines.join('\n');
  }

  formatNoProfiles(): string {
    return `没有可用的配置。请先使用 ${theme.info('claude-profile create')} 创建配置。`;
  }

  formatCancel(message: string): string {
    return message;
  }

  formatVerboseHeader(input: {
    storeLocation: string | null;
    currentProfile: string | null;
    profileCount: number;
  }): string {
    // Stable 5-line shape; the data is supplied by the caller. No
    // leading/trailing newlines — the caller composes spacing.
    return [
      '详细信息:',
      `  配置目录: ${input.storeLocation || '未知'}`,
      `  当前配置: ${input.currentProfile || '无'}`,
      `  配置数量: ${input.profileCount}`,
    ].join('\n');
  }

  formatValidationIssues(
    issues: ReadonlyArray<{
      readonly profile: string;
      readonly envKey: string;
      readonly message: string;
      readonly severity: 'error' | 'warning';
    }>
  ): string {
    if (issues.length === 0) {
      return '';
    }
    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');
    const blocks: string[] = [];
    if (errors.length > 0) {
      blocks.push(`❌ 发现 ${errors.length} 个错误:`);
      for (const issue of errors) {
        blocks.push(`  • [${issue.profile}] ${issue.envKey}: ${issue.message}`);
      }
    }
    if (warnings.length > 0) {
      blocks.push(`⚠️  发现 ${warnings.length} 个警告:`);
      for (const issue of warnings) {
        blocks.push(`  • [${issue.profile}] ${issue.envKey}: ${issue.message}`);
      }
    }
    return blocks.join('\n');
  }
}

export const envPresenter: EnvPresenter = new EnvPresenterImpl();
