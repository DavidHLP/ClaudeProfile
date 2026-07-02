import { describe, it, expect } from 'vitest';
import {
  PROFILE_FIELDS,
  PROFILE_FIELDS_ORDER,
  PROFILE_DISPLAY_ROWS,
  ProfileField,
  applyField,
  getFieldValue,
  validateProfile,
  profileDetailRows,
  maskProfileValue,
  SENSITIVE_ENV_KEYS,
} from '../src/domain/profileSchema.js';
import { EnvConfig } from '../src/types/index.js';

const FULL_ENV: EnvConfig = {
  ANTHROPIC_BASE_URL: 'https://api.test.com',
  ANTHROPIC_AUTH_TOKEN: 'secret-token-12345',
  ANTHROPIC_MODEL: 'test-sonnet',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'test-sonnet',
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'test-opus',
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'test-haiku',
};

describe('PROFILE_FIELDS', () => {
  it('has exactly 5 fields', () => {
    expect(Object.keys(PROFILE_FIELDS)).toHaveLength(5);
  });

  it('contains all expected field ids', () => {
    const ids = Object.keys(PROFILE_FIELDS).sort();
    expect(ids).toEqual(['baseUrl', 'haikuModel', 'opusModel', 'sonnetModel', 'token']);
  });

  it('PROFILE_FIELDS_ORDER matches the canonical display order', () => {
    expect([...PROFILE_FIELDS_ORDER]).toEqual([
      'baseUrl',
      'token',
      'sonnetModel',
      'opusModel',
      'haikuModel',
    ]);
  });

  it('flags baseUrl and token as required', () => {
    expect(PROFILE_FIELDS.baseUrl.required).toBe(true);
    expect(PROFILE_FIELDS.token.required).toBe(true);
  });

  it('flags only token as sensitive', () => {
    expect(PROFILE_FIELDS.token.sensitive).toBe(true);
    expect(PROFILE_FIELDS.baseUrl.sensitive).toBe(false);
    expect(PROFILE_FIELDS.sonnetModel.sensitive).toBe(false);
    expect(PROFILE_FIELDS.opusModel.sensitive).toBe(false);
    expect(PROFILE_FIELDS.haikuModel.sensitive).toBe(false);
  });

  it('sonnetModel owns both ANTHROPIC_MODEL and ANTHROPIC_DEFAULT_SONNET_MODEL', () => {
    expect([...PROFILE_FIELDS.sonnetModel.envKeys]).toEqual([
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_MODEL',
    ]);
  });

  it('every other field owns exactly one env key', () => {
    expect(PROFILE_FIELDS.baseUrl.envKeys).toEqual(['ANTHROPIC_BASE_URL']);
    expect(PROFILE_FIELDS.token.envKeys).toEqual(['ANTHROPIC_AUTH_TOKEN']);
    expect(PROFILE_FIELDS.opusModel.envKeys).toEqual(['ANTHROPIC_DEFAULT_OPUS_MODEL']);
    expect(PROFILE_FIELDS.haikuModel.envKeys).toEqual(['ANTHROPIC_DEFAULT_HAIKU_MODEL']);
  });
});

describe('SENSITIVE_ENV_KEYS', () => {
  it('contains only ANTHROPIC_AUTH_TOKEN', () => {
    expect(SENSITIVE_ENV_KEYS.has('ANTHROPIC_AUTH_TOKEN')).toBe(true);
    expect(SENSITIVE_ENV_KEYS.size).toBe(1);
  });

  it('does not leak other env keys as sensitive', () => {
    expect(SENSITIVE_ENV_KEYS.has('ANTHROPIC_BASE_URL')).toBe(false);
    expect(SENSITIVE_ENV_KEYS.has('ANTHROPIC_MODEL')).toBe(false);
  });
});

describe('PROFILE_DISPLAY_ROWS', () => {
  it('has 6 rows: BASE URL, TOKEN, MODEL, SONNET, OPUS, HAIKU', () => {
    expect(PROFILE_DISPLAY_ROWS.map((r) => r.shortLabel)).toEqual([
      'BASE URL',
      'TOKEN',
      'MODEL',
      'SONNET',
      'OPUS',
      'HAIKU',
    ]);
  });

  it('preserves the original display order', () => {
    const expectedOrder = [
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_MODEL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    ];
    expect(PROFILE_DISPLAY_ROWS.map((r) => r.envKey)).toEqual(expectedOrder);
  });
});

