import { profileService } from '../services/profileService.js';
import { envPresenter } from '../presenters/envPresenter.js';
import { DeleteProfileInput, CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';

export async function deleteCommand(input: DeleteProfileInput): Promise<CommandResult> {
  return runCommand('删除配置', async () => {
    const currentProfile = profileService.getCurrentProfile();
    const isActive = input.profileName === currentProfile;

    profileService.deleteProfile(input.profileName);

    return { success: true, output: envPresenter.formatDeleteSuccess(input.profileName, isActive) };
  });
}

export async function deleteCommandInteractive(): Promise<CommandResult> {
  const { selectExistingProfile, confirmAction } = await import('../ui/prompt.js');

  const profiles = profileService.listProfiles();
  if (profiles.length === 0) {
    return { success: false, error: '没有可删除的配置。' };
  }

  const currentProfile = profileService.getCurrentProfile();
  const selectedName = await selectExistingProfile(
    profiles.map((p) => p.name),
    currentProfile
  );

  if (!selectedName) {
    return { success: false, error: '已取消删除。', wasCancelled: true };
  }

  const isActive = selectedName === currentProfile;
  let confirmMessage = `确定要删除配置 '${selectedName}' 吗？`;
  if (isActive) {
    confirmMessage += '\n\x1b[33m警告: 这是当前激活的配置！\x1b[0m';
  }

  const confirmed = await confirmAction(confirmMessage);
  if (!confirmed) {
    return { success: false, error: '已取消删除。', wasCancelled: true };
  }

  return deleteCommand({ profileName: selectedName });
}
