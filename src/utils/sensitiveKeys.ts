import { maskProfileValue, SENSITIVE_ENV_KEYS as SCHEMA_SENSITIVE_ENV_KEYS } from '../domain/profileSchema.js';

// Re-exported for back-compat with any embedder that imported the
// constant directly. New code should use the schema-derived set from
// `domain/profileSchema.js`.
export const SENSITIVE_ENV_KEYS: ReadonlySet<string> = new Set(SCHEMA_SENSITIVE_ENV_KEYS);

export function maskValue(key: string, value: string | undefined): string {
  if (!value) return '';
  if (!SENSITIVE_ENV_KEYS.has(key)) return value;
  return maskProfileValue(key as Parameters<typeof maskProfileValue>[0], value);
}
