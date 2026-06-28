import { profileService } from '../services/profileService.js';
import { envPresenter, buildSwitchCommands } from '../presenters/envPresenter.js';
import { SwitchProfileInput, CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';
import { resolveOldEnv } from '../engine/activation.js';

export async function switchCommand(input: SwitchProfileInput, isTTY: boolean = process.stdout.isTTY): Promise<CommandResult> {
  return runCommand('切换配置', async () => {
    const currentProfileName = profileService.getCurrentProfile();
    const oldEnv = resolveOldEnv(profileService, currentProfileName, input.profileName);

    const profile = profileService.getProfile(input.profileName);

    if (input.dryRun) {
      return {
        success: true,
        output: `【dry-run】将切换配置 '${input.profileName}'\n环境变量: ${Object.keys(profile.env).join(', ')}`,
      };
    }

    profileService.setCurrentProfile(input.profileName);

    // 只通过 eval bridge 注入当前 shell（输出 export/unset 命令），
    // 不再写入 ~/.claude/settings.json。
    // 交互终端输出 banner；被 `eval "$(claude-profile switch xxx)"` 捕获时（非 TTY）
    // 输出纯 export/unset 命令，由 shell hook 的 safe_eval 注入。
    const output = isTTY
      ? envPresenter.formatSwitchSuccess(input.profileName, profile.env)
      : buildSwitchCommands(oldEnv, profile.env);

    return { success: true, output };
  });
}

export async function switchCommandInteractive(): Promise<CommandResult> {
  const { selectProfileFromList } = await import('../ui/prompt.js');

  const profiles = profileService.listProfiles();
  if (profiles.length === 0) {
    return { success: false, error: '没有可用的配置。请先使用 create 命令创建配置。' };
  }

  const currentProfile = profileService.getCurrentProfile();

  // 输出 banner
  console.log(envPresenter.formatBanner());

  // 如果只有一个配置且已是当前配置，无需操作
  if (profiles.length === 1 && profiles[0].name === currentProfile) {
    return switchCommand({ profileName: currentProfile });
  }

  const selectedName = await selectProfileFromList(profiles, currentProfile);

  if (!selectedName) {
    return { success: false, error: '已取消切换。', wasCancelled: true };
  }

  // Save old profile name for diff in export --current
  profileService.setPreviousProfile(currentProfile);

  return switchCommand({ profileName: selectedName });
}
