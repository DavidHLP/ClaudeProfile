import { profileService } from '../services/profileService.js';
import { envPresenter } from '../presenters/envPresenter.js';
import { CommandResult } from '../types/command.js';
import { AppError } from '../errors.js';

export interface ExportProfileInput {
  profileName: string;
}

export async function exportCommand(input: ExportProfileInput): Promise<CommandResult> {
  try {
    const profile = profileService.getProfile(input.profileName);
    if (!profile) {
      return { success: false, error: `配置 "${input.profileName}" 不存在` };
    }

    const exportCommands = envPresenter.buildExportCommands(profile.env);
    return { success: true, output: exportCommands };
  } catch (err) {
    if (err instanceof AppError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: `导出配置失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function exportCurrentCommand(): Promise<CommandResult> {
  try {
    const currentProfile = profileService.getCurrentProfile();
    if (!currentProfile) {
      return { success: false, error: '没有当前配置' };
    }

    const profile = profileService.getProfile(currentProfile);
    if (!profile) {
      return { success: false, error: `当前配置 "${currentProfile}" 不存在` };
    }

    let oldEnv = null;
    try {
      const previousProfileName = profileService.getPreviousProfile();
      if (previousProfileName && previousProfileName !== currentProfile) {
        const oldProfile = profileService.getProfile(previousProfileName);
        oldEnv = oldProfile.env;
      }
    } catch {
      // Previous profile not found; skip cleanup diff
    }

    // Clean up .current-prev after use
    profileService.setPreviousProfile(null);

    const exportCommands = envPresenter.buildSwitchCommands(oldEnv, profile.env);
    return { success: true, output: exportCommands };
  } catch (err) {
    if (err instanceof AppError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: `导出当前配置失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}
