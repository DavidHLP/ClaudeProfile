import { homedir } from 'os';
import { join, dirname } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { FileOperationError, SettingsFileCorruptError } from '../errors.js';

export type SettingsScope = 'user' | 'project' | 'local';

export function isValidSettingsScope(scope: string): scope is SettingsScope {
  return scope === 'user' || scope === 'project' || scope === 'local';
}

export function resolveSettingsPath(scope: SettingsScope, cwd?: string): string {
  const baseDir = cwd || process.cwd();
  switch (scope) {
    case 'user':
      return join(homedir(), '.claude', 'settings.json');
    case 'project':
      return join(baseDir, '.claude', 'settings.json');
    case 'local':
      return join(baseDir, '.claude', 'settings.local.json');
  }
}

export interface ClaudeSettingsStore {
  readEnv(): Record<string, string>;
  writeEnv(env: Record<string, string>): void;
}

export class ClaudeSettingsStoreImpl implements ClaudeSettingsStore {
  private readonly filePath: string;

  constructor(scopeOrPath?: SettingsScope | string, cwd?: string) {
    if (!scopeOrPath) {
      this.filePath = join(homedir(), '.claude', 'settings.json');
    } else if (scopeOrPath === 'user' || scopeOrPath === 'project' || scopeOrPath === 'local') {
      this.filePath = resolveSettingsPath(scopeOrPath, cwd);
    } else {
      this.filePath = scopeOrPath;
    }
  }

  readEnv(): Record<string, string> {
    if (!existsSync(this.filePath)) {
      return {};
    }
    try {
      const content = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const env = parsed.env;
      if (!env || typeof env !== 'object' || Array.isArray(env)) {
        return {};
      }
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
        if (typeof value === 'string') {
          result[key] = value;
        }
      }
      return result;
    } catch {
      return {};
    }
  }

  writeEnv(env: Record<string, string>): void {
    let settings: Record<string, unknown>;
    if (existsSync(this.filePath)) {
      try {
        const content = readFileSync(this.filePath, 'utf-8');
        settings = JSON.parse(content) as Record<string, unknown>;
      } catch (err) {
        throw new SettingsFileCorruptError(this.filePath, err);
      }
    } else {
      settings = {};
    }
    const updated = { ...settings, env };
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      writeFileSync(this.filePath, JSON.stringify(updated, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
    } catch (err) {
      throw new FileOperationError('write', this.filePath, err);
    }
  }
}
