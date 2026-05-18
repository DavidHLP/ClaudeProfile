import { readFileSync } from 'fs';
import { profileService } from '../services/profileService.js';
import { envPresenter } from '../presenters/envPresenter.js';
import { ImportProfileInput, CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';
import { FileOperationError, ProfileAlreadyExistsError, AppError } from '../errors.js';
import { Profile } from '../types/index.js';
import * as YAML from 'yaml';

function detectFormat(inputPath: string, format?: 'json' | 'yaml'): 'json' | 'yaml' {
  if (format) return format;
  const ext = inputPath.toLowerCase().split('.').pop();
  if (ext === 'yaml' || ext === 'yml') return 'yaml';
  return 'json';
}

function parseProfileFile(content: string, format: 'json' | 'yaml'): Partial<Profile> {
  if (format === 'yaml') {
    return YAML.parse(content);
  }
  return JSON.parse(content);
}

function validateImportedProfile(data: unknown): data is Profile {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.name !== 'string' || !obj.name.trim()) return false;
  if (typeof obj.env !== 'object' || obj.env === null) return false;
  return true;
}

export async function importFileCommand(input: ImportProfileInput): Promise<CommandResult> {
  return runCommand('导入配置', async () => {
    const format = detectFormat(input.inputPath, input.format);

    // Read file
    let content: string;
    try {
      content = readFileSync(input.inputPath, 'utf-8');
    } catch (err) {
      throw new FileOperationError('read', input.inputPath, err);
    }

    // Parse file
    let parsed: unknown;
    try {
      parsed = parseProfileFile(content, format);
    } catch (err) {
      throw new AppError(`无效的 ${format.toUpperCase()} 格式: ${err instanceof Error ? err.message : String(err)}`, 'INVALID_FORMAT');
    }

    // Validate schema
    if (!validateImportedProfile(parsed)) {
      throw new AppError('无效的配置文件结构: 缺少 name 或 env 字段', 'INVALID_PROFILE_SCHEMA');
    }

    // Use provided profile name or the one from file
    const profileName = input.profileName?.trim() || parsed.name;

    // Check if profile already exists
    if (profileService.profileExists(profileName) && profileName !== parsed.name) {
      throw new ProfileAlreadyExistsError(profileName);
    }

    // Create profile
    const profile: Profile = {
      name: profileName,
      description: parsed.description || '',
      env: { ...parsed.env },
    };

    // Save profile
    profileService.saveProfile(profile);

    return { success: true, output: envPresenter.formatImportSuccess(profileName, input.inputPath) };
  });
}

export async function importFileCommandInteractive(): Promise<CommandResult> {
  const { promptInput, confirmAction } = await import('../ui/prompt.js');

  const inputPath = await promptInput({
    message: '请输入配置文件路径:',
    validate: (input: string) => {
      if (!input.trim()) return '路径不能为空';
      return true;
    },
  });

  if (!inputPath) {
    return { success: false, error: '已取消导入。', wasCancelled: true };
  }

  const format = inputPath.toLowerCase().endsWith('.yaml') || inputPath.toLowerCase().endsWith('.yml') ? 'yaml' : 'json';

  const confirmed = await confirmAction(`确定要从 '${inputPath}' 导入配置吗？`);
  if (!confirmed) {
    return { success: false, error: '已取消导入。', wasCancelled: true };
  }

  return importFileCommand({ inputPath, format });
}
