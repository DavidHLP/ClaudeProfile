import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { FileOperationError, SettingsFileCorruptError } from '../errors.js';

export interface ClaudeSettingsStore {
  readEnv(): Record<string, string>;
  writeEnv(env: Record<string, string>): void;
}

export class ClaudeSettingsStoreImpl implements ClaudeSettingsStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? join(homedir(), '.claude', 'settings.json');
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
      writeFileSync(this.filePath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
    } catch (err) {
      throw new FileOperationError('write', this.filePath, err);
    }
  }
}
