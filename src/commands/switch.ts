import { profileService } from '../services/profileService.js';
import { envPresenter } from '../presenters/envPresenter.js';
import { SwitchProfileInput, CommandResult } from '../types/command.js';
import { AppError } from '../errors.js';

export async function switchCommand(input: SwitchProfileInput, isTTY: boolean = process.stdout.isTTY): Promise<CommandResult> {
  try {
    let oldEnv = null;
    try {
      const currentProfileName = profileService.getCurrentProfile();
      if (currentProfileName && currentProfileName !== input.profileName) {
        const oldProfile = profileService.getProfile(currentProfileName);
        oldEnv = oldProfile.env;
      }
    } catch {
      // Old profile not found or unreadable; skip cleanup diff
    }

    const profile = profileService.getProfile(input.profileName);
    profileService.setCurrentProfile(input.profileName);

    if (isTTY) {
      return { success: true, output: envPresenter.formatSwitchSuccess(input.profileName, profile.env) };
    } else {
      return { success: true, output: envPresenter.buildSwitchCommands(oldEnv, profile.env) };
    }
  } catch (err) {
    if (err instanceof AppError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: `切换配置失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function switchCommandInteractive(): Promise<CommandResult> {
  const { selectExistingProfile, confirmAction } = await import('../ui/prompt.js');

  const profiles = profileService.listProfiles();
  if (profiles.length === 0) {
    return { success: false, error: '没有可用的配置。请先使用 create 命令创建配置。' };
  }

  const currentProfile = profileService.getCurrentProfile();

  // 如果只有一个配置且已是当前配置，无需切换
  if (profiles.length === 1 && profiles[0].name === currentProfile) {
    return {
      success: true,
      output: `已是当前配置: ${currentProfile}，无需切换。`,
    };
  }

  const selectedName = await selectExistingProfile(
    profiles.map((p) => p.name),
    currentProfile
  );

  if (!selectedName) {
    return { success: false, error: '已取消切换。', wasCancelled: true };
  }

  // 如果选择的就是当前配置，无需切换
  if (selectedName === currentProfile) {
    return {
      success: true,
      output: `已是当前配置: ${currentProfile}，无需切换。`,
    };
  }

  // Save old profile name for diff in export --current
  profileService.setPreviousProfile(currentProfile);

  return switchCommand({ profileName: selectedName });
}
