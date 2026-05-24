export const SENSITIVE_ENV_KEYS: ReadonlySet<string> = new Set([
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
]);

export function maskValue(key: string, value: string | undefined): string {
  if (!value) return '';
  if (!SENSITIVE_ENV_KEYS.has(key)) return value;
  if (value.length <= 4) return '****';
  return value.slice(0, 4) + '****';
}
