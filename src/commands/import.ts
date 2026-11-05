import { readFileSync } from 'fs';
import { ImportProfileInput, CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';
import { FileOperationError, ProfileAlreadyExistsError } from '../errors.js';
import { detectImportFormat, parseImportedProfile } from '../domain/profileImport.js';
import type { CommandContext } from './context.js';

export async function importFileCommand(ctx: CommandContext, input: ImportProfileInput): Promise<CommandResult> {
  return runCommand('导入配置', async () => {
    const format = detectImportFormat(input.inputPath, input.format);

    // 1. Read the file (I/O stays in the command layer; the domain
    //    primitive is pure and content-shaped).
    let content: string;
    try {
      content = readFileSync(input.inputPath, 'utf-8');
    } catch (err) {
      throw new FileOperationError('read', input.inputPath, err);
    }

    // 2. Parse + validate. Throws `ProfileImportError` (an AppError
    //    subclass) on any failure; `runCommand` surfaces it.
    const profile = parseImportedProfile(content, format, input.profileName);

    // 3. Existence check (CLI behavior preserved: refuse unless --force).
    if (ctx.profiles.profileExists(profile.name) && !input.force) {
      throw new ProfileAlreadyExistsError(profile.name);
    }

    // 4. Persist + present.
    ctx.profiles.saveProfile(profile);
    return { success: true, output: ctx.env.formatImportSuccess(profile.name, input.inputPath) };
  });
}

export async function importFileCommandInteractive(ctx: CommandContext): Promise<CommandResult> {
  const inputPath = await ctx.prompts.promptInput({
    message: '请输入配置文件路径:',
    validate: (input: string) => {
      if (!input.trim()) return '路径不能为空';
      return true;
    },
  });

  if (!inputPath) {
    return { success: false, error: '已取消导入。', wasCancelled: true };
  }

  // Reuse the same format-detection primitive as the non-interactive
  // path so the two never drift on what counts as a YAML file.
  const format = detectImportFormat(inputPath);

  const confirmed = await ctx.prompts.confirmAction(`确定要从 '${inputPath}' 导入配置吗？`);
  if (!confirmed) {
    return { success: false, error: '已取消导入。', wasCancelled: true };
  }

  return importFileCommand(ctx, { inputPath, format, force: true });
}
