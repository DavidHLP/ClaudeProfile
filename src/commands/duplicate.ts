import { profileService } from '../services/profileService.js';
import { envPresenter } from '../presenters/envPresenter.js';
import { DuplicateProfileInput, CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';
import { ProfileAlreadyExistsError } from '../errors.js';

export async function duplicateCommand(input: DuplicateProfileInput): Promise<CommandResult> {
  return runCommand('复制配置', async () => {
    // Get the source profile
    const sourceProfile = profileService.getProfile(input.sourceName);

    // Check if new name already exists
    if (profileService.profileExists(input.newName)) {
      throw new ProfileAlreadyExistsError(input.newName);
    }

    // Create new profile with new name but same env and description
    const newProfile = {
      name: input.newName,
      description: sourceProfile.description,
      env: { ...sourceProfile.env },
    };

    // Save new profile
    profileService.saveProfile(newProfile);

    return { success: true, output: envPresenter.formatDuplicateSuccess(input.sourceName, input.newName) };
  });
}

export async function duplicateCommandInteractive(): Promise<CommandResult> {
  const { selectProfileFromList, confirmAction, promptForNewName } = await import('../ui/prompt.js');

  const profiles = profileService.listProfiles();
  if (profiles.length === 0) {
    return { success: false, error: '没有可复制的配置。' };
  }

  const currentProfile = profileService.getCurrentProfile();
  const selectedName = await selectProfileFromList(profiles, currentProfile);

  if (!selectedName) {
    return { success: false, error: '已取消复制。', wasCancelled: true };
  }

  const newName = await promptForNewName(selectedName + '-copy');
  if (!newName) {
    return { success: false, error: '已取消复制。', wasCancelled: true };
  }

  const confirmed = await confirmAction(`确定要复制配置 '${selectedName}' 到 '${newName}' 吗？`);
  if (!confirmed) {
    return { success: false, error: '已取消复制。', wasCancelled: true };
  }

  return duplicateCommand({ sourceName: selectedName, newName });
}