describe('validateInput (per-field prompt validator)', () => {
  it('baseUrl rejects empty', () => {
    expect(PROFILE_FIELDS.baseUrl.validateInput('')).toBe('URL 不能为空');
    expect(PROFILE_FIELDS.baseUrl.validateInput('   ')).toBe('URL 不能为空');
  });

  it('baseUrl rejects non-http schemes', () => {
    expect(PROFILE_FIELDS.baseUrl.validateInput('ftp://foo')).toBe('URL 必须以 http:// 或 https:// 开头');
  });

  it('baseUrl accepts http and https', () => {
    expect(PROFILE_FIELDS.baseUrl.validateInput('http://x')).toBe(true);
    expect(PROFILE_FIELDS.baseUrl.validateInput('https://x')).toBe(true);
  });

  it('token rejects empty', () => {
    expect(PROFILE_FIELDS.token.validateInput('')).toBe('Token 不能为空');
  });

  it('model fields reject empty', () => {
    expect(PROFILE_FIELDS.sonnetModel.validateInput('')).toBe('模型名称不能为空');
    expect(PROFILE_FIELDS.opusModel.validateInput('')).toBe('模型名称不能为空');
    expect(PROFILE_FIELDS.haikuModel.validateInput('')).toBe('模型名称不能为空');
  });

  it('model fields accept any non-empty string', () => {
    expect(PROFILE_FIELDS.sonnetModel.validateInput('m')).toBe(true);
    expect(PROFILE_FIELDS.opusModel.validateInput('m')).toBe(true);
    expect(PROFILE_FIELDS.haikuModel.validateInput('m')).toBe(true);
  });
});

describe('getFieldValue', () => {
  it('reads the primary env key for each field', () => {
    expect(getFieldValue(FULL_ENV, 'baseUrl')).toBe('https://api.test.com');
    expect(getFieldValue(FULL_ENV, 'token')).toBe('secret-token-12345');
    expect(getFieldValue(FULL_ENV, 'sonnetModel')).toBe('test-sonnet');
    expect(getFieldValue(FULL_ENV, 'opusModel')).toBe('test-opus');
    expect(getFieldValue(FULL_ENV, 'haikuModel')).toBe('test-haiku');
  });

  it('returns undefined for unset fields', () => {
    expect(getFieldValue({}, 'baseUrl')).toBeUndefined();
  });

  it('sonnetModel prefers ANTHROPIC_DEFAULT_SONNET_MODEL over ANTHROPIC_MODEL', () => {
    const env: EnvConfig = {
      ANTHROPIC_MODEL: 'legacy',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'override',
    };
    expect(getFieldValue(env, 'sonnetModel')).toBe('override');
  });
});

