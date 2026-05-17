import { EnvConfig, Profile } from '../types/index.js';

export interface EnvPresenter {
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
  formatProfileList(profiles: Profile[], currentProfile: string | null): string {
    const lines: string[] = [];
    lines.push(`配置列表 (共 ${profiles.length} 个)`);
    lines.push('');

    if (profiles.length === 0) {
      lines.push('  使用 env-switcher create 创建新配置');
      return lines.join('\n');
    }

    if (currentProfile) {
      lines.push(`当前: ${currentProfile}`);
    }

    for (const profile of profiles) {
      const isActive = profile.name === currentProfile;
      const marker = isActive ? ' * ' : '   ';
      lines.push(`${marker}${profile.name}`);
      lines.push(`    ${profile.description || 'N/A'}`);
    }

    return lines.join('\n');
  }

  formatCreateSuccess(profileName: string, _profilePath: string): string {
    return `✓ 配置 '${profileName}' 已创建`;
  }

  formatSwitchSuccess(profileName: string, _env: EnvConfig): string {
    return `switched to: ${profileName}`;
  }

  formatDeleteSuccess(profileName: string, wasActive: boolean): string {
    if (wasActive) {
      return `✓ 配置 '${profileName}' 已删除 (当前激活)`;
    }
    return `✓ 配置 '${profileName}' 已删除`;
  }

  formatEditSuccess(profileName: string): string {
    return `✓ 配置 '${profileName}' 已更新`;
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
