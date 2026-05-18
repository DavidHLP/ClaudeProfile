import { profileService } from '../services/profileService.js';
import { envPresenter } from '../presenters/envPresenter.js';
import { DeleteProfileInput, CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';

export async function deleteCommand(input: DeleteProfileInput): Promise<CommandResult> {
  return runCommand('删除配置', async () => {
    const currentProfile = profileService.getCurrentProfile();
    const isActive = input.profileName === currentProfile;

    profileService.deleteProfile(input.profileName);

    // If yes flag is true, skip the active warning
    const showActiveWarning = isActive && !input.yes;

    return {
      success: true,
      output: envPresenter.formatDeleteSuccess(input.profileName, showActiveWarning),
    };
  });
}

export async function deleteCommandInteractive(): Promise<CommandResult> {
  const { selectProfileFromList, confirmAction } = await import('../ui/prompt.js');

  const profiles = profileService.listProfiles();
  if (profiles.length === 0) {
    return { success: false, error: '没有可删除的配置。' };
  }

  const currentProfile = profileService.getCurrentProfile();
  const selectedName = await selectProfileFromList(profiles, currentProfile);

  if (!selectedName) {
    return { success: false, error: '已取消删除。', wasCancelled: true };
  }

  const isActive = selectedName === currentProfile;
  let confirmMessage = `确定要删除配置 '${selectedName}' 吗？`;
  if (isActive) {
    confirmMessage += `\n${envPresenter.formatWarning('这是当前激活的配置！')}`;
  }

  const confirmed = await confirmAction(confirmMessage);
  if (!confirmed) {
    return { success: false, error: '已取消删除。', wasCancelled: true };
  }

  return deleteCommand({ profileName: selectedName });
}