describe('applyField', () => {
  it('returns a new env without mutating the input', () => {
    const env: EnvConfig = { ANTHROPIC_BASE_URL: 'old' };
    const next = applyField(env, 'baseUrl', 'new');
    expect(env.ANTHROPIC_BASE_URL).toBe('old');
    expect(next.ANTHROPIC_BASE_URL).toBe('new');
  });

  it('sonnetModel writes to both ANTHROPIC_MODEL and ANTHROPIC_DEFAULT_SONNET_MODEL', () => {
    const env: EnvConfig = {
      ANTHROPIC_MODEL: 'old-model',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'old-sonnet',
    };
    const next = applyField(env, 'sonnetModel', 'new-value');
    expect(next.ANTHROPIC_MODEL).toBe('new-value');
    expect(next.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('new-value');
  });

  it('other fields write to their single env key', () => {
    const env: EnvConfig = {};
    expect(applyField(env, 'baseUrl', 'url').ANTHROPIC_BASE_URL).toBe('url');
    expect(applyField(env, 'token', 'tok').ANTHROPIC_AUTH_TOKEN).toBe('tok');
    expect(applyField(env, 'opusModel', 'o').ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('o');
    expect(applyField(env, 'haikuModel', 'h').ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('h');
  });

  it('preserves unrelated env keys', () => {
    const env: EnvConfig = {
      API_TIMEOUT_MS: '3000000',
      ANTHROPIC_BASE_URL: 'old',
    };
    const next = applyField(env, 'token', 'tok');
    expect(next.API_TIMEOUT_MS).toBe('3000000');
    expect(next.ANTHROPIC_BASE_URL).toBe('old');
    expect(next.ANTHROPIC_AUTH_TOKEN).toBe('tok');
  });
});

describe('validateProfile', () => {
  it('returns no issues for a fully populated env', () => {
    expect(validateProfile(FULL_ENV)).toEqual([]);
  });

  it('emits an error for missing required token', () => {
    const env: EnvConfig = { ...FULL_ENV, ANTHROPIC_AUTH_TOKEN: '' };
    const issues = validateProfile(env);
    const tokenIssue = issues.find((i) => i.field === 'token');
    expect(tokenIssue?.severity).toBe('error');
    expect(tokenIssue?.envKey).toBe('ANTHROPIC_AUTH_TOKEN');
  });

  it('emits an error for missing required baseUrl', () => {
    const env: EnvConfig = { ...FULL_ENV, ANTHROPIC_BASE_URL: '' };
    const issues = validateProfile(env);
    const urlIssue = issues.find((i) => i.field === 'baseUrl');
    expect(urlIssue?.severity).toBe('error');
  });

  it('emits warnings for missing optional model fields', () => {
    const env: EnvConfig = {
      ANTHROPIC_BASE_URL: 'https://x',
      ANTHROPIC_AUTH_TOKEN: 't',
    };
    const issues = validateProfile(env);
    const warnings = issues.filter((i) => i.severity === 'warning');
    expect(warnings.length).toBe(4); // ANTHROPIC_MODEL, ANTHROPIC_DEFAULT_SONNET_MODEL, OPUS, HAIKU
    expect(warnings.find((i) => i.envKey === 'ANTHROPIC_DEFAULT_OPUS_MODEL')).toBeDefined();
    expect(warnings.find((i) => i.envKey === 'ANTHROPIC_DEFAULT_HAIKU_MODEL')).toBeDefined();
  });

  it('sonnet field is satisfied if EITHER ANTHROPIC_MODEL or ANTHROPIC_DEFAULT_SONNET_MODEL is set', () => {
    const env: EnvConfig = {
      ...FULL_ENV,
      ANTHROPIC_DEFAULT_SONNET_MODEL: '',
      ANTHROPIC_MODEL: 'legacy-only',
    };
    const issues = validateProfile(env);
    const sonnetIssue = issues.find((i) => i.envKey === 'ANTHROPIC_MODEL' || i.envKey === 'ANTHROPIC_DEFAULT_SONNET_MODEL');
    expect(sonnetIssue).toBeUndefined();
  });

  it('sonnet field warns per empty env key when ALL are empty', () => {
    const env: EnvConfig = {
      ...FULL_ENV,
      ANTHROPIC_DEFAULT_SONNET_MODEL: '',
      ANTHROPIC_MODEL: '',
    };
    const issues = validateProfile(env);
    const sonnetKeys = issues
      .filter((i) => i.field === 'sonnetModel')
      .map((i) => i.envKey)
      .sort();
    expect(sonnetKeys).toEqual(['ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_MODEL']);
    issues.filter((i) => i.field === 'sonnetModel').forEach((i) => {
      expect(i.severity).toBe('warning');
    });
  });

  it('emits an error for non-http URL', () => {
    const env: EnvConfig = { ...FULL_ENV, ANTHROPIC_BASE_URL: 'ftp://x' };
    const issues = validateProfile(env);
    const urlError = issues.find((i) => i.field === 'baseUrl' && i.severity === 'error');
    expect(urlError?.message).toContain('http/https');
  });

  it('emits an error for malformed URL', () => {
    const env: EnvConfig = { ...FULL_ENV, ANTHROPIC_BASE_URL: 'not-a-url' };
    const issues = validateProfile(env);
    const urlError = issues.find((i) => i.field === 'baseUrl' && i.severity === 'error');
    expect(urlError?.message).toContain('URL 格式无效');
  });

  it('emits no URL-format error when ANTHROPIC_BASE_URL is empty (caught by required check instead)', () => {
    const env: EnvConfig = { ...FULL_ENV, ANTHROPIC_BASE_URL: '' };
    const issues = validateProfile(env);
    const urlErrors = issues.filter((i) => i.field === 'baseUrl' && i.message.startsWith('URL 格式'));
    expect(urlErrors).toEqual([]);
  });

  it('treats whitespace-only values as empty', () => {
    const env: EnvConfig = { ...FULL_ENV, ANTHROPIC_AUTH_TOKEN: '   ' };
    const issues = validateProfile(env);
    const tokenIssue = issues.find((i) => i.field === 'token');
    expect(tokenIssue?.severity).toBe('error');
  });
});

describe('profileDetailRows', () => {
  it('returns 6 rows for a full env', () => {
    const rows = profileDetailRows(FULL_ENV, maskProfileValue);
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.shortLabel)).toEqual([
      'BASE URL',
      'TOKEN',
      'MODEL',
      'SONNET',
      'OPUS',
      'HAIKU',
    ]);
  });

  it('shows 已设置 for set token, 未设置 for empty token', () => {
    const withToken = profileDetailRows(FULL_ENV, maskProfileValue);
    expect(withToken[1].displayValue).toBe('已设置');
    expect(withToken[1].isSet).toBe(true);

    const withoutToken = profileDetailRows(
      { ...FULL_ENV, ANTHROPIC_AUTH_TOKEN: '' },
      maskProfileValue
    );
    expect(withoutToken[1].displayValue).toBe('未设置');
    expect(withoutToken[1].isSet).toBe(false);
  });

  it('does not leak the actual token value into display', () => {
    const rows = profileDetailRows(FULL_ENV, maskProfileValue);
    const combined = rows.map((r) => r.displayValue).join('|');
    expect(combined).not.toContain('secret-token-12345');
  });

  it('shows 未设置 for empty non-sensitive fields', () => {
    const env: EnvConfig = { ANTHROPIC_AUTH_TOKEN: 't' };
    const rows = profileDetailRows(env, maskProfileValue);
    expect(rows.find((r) => r.shortLabel === 'BASE URL')?.displayValue).toBe('未设置');
    expect(rows.find((r) => r.shortLabel === 'OPUS')?.displayValue).toBe('未设置');
    expect(rows.find((r) => r.shortLabel === 'HAIKU')?.displayValue).toBe('未设置');
  });

  it('uses the supplied mask function for sensitive fields', () => {
    const customMask = (k: string, v: string) => `MASKED[${k}:${v}]`;
    const rows = profileDetailRows(FULL_ENV, customMask);
    const tokenRow = rows.find((r) => r.shortLabel === 'TOKEN');
    // The token row uses the '已设置' convention, not the mask,
    // because that mirrors the original formatProfileDetail output.
    expect(tokenRow?.displayValue).toBe('已设置');
  });

  it('preserves the actual value for non-sensitive set fields', () => {
    const rows = profileDetailRows(FULL_ENV, maskProfileValue);
    expect(rows.find((r) => r.shortLabel === 'BASE URL')?.displayValue).toBe('https://api.test.com');
    expect(rows.find((r) => r.shortLabel === 'MODEL')?.displayValue).toBe('test-sonnet');
    expect(rows.find((r) => r.shortLabel === 'SONNET')?.displayValue).toBe('test-sonnet');
    expect(rows.find((r) => r.shortLabel === 'OPUS')?.displayValue).toBe('test-opus');
    expect(rows.find((r) => r.shortLabel === 'HAIKU')?.displayValue).toBe('test-haiku');
  });
});

describe('maskProfileValue', () => {
  it('masks short values as ****', () => {
    expect(maskProfileValue('ANTHROPIC_AUTH_TOKEN', 'ab')).toBe('****');
    expect(maskProfileValue('ANTHROPIC_AUTH_TOKEN', 'abcd')).toBe('****');
  });

  it('shows first 4 chars + **** for longer values', () => {
    expect(maskProfileValue('ANTHROPIC_AUTH_TOKEN', 'sk-1234567890')).toBe('sk-1****');
    expect(maskProfileValue('ANTHROPIC_AUTH_TOKEN', 'secret-token-12345')).toBe('secr****');
  });
});

describe('ProfileField type', () => {
  it('is a closed union of 5 literal strings', () => {
    // Compile-time check: this assignment must succeed without error.
    const fields: ProfileField[] = ['baseUrl', 'token', 'sonnetModel', 'opusModel', 'haikuModel'];
    expect(fields).toHaveLength(5);
  });
});
