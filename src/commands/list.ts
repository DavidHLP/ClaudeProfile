import { profileService } from '../services/profileService.js';
import { envPresenter } from '../presenters/envPresenter.js';
import { CommandResult } from '../types/command.js';
import { AppError } from '../errors.js';

export async function listCommand(): Promise<CommandResult> {
  try {
    const profiles = profileService.listProfiles();
    const currentProfile = profileService.getCurrentProfile();

    if (profiles.length === 0) {
      return { success: true, output: envPresenter.formatNoProfiles() };
    }

    return { success: true, output: envPresenter.formatProfileList(profiles, currentProfile) };
  } catch (err) {
    if (err instanceof AppError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: `列出配置失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}
