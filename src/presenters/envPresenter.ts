import { EnvConfig, Profile } from '../types/index.js';

// ANSI style constants
const styles = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// Style helper functions
const s = (style: string, text: string): string => `${style}${text}${styles.reset}`;
const bold = (text: string): string => s(styles.bold, text);
const green = (text: string): string => s(styles.green, text);
const dim = (text: string): string => s(styles.dim, text);

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function padVisualEnd(text: string, targetWidth: number): string {
  const visualLen = stripAnsi(text).length;
  const padding = Math.max(0, targetWidth - visualLen);
  return text + ' '.repeat(padding);
}

export interface EnvPresenter {
  formatBanner(): string;
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
  formatBanner(): string {
    return `+----------------------------------+
|       ENV-SWITCHER               |
+----------------------------------+`;
  }

  formatProfileList(profiles: Profile[], currentProfile: string | null): string {
    const lines: string[] = [];

    if (profiles.length === 0) {
      lines.push('');
      lines.push(`  ${dim('(no profiles available, use env-switcher create to add one)')}`);
      return lines.join('\n');
    }

    const profileWidth = Math.max(
      'PROFILE'.length,
      ...profiles.map(p => p.name.length + 2)
    );
    const providerWidth = Math.max(
      'PROVIDER'.length,
      ...profiles.map(p => (p.description || 'Unknown').length)
    );
    const statusWidth = Math.max(
      'STATUS'.length,
      'ACTIVE'.length,
      'Standby'.length
    );
    const apiKeyWidth = Math.max(
      'API KEY'.length,
      '[ ***** ]'.length,
      '[ UNSET ]'.length
    );

    const divider = '  ' + '─'.repeat(profileWidth) + '  ' + '─'.repeat(providerWidth) + '  ' + '─'.repeat(statusWidth) + '  ' + '─'.repeat(apiKeyWidth);

    lines.push(`  ENV-SWITCHER WORKSPACE CONFIGURATION`);
    lines.push('');
    lines.push(`  ${padVisualEnd(bold('PROFILE'), profileWidth)}  ${padVisualEnd(bold('PROVIDER'), providerWidth)}  ${padVisualEnd(bold('STATUS'), statusWidth)}  ${bold('API KEY')}`);
    lines.push(divider);

    for (const profile of profiles) {
      const isActive = profile.name === currentProfile;
      const status = isActive ? green('ACTIVE') : dim('Standby');
      const apiKey = profile.env.ANTHROPIC_AUTH_TOKEN ? dim('[ ***** ]') : dim('[ UNSET ]');
      const provider = profile.description || 'Unknown';

      const marker = isActive ? green('>') : ' ';
      const name = isActive ? bold(profile.name) : profile.name;

      lines.push(`  ${padVisualEnd(`${marker} ${name}`, profileWidth)}  ${padVisualEnd(provider, providerWidth)}  ${padVisualEnd(status, statusWidth)}  ${apiKey}`);
    }

    lines.push(divider);

    return lines.join('\n');
  }

  formatCreateSuccess(profileName: string, _profilePath: string): string {
    return `${green('✓')} 配置 '${profileName}' 已创建`;
  }

  formatSwitchSuccess(profileName: string, _env: EnvConfig): string {
    return `
  >> switched to: ${bold(green(profileName))}

  ${dim('(environment variables synced)')}
`;
  }

  formatDeleteSuccess(profileName: string, wasActive: boolean): string {
    if (wasActive) {
      return `${green('✓')} 配置 '${profileName}' 已删除 ${dim('(当前激活)')}`;
    }
    return `${green('✓')} 配置 '${profileName}' 已删除`;
  }

  formatEditSuccess(profileName: string): string {
    return `${green('✓')} 配置 '${profileName}' 已更新`;
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
