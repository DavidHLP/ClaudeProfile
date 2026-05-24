import { profileService } from '../services/profileService.js';
import { CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';
import { ClaudeSettingsStoreImpl, isValidSettingsScope } from '../config/claudeSettingsStore.js';
import { maskValue } from '../utils/sensitiveKeys.js';

function readSettingsEnv(scope: string): Record<string, string> {
  if (!isValidSettingsScope(scope)) {
    return {};
  }
  const store = new ClaudeSettingsStoreImpl(scope);
  return store.readEnv();
}

export async function statusCommand(): Promise<CommandResult> {
  return runCommand('状态查询', async () => {
    const currentProfile = profileService.getCurrentProfile();
    const storeLocation = profileService.getStoreLocation();
    const profiles = profileService.listProfiles();

    const lines: string[] = [];
    lines.push('');
    lines.push('  当前状态');
    lines.push('');
    lines.push(`  当前配置: ${currentProfile || '无'}`);
    lines.push(`  配置目录: ${storeLocation || '未知'}`);
    lines.push(`  配置数量: ${profiles.length}`);
    lines.push('');

    // Shell env
    const shellEnv: Record<string, string> = {};
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('ANTHROPIC_') || key.startsWith('CLAUDE_CODE_')) {
        shellEnv[key] = process.env[key] || '';
      }
    }
    lines.push('  Shell 环境变量:');
    if (Object.keys(shellEnv).length === 0) {
      lines.push('    无 ANTHROPIC_* / CLAUDE_CODE_* 变量');
    } else {
      for (const [key, value] of Object.entries(shellEnv)) {
        lines.push(`    ${key}=${maskValue(key, value) || '空'}`);
      }
    }
    lines.push('');

    // Settings.json scopes
    for (const scope of ['user', 'project', 'local']) {
      const env = readSettingsEnv(scope);
      const keys = Object.keys(env).filter(k => k.startsWith('ANTHROPIC_') || k.startsWith('CLAUDE_CODE_'));
      lines.push(`  settings.json (${scope}): ${keys.length} 个变量`);
      for (const key of keys) {
        lines.push(`    ${key}=${env[key] ? '***' : '空'}`);
      }
    }
    lines.push('');

    return { success: true, output: lines.join('\n') };
  });
}
