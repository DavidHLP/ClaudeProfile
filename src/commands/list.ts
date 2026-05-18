import { profileService } from '../services/profileService.js';
import { envPresenter } from '../presenters/envPresenter.js';
import { CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';

export interface ListOptions {
  verbose?: boolean;
}

export async function listCommand(options: ListOptions = {}): Promise<CommandResult> {
  return runCommand('列出配置', async () => {
    const profiles = profileService.listProfiles();
    const currentProfile = profileService.getCurrentProfile();

    if (profiles.length === 0) {
      return { success: true, output: envPresenter.formatNoProfiles() };
    }

    const baseOutput = envPresenter.formatProfileList(profiles, currentProfile);

    if (!options.verbose) {
      return { success: true, output: baseOutput };
    }

    // Verbose mode: add detailed information
    const verboseLines: string[] = [baseOutput, ''];
    verboseLines.push('详细信息:');
    verboseLines.push(`  配置目录: ${profileService.getStoreLocation() || '未知'}`);
    verboseLines.push(`  当前配置: ${currentProfile || '无'}`);
    verboseLines.push(`  配置数量: ${profiles.length}`);

    for (const profile of profiles) {
      const isCurrent = profile.name === currentProfile;
      verboseLines.push('');
      verboseLines.push(`  ${isCurrent ? '→ ' : '  '}${profile.name} (${profile.description || '无描述'}):`);
      verboseLines.push(`    BASE URL: ${profile.env.ANTHROPIC_BASE_URL || '未设置'}`);
      verboseLines.push(`    TOKEN: ${profile.env.ANTHROPIC_AUTH_TOKEN ? '已设置' : '未设置'}`);
      verboseLines.push(`    MODEL: ${profile.env.ANTHROPIC_MODEL || '未设置'}`);
      verboseLines.push(`    SONNET: ${profile.env.ANTHROPIC_DEFAULT_SONNET_MODEL || '未设置'}`);
      verboseLines.push(`    OPUS: ${profile.env.ANTHROPIC_DEFAULT_OPUS_MODEL || '未设置'}`);
      verboseLines.push(`    HAIKU: ${profile.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '未设置'}`);
    }

    return { success: true, output: verboseLines.join('\n') };
  });
}
