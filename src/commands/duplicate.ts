import { DuplicateProfileInput, CommandResult } from '../types/command.js';
import type { CommandContext } from './context.js';
import { runCommand } from './runner.js';
import { runProfileAction, CancelledError } from './interactiveSession.js';

export async function duplicateCommand(ctx: CommandContext, input: DuplicateProfileInput): Promise<CommandResult> {
  return runCommand('复制配置', async () => {
    // The whole command is now a single delegation to the
    // `cloneProfile` seam (ADR-0012). The existence check, the env
    // spread, and the description copy are no longer the command's
    // problem — they live on the service.
    ctx.profiles.cloneProfile(input.sourceName, input.newName);

    return { success: true, output: ctx.env.formatDuplicateSuccess(input.sourceName, input.newName) };
  });
}

export async function duplicateCommandInteractive(ctx: CommandContext): Promise<CommandResult> {
  return runProfileAction(ctx, {
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
