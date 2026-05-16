import { EnvConfig, Profile } from '../types/index.js';

export interface EnvPresenter {
  buildExportCommands(env: EnvConfig): string;
  buildSwitchCommands(oldEnv: EnvConfig | null, newEnv: EnvConfig): string;
  formatProfileList(profiles: Profile[], currentProfile: string | null): string;
  formatCreateSuccess(profileName: string, profilePath: string): string;
  formatSwitchSuccess(profileName: string, env: EnvConfig): string;
  formatDeleteSuccess(profileName: string, wasActive: boolean): string;
  formatEditSuccess(profileName: string): string;
  formatError(message: string): string;
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
  buildExportCommands(env: EnvConfig): string {
    return buildExportCommands(env);
  }

  buildSwitchCommands(oldEnv: EnvConfig | null, newEnv: EnvConfig): string {
    return buildSwitchCommands(oldEnv, newEnv);
  }

  formatProfileList(profiles: Profile[], currentProfile: string | null): string {
    const lines: string[] = [];
    lines.push('\x1b[34m=== Claude Code 环境配置 ===\x1b[0m');
    lines.push('');

    if (profiles.length === 0) {
      lines.push('  (无配置文件)');
      lines.push('');
      lines.push('使用 \x1b[36menv-switcher create\x1b[0m 创建新配置');
      return lines.join('\n');
    }

    lines.push(`\x1b[32m当前配置: ${currentProfile || '未设置'}\x1b[0m`);
    lines.push('');
    lines.push('可用配置:');
    lines.push('');

    for (const profile of profiles) {
      const isActive = profile.name === currentProfile;
      const marker = isActive ? ' \x1b[32m*\x1b[0m ' : '   ';
      lines.push(`${marker}\x1b[1m${profile.name}\x1b[0m`);
      lines.push(`    描述: ${profile.description}`);
      lines.push(`    URL: ${profile.env.ANTHROPIC_BASE_URL}`);
      lines.push(`    模型: ${profile.env.ANTHROPIC_MODEL}`);
      lines.push('');
    }

    lines.push(`共 ${profiles.length} 个配置`);
    lines.push('');
    lines.push('提示:');
    lines.push('  \x1b[36menv-switcher switch\x1b[0m - 切换到其他配置');
    lines.push('  \x1b[36menv-switcher edit\x1b[0m  - 编辑配置');
    lines.push('  \x1b[36menv-switcher delete\x1b[0m - 删除配置');

    return lines.join('\n');
  }

  formatCreateSuccess(profileName: string, profilePath: string): string {
    return [
      '',
      `\x1b[32m✓\x1b[0m 配置 '${profileName}' 已创建`,
      `  路径: ${profilePath}`,
      '',
      '\x1b[33m提示:\x1b[0m 运行 \x1b[36menv-switcher switch\x1b[0m 来激活此配置',
    ].join('\n');
  }

  formatSwitchSuccess(profileName: string, env: EnvConfig): string {
    const exportCmd = buildExportCommands(env);
    return [
      '',
      `\x1b[32m✓\x1b[0m 已切换到配置: \x1b[1m${profileName}\x1b[0m`,
      '',
      '\x1b[33m请在当前终端运行以下命令来应用环境变量:\x1b[0m',
      '',
      '\x1b[36m' + exportCmd + '\x1b[0m',
      '',
      '或使用以下快捷方式:',
      '',
      `\x1b[36m  eval $(env-switcher switch ${profileName})\x1b[0m`,
    ].join('\n');
  }

  formatDeleteSuccess(profileName: string, wasActive: boolean): string {
    const lines: string[] = [];
    lines.push('');
    lines.push(`\x1b[32m✓\x1b[0m 配置 '${profileName}' 已删除`);
    if (wasActive) {
      lines.push('\x1b[33m注意:\x1b[0m 您删除了当前激活的配置，请运行 \x1b[36menv-switcher switch\x1b[0m 选择新配置');
    }
    return lines.join('\n');
  }

  formatEditSuccess(profileName: string): string {
    return [
      '',
      `\x1b[32m✓\x1b[0m 配置 '${profileName}' 已更新`,
      '',
      `\x1b[33m提示:\x1b[0m 如果此配置已激活，重新运行 \x1b[36menv-switcher switch\x1b[0m 来应用新配置`,
    ].join('\n');
  }

  formatError(message: string): string {
    return `\x1b[31m错误:\x1b[0m ${message}`;
  }

  formatNoProfiles(): string {
    return '没有可用的配置。请先使用 \x1b[36menv-switcher create\x1b[0m 创建配置。';
  }

  formatCancel(message: string): string {
    return message;
  }
}

export const envPresenter: EnvPresenter = new EnvPresenterImpl();
