import { DuplicateProfileInput, CommandResult } from '../types/command.js';
import type { CommandContext } from './context.js';
import { runCommand } from './runner.js';
import { ProfileAlreadyExistsError } from '../errors.js';

export async function duplicateCommand(ctx: CommandContext, input: DuplicateProfileInput): Promise<CommandResult> {
  return runCommand('复制配置', async () => {
    // Get the source profile
    const sourceProfile = ctx.profiles.getProfile(input.sourceName);

    // Check if new name already exists
    if (ctx.profiles.profileExists(input.newName)) {
      throw new ProfileAlreadyExistsError(input.newName);
    }

    // Create new profile with new name but same env and description
    const newProfile = {
      name: input.newName,
      description: sourceProfile.description,
      env: { ...sourceProfile.env },
    };

    // Save new profile
    ctx.profiles.saveProfile(newProfile);

    return { success: true, output: ctx.env.formatDuplicateSuccess(input.sourceName, input.newName) };
  });
}

export async function duplicateCommandInteractive(ctx: CommandContext): Promise<CommandResult> {
  const profiles = ctx.profiles.listProfiles();
  if (profiles.length === 0) {
    return { success: false, error: '没有可复制的配置。' };
  }

  const currentProfile = ctx.profiles.getCurrentProfile();
  const selectedName = await ctx.prompts.selectProfileFromList(profiles, currentProfile);

  if (!selectedName) {
    return { success: false, error: '已取消复制。', wasCancelled: true };
  }

  const newName = await ctx.prompts.promptForNewName(selectedName + '-copy');
  if (!newName) {
    return { success: false, error: '已取消复制。', wasCancelled: true };
  }

  const confirmed = await ctx.prompts.confirmAction(`确定要复制配置 '${selectedName}' 到 '${newName}' 吗？`);
  if (!confirmed) {
    return { success: false, error: '已取消复制。', wasCancelled: true };
  }

  return duplicateCommand(ctx, { sourceName: selectedName, newName });
}
