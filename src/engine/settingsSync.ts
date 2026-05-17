import type { EnvConfig } from '../types/index.js';

export const MANAGED_SETTINGS_KEYS: readonly string[] = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
] as const;

export function computeSettingsEnv(
  oldEnv: EnvConfig | null,
  newEnv: EnvConfig,
  currentSettingsEnv: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = { ...currentSettingsEnv };

  for (const key of MANAGED_SETTINGS_KEYS) {
    const newValue = newEnv[key];
    const oldValue = oldEnv?.[key];

    if (newValue) {
      result[key] = newValue;
    } else if (oldValue) {
      delete result[key];
    }
  }

  return result;
}
