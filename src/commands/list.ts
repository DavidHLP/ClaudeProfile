import { CommandResult } from '../types/command.js';
import type { CommandContext } from './context.js';
import { runCommand } from './runner.js';

export interface ListOptions {
  verbose?: boolean;
}

export async function listCommand(ctx: CommandContext, options: ListOptions = {}): Promise<CommandResult> {
  return runCommand('列出配置', async () => {
    const profiles = ctx.profiles.listProfiles();
    const currentProfile = ctx.profiles.getCurrentProfile();

    if (profiles.length === 0) {
      return { success: true, output: ctx.env.formatNoProfiles() };
    }

    const baseOutput = ctx.env.formatProfileList(profiles, currentProfile);

    if (!options.verbose) {
      return { success: true, output: baseOutput };
    }

    // Verbose mode: per-profile detail via the shared presenter so
    // list/validate stay in lock-step without duplicating field order.
    const detailBlocks = profiles.map((profile) =>
      ctx.env.formatProfileDetail(profile, profile.name === currentProfile)
    );

    const header = [
      '',
      '详细信息:',
      `  配置目录: ${ctx.profiles.getStoreLocation() || '未知'}`,
      `  当前配置: ${currentProfile || '无'}`,
      `  配置数量: ${profiles.length}`,
    ];

    return {
      success: true,
      output: [baseOutput, '', ...header, '', ...detailBlocks].join('\n'),
    };
  });
}
