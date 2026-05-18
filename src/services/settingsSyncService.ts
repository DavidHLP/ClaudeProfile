import type { EnvConfig } from '../types/index.js';
import type { ClaudeSettingsStore } from '../config/claudeSettingsStore.js';
import { computeSettingsEnv } from '../engine/settingsSync.js';
import { ClaudeSettingsStoreImpl } from '../config/claudeSettingsStore.js';

export type SyncErrorStrategy = 'strict' | 'warn' | 'silent';

export interface SyncOptions {
  errorStrategy?: SyncErrorStrategy;
}

export interface SyncResult {
  success: boolean;
  warning?: string;
}

export interface SettingsSyncService {
  syncOnSwitch(oldEnv: EnvConfig | null, newEnv: EnvConfig, options?: SyncOptions): SyncResult;
}

export class SettingsSyncServiceImpl implements SettingsSyncService {
  constructor(private readonly settingsStore: ClaudeSettingsStore) {}

  syncOnSwitch(oldEnv: EnvConfig | null, newEnv: EnvConfig, options: SyncOptions = {}): SyncResult {
    const { errorStrategy = 'warn' } = options;

    try {
      const currentSettingsEnv = this.settingsStore.readEnv();
      const newSettingsEnv = computeSettingsEnv(oldEnv, newEnv, currentSettingsEnv);
      this.settingsStore.writeEnv(newSettingsEnv);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const warning = `Failed to sync to ~/.claude/settings.json: ${message}`;

      switch (errorStrategy) {
        case 'strict':
          throw new Error(message);
        case 'warn':
          process.stderr.write(`Warning: ${warning}\n`);
          return { success: false, warning };
        case 'silent':
          return { success: false };
      }
    }
  }
}

export const settingsSyncService: SettingsSyncService = new SettingsSyncServiceImpl(new ClaudeSettingsStoreImpl());
