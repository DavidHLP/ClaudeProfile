import { writeFileSync } from 'fs';
import { buildExportCommands, buildSwitchCommands, buildExportJson, buildSwitchJson } from '../engine/envDiff.js';
import { CommandResult, ExportFileInput } from '../types/command.js';
import { resolveOldEnv } from '../engine/activation.js';
import { FileOperationError } from '../errors.js';
import * as YAML from 'yaml';
import type { CommandContext } from './context.js';
import { runCommand } from './runner.js';

export interface ExportProfileInput {
  profileName: string;
  json?: boolean;
}

export async function exportCommand(ctx: CommandContext, input: ExportProfileInput): Promise<CommandResult> {
  return runCommand('导出配置', async () => {
    const profile = ctx.profiles.getProfile(input.profileName);

    if (input.json) {
      const jsonOutput = buildExportJson(profile.env);
      return { success: true, output: JSON.stringify(jsonOutput) };
    }

    const exportCommands = buildExportCommands(profile.env);
    return { success: true, output: exportCommands };
  });
}

export async function exportCurrentCommand(ctx: CommandContext, input: { json?: boolean } = {}): Promise<CommandResult> {
  return runCommand('导出当前配置', async () => {
    const currentProfile = ctx.profiles.getCurrentProfile();
    if (!currentProfile) {
      return { success: false, error: '没有当前配置' };
    }

    const profile = ctx.profiles.getProfile(currentProfile);

    const previousProfileName = ctx.profiles.getPreviousProfile();
    const oldEnv = resolveOldEnv(ctx.profiles, previousProfileName, currentProfile);

    // Clean up .current-prev after use
    ctx.profiles.setPreviousProfile(null);

    if (input.json) {
      const jsonOutput = buildSwitchJson(oldEnv, profile.env);
      return { success: true, output: JSON.stringify(jsonOutput) };
    }

    const exportCommands = buildSwitchCommands(oldEnv, profile.env);
    return { success: true, output: exportCommands };
  });
}

export async function exportFileCommand(ctx: CommandContext, input: ExportFileInput): Promise<CommandResult> {
  return runCommand('导出配置文件', async () => {
    const profile = ctx.profiles.getProfile(input.profileName);
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

    return { success: true, output: ctx.env.formatExportSuccess(profile.name, outputPath) };
  });
}

export async function exportCurrentFileCommand(ctx: CommandContext, input: { format?: 'json' | 'yaml'; outputPath?: string }): Promise<CommandResult> {
  return runCommand('导出当前配置文件', async () => {
    const currentProfile = ctx.profiles.getCurrentProfile();
    if (!currentProfile) {
      return { success: false, error: '没有当前配置' };
    }

    return exportFileCommand(ctx, {
      profileName: currentProfile,
      format: input.format,
      outputPath: input.outputPath,
    });
  });
}
