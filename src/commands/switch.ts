import { buildSwitchCommands } from '../engine/envDiff.js';
import { SwitchProfileInput, CommandResult } from '../types/command.js';
import { resolveOldEnv } from '../engine/activation.js';
import type { CommandContext } from './context.js';
import { runCommand } from './runner.js';

export async function switchCommand(ctx: CommandContext, input: SwitchProfileInput): Promise<CommandResult> {
  return runCommand('切换配置', async () => {
    const currentProfileName = ctx.profiles.getCurrentProfile();
    const oldEnv = resolveOldEnv(ctx.profiles, currentProfileName, input.profileName);

    const profile = ctx.profiles.getProfile(input.profileName);

    if (input.dryRun) {
      return {
        success: true,
        output: `【dry-run】将切换配置 '${input.profileName}'\n环境变量: ${Object.keys(profile.env).join(', ')}`,
      };
    }

    ctx.profiles.setCurrentProfile(input.profileName);

    // TTY → banner; non-TTY → pure `export`/`unset` lines for the
    // shell-hook's safe-eval bridge to inject into the current shell.
    const output = ctx.isTTY
      ? ctx.env.formatSwitchSuccess(input.profileName, profile.env)
      : buildSwitchCommands(oldEnv, profile.env);

    return { success: true, output };
  });
}

export async function switchCommandInteractive(ctx: CommandContext): Promise<CommandResult> {
  const profiles = ctx.profiles.listProfiles();
  if (profiles.length === 0) {
    return { success: false, error: '没有可用的配置。请先使用 create 命令创建配置。' };
  }

  const currentProfile = ctx.profiles.getCurrentProfile();

  // 输出 banner
  console.log(ctx.env.formatBanner());

  // 如果只有一个配置且已是当前配置，无需操作
  if (profiles.length === 1 && profiles[0].name === currentProfile) {
    return switchCommand(ctx, { profileName: currentProfile! });
  }

  const selectedName = await ctx.prompts.selectProfileFromList(profiles, currentProfile);

  if (!selectedName) {
    return { success: false, error: '已取消切换。', wasCancelled: true };
  }

  // Save old profile name for diff in export --current
  ctx.profiles.setPreviousProfile(currentProfile);

  return switchCommand(ctx, { profileName: selectedName });
}
