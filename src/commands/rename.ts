import { RenameProfileInput, CommandResult } from '../types/command.js';
import type { CommandContext } from './context.js';
import { runCommand } from './runner.js';
import { runProfileAction, CancelledError } from './interactiveSession.js';
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
  return runProfileAction<RenameProfileInput>(ctx, {
    verb: '重命名',
    emptyMessage: '没有可重命名的配置。',
    confirm: (selected, input) => `确定要将配置 '${selected.name}' 重命名为 '${input.newName}' 吗？`,
    buildInput: async (selected, ctx) => {
      const newName = await ctx.prompts.promptForNewName(selected.name);
      if (!newName) {
        throw new CancelledError('重命名');
      }
      return { oldName: selected.name, newName };
    },
    execute: renameCommand,
  });
}
