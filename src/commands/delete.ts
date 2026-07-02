import { DeleteProfileInput, CommandResult } from '../types/command.js';
import type { CommandContext } from './context.js';
import { runCommand } from './runner.js';

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
  const profiles = ctx.profiles.listProfiles();
  if (profiles.length === 0) {
    return { success: false, error: '没有可删除的配置。' };
  }

  const currentProfile = ctx.profiles.getCurrentProfile();
  const selectedName = await ctx.prompts.selectProfileFromList(profiles, currentProfile);

  if (!selectedName) {
    return { success: false, error: '已取消删除。', wasCancelled: true };
  }

  const isActive = selectedName === currentProfile;
  let confirmMessage = `确定要删除配置 '${selectedName}' 吗？`;
  if (isActive) {
    confirmMessage += `\n${ctx.env.formatWarning('这是当前激活的配置！')}`;
  }

  const confirmed = await ctx.prompts.confirmAction(confirmMessage);
  if (!confirmed) {
    return { success: false, error: '已取消删除。', wasCancelled: true };
  }

  return deleteCommand(ctx, { profileName: selectedName });
}
