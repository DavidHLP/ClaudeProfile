import { RenameProfileInput, CommandResult } from '../types/command.js';
import type { CommandContext } from './context.js';
import { runCommand } from './runner.js';
import { runProfileAction, CancelledError } from './interactiveSession.js';

export async function renameCommand(ctx: CommandContext, input: RenameProfileInput): Promise<CommandResult> {
  return runCommand('重命名配置', async () => {
    // The "derive a new profile from an existing one" core lives on
    // the service (`cloneProfile` — see ADR-0012). Rename-specific
    // concerns — re-pointing the active marker, deleting the source —
    // stay here because they are not part of "what does a clone do".
    ctx.profiles.cloneProfile(input.oldName, input.newName);

    if (ctx.profiles.getCurrentProfile() === input.oldName) {
      ctx.profiles.setCurrentProfile(input.newName);
    }

    ctx.profiles.deleteProfile(input.oldName);

    return { success: true, output: ctx.env.formatRenameSuccess(input.oldName, input.newName) };
  });
}

export async function renameCommandInteractive(ctx: CommandContext): Promise<CommandResult> {
  return runProfileAction(ctx, {
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
