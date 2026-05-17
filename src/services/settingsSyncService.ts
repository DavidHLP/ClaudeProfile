import type { EnvConfig } from '../types/index.js';
import type { ClaudeSettingsStore } from '../config/claudeSettingsStore.js';
import { computeSettingsEnv } from '../engine/settingsSync.js';
import { ClaudeSettingsStoreImpl } from '../config/claudeSettingsStore.js';

export interface SettingsSyncService {
  syncOnSwitch(oldEnv: EnvConfig | null, newEnv: EnvConfig): void;
}

export class SettingsSyncServiceImpl implements SettingsSyncService {
  constructor(private readonly settingsStore: ClaudeSettingsStore) {}

  syncOnSwitch(oldEnv: EnvConfig | null, newEnv: EnvConfig): void {
    try {
      const currentSettingsEnv = this.settingsStore.readEnv();
      const newSettingsEnv = computeSettingsEnv(oldEnv, newEnv, currentSettingsEnv);
      this.settingsStore.writeEnv(newSettingsEnv);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Warning: Failed to sync to ~/.claude/settings.json: ${message}\n`);
    }
  }
}

export const settingsSyncService: SettingsSyncService = new SettingsSyncServiceImpl(new ClaudeSettingsStoreImpl());
