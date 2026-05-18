import { EnvConfig, Profile } from '../types/index.js';
import { EditableField, EDITABLE_FIELD_LABELS } from '../types/command.js';
import { theme, icon, padVisualEnd, box } from '../ui/theme.js';

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
  formatNoProfiles(): string;
  formatCancel(message: string): string;
}

export function buildExportCommands(env: EnvConfig): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (value) {
      lines.push(`export ${key}='${value}';`);
    }
  }
  return lines.join('\n');
}

export function buildSwitchCommands(oldEnv: EnvConfig | null, newEnv: EnvConfig): string {
  const lines: string[] = [];

  const oldKeys = new Set<string>();
  if (oldEnv) {
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value) {
        oldKeys.add(key);
      }
    }
  }

  const newKeys = new Set<string>();
  for (const [key, value] of Object.entries(newEnv)) {
    if (value) {
      newKeys.add(key);
    }
  }

  for (const key of oldKeys) {
    if (!newKeys.has(key)) {
      lines.push(`unset ${key};`);
    }
  }

  for (const [key, value] of Object.entries(newEnv)) {
    if (value) {
      lines.push(`export ${key}='${value}';`);
    }
  }

  return lines.join('\n');
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
      const apiKey = profile.env.ANTHROPIC_AUTH_TOKEN ? theme.dim('[ ***** ]') : theme.dim('[ UNSET ]');
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

  ${theme.dim('(环境变量已同步)')}
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

  formatNoProfiles(): string {
    return `没有可用的配置。请先使用 ${theme.info('claude-profile create')} 创建配置。`;
  }

  formatCancel(message: string): string {
    return message;
  }
}

export const envPresenter: EnvPresenter = new EnvPresenterImpl();
