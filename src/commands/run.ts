import { spawn } from 'child_process';
import { profileService } from '../services/profileService.js';
import { CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';
import { AppError } from '../errors.js';
import { maskValue } from '../utils/sensitiveKeys.js';

const RUN_TIMEOUT_MS = 30 * 60 * 1000;
const GRACE_PERIOD_MS = 5000;

export interface RunProfileInput {
  profileName: string;
  command: string[];
  noInheritEnv?: boolean;
  printEnv?: boolean;
}

export async function runProfileCommand(input: RunProfileInput): Promise<CommandResult> {
  return runCommand('运行配置', async () => {
    const profile = profileService.getProfile(input.profileName);
    if (!profile) {
      throw new AppError(`配置 '${input.profileName}' 不存在`, 'PROFILE_NOT_FOUND');
    }

    const env = input.noInheritEnv
      ? { ...profile.env }
      : { ...process.env, ...profile.env };

    if (input.printEnv) {
      const lines = Object.entries(profile.env).map(([key, value]) =>
        `${key}=${maskValue(key, value)}`
      );
      return { success: true, output: lines.join('\n') };
    }

    if (input.command.length === 0) {
      throw new AppError('没有指定要运行的命令', 'NO_COMMAND');
    }

    return new Promise<CommandResult>((resolve) => {
      let settled = false;
      const [cmd, ...cmdArgs] = input.command;
      const child = spawn(cmd, cmdArgs, {
        env: env as NodeJS.ProcessEnv,
        stdio: 'inherit',
        shell: false,
      });

      let graceTimer: ReturnType<typeof setTimeout> | undefined;

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        graceTimer = setTimeout(() => {
          child.kill('SIGKILL');
        }, GRACE_PERIOD_MS);
        resolve({ success: false, error: `命令执行超时（${RUN_TIMEOUT_MS / 60000}分钟）` });
      }, RUN_TIMEOUT_MS);

      child.on('close', (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (graceTimer) clearTimeout(graceTimer);
        if (code === 0) {
          resolve({ success: true, output: '' });
        } else if (code !== null) {
          resolve({ success: false, error: `命令退出码: ${code}` });
        } else {
          resolve({ success: false, error: `命令被信号终止: ${signal}` });
        }
      });

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (graceTimer) clearTimeout(graceTimer);
        resolve({ success: false, error: `无法启动命令: ${err.message}` });
      });
    });
  });
}

export async function execProfileCommand(input: RunProfileInput): Promise<CommandResult> {
  return runProfileCommand(input);
}