import { RenameProfileInput, CommandResult } from '../types/command.js';
import type { CommandContext } from './context.js';
import { runCommand } from './runner.js';
import { ProfileAlreadyExistsError } from '../errors.js';

export async function renameCommand(ctx: CommandContext, input: RenameProfileInput): Promise<CommandResult> {
  return runCommand('重命名配置', async () => {
    // Get the old profile
    const oldProfile = ctx.profiles.getProfile(input.oldName);

    // Check if new name already exists
    if (ctx.profiles.profileExists(input.newName)) {
      throw new ProfileAlreadyExistsError(input.newName);
    }

    // Create new profile with new name but same env
    const newProfile = {
      name: input.newName,
      description: oldProfile.description,
      env: { ...oldProfile.env },
    };

    // Save new profile
    ctx.profiles.saveProfile(newProfile);

    // If this was the current profile, update the reference
    const currentProfile = ctx.profiles.getCurrentProfile();
    if (currentProfile === input.oldName) {
      ctx.profiles.setCurrentProfile(input.newName);
    }

    // Delete old profile
    ctx.profiles.deleteProfile(input.oldName);

    return { success: true, output: ctx.env.formatRenameSuccess(input.oldName, input.newName) };
  });
}

export async function renameCommandInteractive(ctx: CommandContext): Promise<CommandResult> {
  const profiles = ctx.profiles.listProfiles();
  if (profiles.length === 0) {
    return { success: false, error: '没有可重命名的配置。' };
  }

  const currentProfile = ctx.profiles.getCurrentProfile();
  const selectedName = await ctx.prompts.selectProfileFromList(profiles, currentProfile);

  if (!selectedName) {
    return { success: false, error: '已取消重命名。', wasCancelled: true };
  }

  const newName = await ctx.prompts.promptForNewName(selectedName);
  if (!newName) {
    return { success: false, error: '已取消重命名。', wasCancelled: true };
  }

  const confirmed = await ctx.prompts.confirmAction(`确定要将配置 '${selectedName}' 重命名为 '${newName}' 吗？`);
  if (!confirmed) {
    return { success: false, error: '已取消重命名。', wasCancelled: true };
  }

  return renameCommand(ctx, { oldName: selectedName, newName });
}
