import { DeleteProfileInput, CommandResult } from '../types/command.js';
import type { CommandContext } from './context.js';
import { runCommand } from './runner.js';
import { runSelectableAction } from './interactiveSession.js';

export async function deleteCommand(ctx: CommandContext, input: DeleteProfileInput): Promise<CommandResult> {
  return runCommand('删除配置', async () => {
    const currentProfile = ctx.profiles.getCurrentProfile();
    const isActive = input.profileName === currentProfile;

    ctx.profiles.deleteProfile(input.profileName);

    // If yes flag is true, skip the active warning
    const showActiveWarning = isActive && !input.yes;

    return {
      success: true,
      output: ctx.env.formatDeleteSuccess(input.profileName, showActiveWarning),
    };
  });
}

export async function deleteCommandInteractive(ctx: CommandContext): Promise<CommandResult> {
  return runSelectableAction(ctx, {
    verb: '删除',
    emptyMessage: '没有可删除的配置。',
    list: (c) => c.profiles.listProfiles(),
    currentKey: (c) => c.profiles.getCurrentProfile(),
    confirm: (selected) => {
      const base = `确定要删除配置 '${selected.name}' 吗？`;
      if (selected.name === ctx.profiles.getCurrentProfile()) {
        return `${base}\n${ctx.env.formatWarning('这是当前激活的配置！')}`;
      }
      return base;
    },
    buildInput: async (selected) => ({ profileName: selected.name }),
    execute: deleteCommand,
  });
}
