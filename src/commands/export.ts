import { profileService } from '../services/profileService.js';
import { envPresenter, buildExportCommands, buildSwitchCommands } from '../presenters/envPresenter.js';
import { CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';
import { resolveOldEnv } from '../engine/activation.js';

export interface ExportProfileInput {
  profileName: string;
}

export async function exportCommand(input: ExportProfileInput): Promise<CommandResult> {
  return runCommand('导出配置', async () => {
    const profile = profileService.getProfile(input.profileName);

    const exportCommands = buildExportCommands(profile.env);
    return { success: true, output: exportCommands };
  });
}

export async function exportCurrentCommand(): Promise<CommandResult> {
  return runCommand('导出当前配置', async () => {
    const currentProfile = profileService.getCurrentProfile();
    if (!currentProfile) {
      return { success: false, error: '没有当前配置' };
    }

    const profile = profileService.getProfile(currentProfile);

    const previousProfileName = profileService.getPreviousProfile();
    const oldEnv = resolveOldEnv(profileService, previousProfileName, currentProfile);

    // Clean up .current-prev after use
    profileService.setPreviousProfile(null);

    const exportCommands = buildSwitchCommands(oldEnv, profile.env);
    return { success: true, output: exportCommands };
  });
}
