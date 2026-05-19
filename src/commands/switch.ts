import { profileService } from '../services/profileService.js';
import { settingsSyncService } from '../services/settingsSyncService.js';
import { envPresenter, buildSwitchCommands } from '../presenters/envPresenter.js';
import { SwitchProfileInput, CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';
import { resolveOldEnv } from '../engine/activation.js';

export async function switchCommand(input: SwitchProfileInput, isTTY: boolean = process.stdout.isTTY): Promise<CommandResult> {
  return runCommand('切换配置', async () => {
    const currentProfileName = profileService.getCurrentProfile();
    const oldEnv = resolveOldEnv(profileService, currentProfileName, input.profileName);

    const profile = profileService.getProfile(input.profileName);
    profileService.setCurrentProfile(input.profileName);

    if (input.syncToSettings) {
      settingsSyncService.syncOnSwitch(oldEnv, profile.env);
    }

    if (isTTY) {
      return { success: true, output: envPresenter.formatSwitchSuccess(input.profileName, profile.env) };
    } else {
      return { success: true, output: buildSwitchCommands(oldEnv, profile.env) };
    }
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

  // 如果选择的就是当前配置，仅切换本地配置，不同步到 settings.json
  if (selectedName === currentProfile) {
    return switchCommand({ profileName: selectedName });
  }

  // Save old profile name for diff in export --current
  profileService.setPreviousProfile(currentProfile);

  return switchCommand({ profileName: selectedName });
}
