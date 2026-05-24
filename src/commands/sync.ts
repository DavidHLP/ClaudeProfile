import { profileService } from '../services/profileService.js';
import { createSettingsSyncService } from '../services/settingsSyncService.js';
import { envPresenter } from '../presenters/envPresenter.js';
import { CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';
import { AppError } from '../errors.js';
import { isValidSettingsScope, type SettingsScope } from '../config/claudeSettingsStore.js';

export interface SyncProfileInput {
  profileName: string;
  scope?: SettingsScope;
  dryRun?: boolean;
}

export async function syncCommand(input: SyncProfileInput): Promise<CommandResult> {
  return runCommand('同步配置', async () => {
    const profile = profileService.getProfile(input.profileName);
    if (!profile) {
      throw new AppError(`配置 '${input.profileName}' 不存在`, 'PROFILE_NOT_FOUND');
    }

    const scope = input.scope || 'user';
    if (!isValidSettingsScope(scope)) {
      throw new AppError(`无效的 scope: "${scope}". 有效值为: user, project, local`, 'INVALID_SCOPE');
    }
    const syncService = createSettingsSyncService(scope);

    if (input.dryRun) {
      return {
        success: true,
        output: `【dry-run】将同步配置 '${input.profileName}' 到 scope=${scope}\n` +
                `环境变量: ${Object.keys(profile.env).join(', ')}`,
      };
    }

    const result = syncService.syncOnSwitch(null, profile.env);
    if (!result.success && result.warning) {
      return { success: false, error: result.warning };
    }
    return {
      success: true,
      output: envPresenter.formatSwitchSuccess(input.profileName, profile.env),
    };
  });
}