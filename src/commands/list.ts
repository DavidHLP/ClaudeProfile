import { profileService } from '../services/profileService.js';
import { envPresenter } from '../presenters/envPresenter.js';
import { CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';

export async function listCommand(): Promise<CommandResult> {
  return runCommand('列出配置', async () => {
    const profiles = profileService.listProfiles();
    const currentProfile = profileService.getCurrentProfile();

    if (profiles.length === 0) {
      return { success: true, output: envPresenter.formatNoProfiles() };
    }

    return { success: true, output: envPresenter.formatProfileList(profiles, currentProfile) };
  });
}
