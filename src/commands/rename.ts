import { profileService } from '../services/profileService.js';
import { envPresenter } from '../presenters/envPresenter.js';
import { RenameProfileInput, CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';
import { ProfileAlreadyExistsError } from '../errors.js';

export async function renameCommand(input: RenameProfileInput): Promise<CommandResult> {
  return runCommand('重命名配置', async () => {
    // Get the old profile
    const oldProfile = profileService.getProfile(input.oldName);

    // Check if new name already exists
    if (profileService.profileExists(input.newName)) {
      throw new ProfileAlreadyExistsError(input.newName);
    }

    // Create new profile with new name but same env
    const newProfile = {
      name: input.newName,
      description: oldProfile.description,
      env: { ...oldProfile.env },
    };

    // Save new profile
    profileService.saveProfile(newProfile);

    // If this was the current profile, update the reference
    const currentProfile = profileService.getCurrentProfile();
    if (currentProfile === input.oldName) {
      profileService.setCurrentProfile(input.newName);
    }

    // Delete old profile
    profileService.deleteProfile(input.oldName);

    return { success: true, output: envPresenter.formatRenameSuccess(input.oldName, input.newName) };
  });
}

export async function renameCommandInteractive(): Promise<CommandResult> {
  const { selectProfileFromList, confirmAction, promptForNewName } = await import('../ui/prompt.js');

  const profiles = profileService.listProfiles();
  if (profiles.length === 0) {
    return { success: false, error: '没有可重命名的配置。' };
  }

  const currentProfile = profileService.getCurrentProfile();
  const selectedName = await selectProfileFromList(profiles, currentProfile);

  if (!selectedName) {
    return { success: false, error: '已取消重命名。', wasCancelled: true };
  }

  const newName = await promptForNewName(selectedName);
  if (!newName) {
    return { success: false, error: '已取消重命名。', wasCancelled: true };
  }

  const confirmed = await confirmAction(`确定要将配置 '${selectedName}' 重命名为 '${newName}' 吗？`);
  if (!confirmed) {
    return { success: false, error: '已取消重命名。', wasCancelled: true };
  }

  return renameCommand({ oldName: selectedName, newName });
}
