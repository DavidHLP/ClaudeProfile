import { DuplicateProfileInput, CommandResult } from '../types/command.js';
import type { CommandContext } from './context.js';
import { runCommand } from './runner.js';
import { runProfileAction, CancelledError } from './interactiveSession.js';
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
  return runProfileAction<DuplicateProfileInput>(ctx, {
    verb: '复制',
    emptyMessage: '没有可复制的配置。',
    confirm: (selected, input) => `确定要复制配置 '${selected.name}' 到 '${input.newName}' 吗？`,
    buildInput: async (selected, ctx) => {
      const newName = await ctx.prompts.promptForNewName(selected.name + '-copy');
      if (!newName) {
        throw new CancelledError('复制');
      }
      return { sourceName: selected.name, newName };
    },
    execute: duplicateCommand,
  });
}
