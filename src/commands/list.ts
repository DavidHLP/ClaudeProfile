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
    // The header is owned by EnvPresenter.formatVerboseHeader (ADR-0005);
    // this command only supplies the data and the surrounding spacing.
    const detailBlocks = profiles.map((profile) =>
      ctx.env.formatProfileDetail(profile, profile.name === currentProfile)
    );
    const header = ctx.env.formatVerboseHeader({
      storeLocation: ctx.profiles.getStoreLocation(),
      currentProfile,
      profileCount: profiles.length,
    });

    return {
      success: true,
      // The extra '' between baseOutput and header preserves the
      // original blank-line spacing (3 newlines / 2 blank lines between
      // the table and 详细信息:).
      output: [baseOutput, '', '', header, '', ...detailBlocks].join('\n'),
    };
  });
}
