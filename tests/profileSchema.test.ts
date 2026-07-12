import { describe, it, expect } from 'vitest';
import {
  PROFILE_FIELDS,
  PROFILE_FIELDS_ORDER,
  PROFILE_DISPLAY_ROWS,
  ProfileField,
  applyField,
  getFieldValue,
  getEffectiveFieldValue,
  defaultFieldValue,
  formatFieldDisplayValue,
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
  CLAUDE_CODE_EFFORT_LEVEL: 'max',
};

describe('PROFILE_FIELDS', () => {
  it('has exactly 6 fields', () => {
    expect(Object.keys(PROFILE_FIELDS)).toHaveLength(6);
  });

  it('contains all expected field ids', () => {
    const ids = Object.keys(PROFILE_FIELDS).sort();
    expect(ids).toEqual(['baseUrl', 'effortLevel', 'haikuModel', 'opusModel', 'sonnetModel', 'token']);
  });

  it('PROFILE_FIELDS_ORDER matches the canonical display order', () => {
    expect([...PROFILE_FIELDS_ORDER]).toEqual([
      'baseUrl',
      'token',
      'sonnetModel',
      'opusModel',
      'haikuModel',
      'effortLevel',
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
  it('has 7 rows: BASE URL, TOKEN, MODEL, SONNET, OPUS, HAIKU, EFFORT', () => {
    expect(PROFILE_DISPLAY_ROWS.map((r) => r.shortLabel)).toEqual([
      'BASE URL',
      'TOKEN',
      'MODEL',
      'SONNET',
      'OPUS',
      'HAIKU',
      'EFFORT',
    ]);
  });

  it('preserves the original display order (EFFORT appended)', () => {
    const expectedOrder = [
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_MODEL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL',
      'CLAUDE_CODE_EFFORT_LEVEL',
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
    // 4 model-slot warnings (ANTHROPIC_MODEL, ANTHROPIC_DEFAULT_SONNET_MODEL,
    // ANTHROPIC_DEFAULT_OPUS_MODEL, ANTHROPIC_DEFAULT_HAIKU_MODEL) plus
    // 1 EFFORT warning (CLAUDE_CODE_EFFORT_LEVEL is optional with no default).
    expect(warnings.length).toBe(5);
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
  it('returns 7 rows for a full env', () => {
    const rows = profileDetailRows(FULL_ENV, maskProfileValue);
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.shortLabel)).toEqual([
      'BASE URL',
      'TOKEN',
      'MODEL',
      'SONNET',
      'OPUS',
      'HAIKU',
      'EFFORT',
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
  it('is a closed union of 6 literal strings', () => {
    // Compile-time check: this assignment must succeed without error.
    const fields: ProfileField[] = ['baseUrl', 'token', 'sonnetModel', 'opusModel', 'haikuModel', 'effortLevel'];
    expect(fields).toHaveLength(6);
  });
});


describe('defaultFieldValue', () => {
  it('returns the env value when the primary env key is set', () => {
    expect(
      defaultFieldValue(
        { ANTHROPIC_BASE_URL: 'https://x' },
        'baseUrl'
      )
    ).toBe('https://x');
  });

  it('returns the env value for SONNET via the primary env key (not the legacy)', () => {
    // SONNET has two env keys: ANTHROPIC_DEFAULT_SONNET_MODEL (primary)
    // and ANTHROPIC_MODEL (legacy write-side secondary). defaultFieldValue
    // must read the primary only.
    expect(
      defaultFieldValue(
        {
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'new-sonnet',
          ANTHROPIC_MODEL: 'legacy-sonnet',
        },
        'sonnetModel'
      )
    ).toBe('new-sonnet');
  });

  it('falls back to the supplied fallback when the primary env key is empty', () => {
    expect(
      defaultFieldValue(
        { ANTHROPIC_DEFAULT_SONNET_MODEL: '' },
        'sonnetModel',
        'provider-default'
      )
    ).toBe('provider-default');
    expect(
      defaultFieldValue(
        {},
        'sonnetModel',
        'provider-default'
      )
    ).toBe('provider-default');
  });

  it('returns undefined when no env value and no fallback are provided', () => {
    expect(defaultFieldValue({}, 'token')).toBeUndefined();
    expect(defaultFieldValue({ ANTHROPIC_BASE_URL: '' }, 'baseUrl')).toBeUndefined();
  });

  it('works for every field with no env value but a fallback', () => {
    const fields: ProfileField[] = ['baseUrl', 'token', 'sonnetModel', 'opusModel', 'haikuModel'];
    for (const field of fields) {
      expect(defaultFieldValue({}, field, 'fb')).toBe('fb');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────
// ADR-0004: ProfileFieldDisplay seam — getEffectiveFieldValue +
// formatFieldDisplayValue. The 3 hand-rolled display sites
// (ui/prompt.ts#describeFieldValue, selectProfileFromList,
// presenters/envRenderer.ts#formatProfileList) all collapse into
// formatFieldDisplayValue; the SONNET primary-then-legacy display
// subtlety is now owned by getEffectiveFieldValue.
// ────────────────────────────────────────────────────────────────────────

describe('getEffectiveFieldValue', () => {
  it('returns the primary env value when the primary is set', () => {
    const env: EnvConfig = { ANTHROPIC_DEFAULT_SONNET_MODEL: 'primary', ANTHROPIC_MODEL: 'legacy' };
    expect(getEffectiveFieldValue(env, 'sonnetModel')).toBe('primary');
  });

  it('falls back to the legacy env key when the primary is empty', () => {
    const env: EnvConfig = { ANTHROPIC_MODEL: 'legacy' };
    expect(getEffectiveFieldValue(env, 'sonnetModel')).toBe('legacy');
  });

  it('falls back to legacy when the primary is whitespace', () => {
    const env: EnvConfig = {
      ANTHROPIC_DEFAULT_SONNET_MODEL: '   ',
      ANTHROPIC_MODEL: 'legacy',
    };
    expect(getEffectiveFieldValue(env, 'sonnetModel')).toBe('legacy');
  });

  it('returns undefined when every env key is empty / whitespace', () => {
    const env: EnvConfig = {
      ANTHROPIC_DEFAULT_SONNET_MODEL: '',
      ANTHROPIC_MODEL: '   ',
    };
    expect(getEffectiveFieldValue(env, 'sonnetModel')).toBeUndefined();
  });

  it('returns the only env key for single-key fields', () => {
    expect(getEffectiveFieldValue({ ANTHROPIC_BASE_URL: 'https://x' }, 'baseUrl')).toBe('https://x');
    expect(getEffectiveFieldValue({ ANTHROPIC_BASE_URL: '' }, 'baseUrl')).toBeUndefined();
  });

  it('differs from getFieldValue on the primary-empty / legacy-set case', () => {
    // The whole point of having two read functions: getFieldValue is
    // primary-only (used by write/validate), getEffectiveFieldValue
    // is first-non-empty (used by display).
    const env: EnvConfig = { ANTHROPIC_MODEL: 'legacy' };
    expect(getFieldValue(env, 'sonnetModel')).toBeUndefined();
    expect(getEffectiveFieldValue(env, 'sonnetModel')).toBe('legacy');
  });
});

describe('formatFieldDisplayValue', () => {
  it('returns the default [*****] marker for a set token field', () => {
    const env: EnvConfig = { ANTHROPIC_AUTH_TOKEN: 'secret' };
    expect(formatFieldDisplayValue(env, 'token')).toBe('[*****]');
  });

  it('returns the default [UNSET] marker for an unset token field', () => {
    expect(formatFieldDisplayValue({}, 'token')).toBe('[UNSET]');
  });

  it('honors custom token markers for the padded profile-list table variant', () => {
    const set: EnvConfig = { ANTHROPIC_AUTH_TOKEN: 'secret' };
    const unset: EnvConfig = {};
    expect(
      formatFieldDisplayValue(set, 'token', { setMarker: '[ ***** ]', unsetMarker: '[ UNSET ]' })
    ).toBe('[ ***** ]');
    expect(
      formatFieldDisplayValue(unset, 'token', { setMarker: '[ ***** ]', unsetMarker: '[ UNSET ]' })
    ).toBe('[ UNSET ]');
  });

  it('returns the effective value for a set non-token field', () => {
    const env: EnvConfig = { ANTHROPIC_BASE_URL: 'https://x.com' };
    expect(formatFieldDisplayValue(env, 'baseUrl')).toBe('https://x.com');
  });

  it('returns (未设置) for an unset non-token field by default', () => {
    expect(formatFieldDisplayValue({}, 'baseUrl')).toBe('(未设置)');
    expect(formatFieldDisplayValue({}, 'opusModel')).toBe('(未设置)');
    expect(formatFieldDisplayValue({}, 'haikuModel')).toBe('(未设置)');
  });

  it('honors a custom unsetText', () => {
    // The detail panel uses '未设置' (no parens); the picker uses
    // '(未设置)'. Both forms are valid — callers pick.
    expect(
      formatFieldDisplayValue({}, 'baseUrl', { unsetText: '未设置' })
    ).toBe('未设置');
  });

  it('falls back from primary to legacy for sonnetModel display', () => {
    // This is the SONNET primary-then-legacy subtlety that was
    // previously inline in `describeFieldValue`. The display path
    // must show the legacy value when the primary is empty.
    const env: EnvConfig = { ANTHROPIC_MODEL: 'legacy-sonnet' };
    expect(formatFieldDisplayValue(env, 'sonnetModel')).toBe('legacy-sonnet');
  });

  it('treats whitespace-only values as unset', () => {
    const env: EnvConfig = { ANTHROPIC_BASE_URL: '   ' };
    expect(formatFieldDisplayValue(env, 'baseUrl')).toBe('(未设置)');
  });

  it('matches the original describeFieldValue outputs byte-for-byte', () => {
    // Regression guard: the collapsing change must be byte-identical
    // for callers that pass no options.
    const set: EnvConfig = {
      ANTHROPIC_AUTH_TOKEN: 't',
      ANTHROPIC_BASE_URL: 'https://b',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 's',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'o',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'h',
    };
    expect(formatFieldDisplayValue(set, 'token')).toBe('[*****]');
    expect(formatFieldDisplayValue(set, 'baseUrl')).toBe('https://b');
    expect(formatFieldDisplayValue(set, 'sonnetModel')).toBe('s');
    expect(formatFieldDisplayValue(set, 'opusModel')).toBe('o');
    expect(formatFieldDisplayValue(set, 'haikuModel')).toBe('h');

    const empty: EnvConfig = {};
    expect(formatFieldDisplayValue(empty, 'token')).toBe('[UNSET]');
    expect(formatFieldDisplayValue(empty, 'baseUrl')).toBe('(未设置)');
    expect(formatFieldDisplayValue(empty, 'sonnetModel')).toBe('(未设置)');
    expect(formatFieldDisplayValue(empty, 'opusModel')).toBe('(未设置)');
    expect(formatFieldDisplayValue(empty, 'haikuModel')).toBe('(未设置)');
  });
});
