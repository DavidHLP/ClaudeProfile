import { profileService } from '../services/profileService.js';
import { CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';
import { maskValue } from '../utils/sensitiveKeys.js';

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

    // Shell env —— 唯一注入来源（通过 shell hook / eval bridge）
    const shellEnv: Record<string, string> = {};
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('ANTHROPIC_') || key.startsWith('CLAUDE_CODE_')) {
        shellEnv[key] = process.env[key] || '';
      }
    }
    lines.push('  Shell 环境变量 (注入来源):');
    if (Object.keys(shellEnv).length === 0) {
      lines.push('    无 ANTHROPIC_* / CLAUDE_CODE_* 变量');
    } else {
      for (const [key, value] of Object.entries(shellEnv)) {
        lines.push(`    ${key}=${maskValue(key, value) || '空'}`);
      }
    }
    lines.push('');

    return { success: true, output: lines.join('\n') };
  });
}
