import { writeFileSync } from 'fs';
import { profileService } from '../services/profileService.js';
import { envPresenter, buildExportCommands, buildSwitchCommands } from '../presenters/envPresenter.js';
import { CommandResult, ExportFileInput } from '../types/command.js';
import { runCommand } from './runner.js';
import { resolveOldEnv } from '../engine/activation.js';
import { FileOperationError, AppError } from '../errors.js';
import * as YAML from 'yaml';

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

export async function exportFileCommand(input: ExportFileInput): Promise<CommandResult> {
  return runCommand('导出配置文件', async () => {
    const profile = profileService.getProfile(input.profileName);
    const format = input.format || 'json';
    const outputPath = input.outputPath || `${profile.name}.${format}`;

    let content: string;
    if (format === 'yaml') {
      content = YAML.stringify({
        name: profile.name,
        description: profile.description,
        env: profile.env,
      });
    } else {
      content = JSON.stringify({
        name: profile.name,
        description: profile.description,
        env: profile.env,
      }, null, 2);
    }

    try {
      writeFileSync(outputPath, content, 'utf-8');
    } catch (err) {
      throw new FileOperationError('write', outputPath, err);
    }

    return { success: true, output: envPresenter.formatExportSuccess(profile.name, outputPath) };
  });
}

export async function exportCurrentFileCommand(input: { format?: 'json' | 'yaml'; outputPath?: string }): Promise<CommandResult> {
  return runCommand('导出当前配置文件', async () => {
    const currentProfile = profileService.getCurrentProfile();
    if (!currentProfile) {
      return { success: false, error: '没有当前配置' };
    }

    return exportFileCommand({
      profileName: currentProfile,
      format: input.format,
      outputPath: input.outputPath,
    });
  });
}
