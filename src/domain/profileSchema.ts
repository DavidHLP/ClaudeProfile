/**
 * Profile Schema — the canonical shape of a profile's first-class fields.
 *
 * Why this module exists
 * ----------------------
 * Before this module, the concept "a profile has 5 first-class fields"
 * (base URL, auth token, sonnet/opus/haiku models) was implicit and
 * scattered across the codebase:
 *
 *   - `templates/providers.ts#materializeProfile` knew the 5 ANTHROPIC_*
 *     env keys it had to write
 *   - `commands/edit.ts#FIELD_TO_ENV_KEYS` knew the same 5 fields, mapped
 *     to env keys
 *   - `commands/validate.ts#validateProfile` had 6 hardcoded checks for
 *     the 5 fields (SONNET's check is duplicated for `ANTHROPIC_MODEL`
 *     and `ANTHROPIC_DEFAULT_SONNET_MODEL`)
 *   - `presenters/envRenderer.ts#formatProfileDetail` had a 6-row inline
 *     `[[shortLabel, env.X || '未设置'], ...]` table for the same 5
 *     fields + 1 secondary
 *   - `utils/sensitiveKeys.ts#SENSITIVE_ENV_KEYS` knew the token field is
 *     sensitive
 *   - `ui/prompt.ts` and `commands/prompts.ts` had 5 separate prompt
 *     methods (inputApiToken, inputBaseUrl, inputSonnetModel, ...) for
 *     the same 5 fields
 *   - `types/command.ts#EditableField` was a hardcoded union of 5
 *     strings
 *   - `types/command.ts#EDITABLE_FIELD_LABELS` was a hardcoded map
 *
 * Adding a 6th field ("reasoning effort"?) or renaming
 * `ANTHROPIC_AUTH_TOKEN` to something else required touching 8+ files
 * and running the risk of one of them drifting out of sync with the
 * others. The 6-row detail display and the 5-field editable UI were
 * never expressed in code as the same concept; they were two
 * manifestations of the same shape, each maintained by hand.
 *
 * The deletion test: if you delete this module, the 5-field shape
 * reappears across the callers above within a few lines of edit per
 * file. That's the signal a deep module is earning its keep.
 *
 * What this module owns
 * ---------------------
 *   1. The `ProfileField` union — the canonical list of 5 fields.
 *   2. Per-field specs (`PROFILE_FIELDS`) — env keys, label, required
 *      flag, sensitive flag, prompt-time validator.
 *   3. The display-row list (`PROFILE_DISPLAY_ROWS`) — the 6-row
 *      per-profile detail panel, derived from the field specs.
 *   4. Pure functions over the field/env shape:
 *        - `applyField(env, field, value)` — apply a field change
 *        - `getFieldValue(env, field)` — read the primary env value
 *        - `defaultFieldValue(env, field, fallback)` — resolve a default
 *          for the field from a base env (used to seed the create prompt)
 *        - `validateProfile(env)` — produce validation issues
 *        - `profileDetailRows(env, mask)` — produce the 6 display rows
 *
 * Dependency category
 * -------------------
 * In-process (per `DEEPENING.md`): no I/O, no DI, pure functions. The
 * deepened module is the *test surface* for the field/env shape — every
 * caller goes through it, every test for the shape lives in
 * `tests/profileSchema.test.ts`.
 *
 * Locality: every "what does it mean to have a field" decision lives
 * here. Adding a field, renaming an env key, flipping a required flag,
 * or changing the display order touches one file plus its tests.
 */
import { EnvConfig } from '../types/index.js';

/**
 * Canonical list of profile fields. Order in this union is the order
 * they appear in the detail panel and the validate-output walk.
 */
export type ProfileField =
  | 'baseUrl'
  | 'token'
  | 'sonnetModel'
  | 'opusModel'
  | 'haikuModel';

/**
 * Canonical display order. Anything that walks the fields for display
 * (detail panel, validate, apply-all) should iterate this list, not
 * `Object.keys(PROFILE_FIELDS)`, so the order is stable across JS
 * engines and intentional.
 */
export const PROFILE_FIELDS_ORDER: readonly ProfileField[] = [
  'baseUrl',
  'token',
  'sonnetModel',
  'opusModel',
  'haikuModel',
];

export interface FieldSpec {
  readonly id: ProfileField;
  /** Human-readable label, e.g. "API Token" — used in interactive prompts. */
  readonly label: string;
  /** Env keys controlled by this field, primary first. */
  readonly envKeys: readonly string[];
  /** Whether an empty value is an error (token/baseUrl) or a warning (model slots). */
  readonly required: boolean;
  /** Whether values should be masked in display / redacted from logs. */
  readonly sensitive: boolean;
  /**
   * Prompt-time validator: returns `true` for accept, or a Chinese
   * error message for reject. Mirrors the rules previously hardcoded
   * in `ui/prompt.ts#input*` so a single schema entry can back both
   * the prompt and the schema.
   */
  readonly validateInput: (value: string) => true | string;
}

const URL_PREFIX_RE = /^https?:\/\//;

export const PROFILE_FIELDS: Readonly<Record<ProfileField, FieldSpec>> = {
  baseUrl: {
    id: 'baseUrl',
    label: 'API Base URL',
    envKeys: ['ANTHROPIC_BASE_URL'],
    required: true,
    sensitive: false,
    validateInput: (value) => {
      const trimmed = value.trim();
      if (!trimmed) return 'URL 不能为空';
      if (!URL_PREFIX_RE.test(trimmed)) {
        return 'URL 必须以 http:// 或 https:// 开头';
      }
      return true;
    },
  },
  token: {
    id: 'token',
    label: 'API Token',
    envKeys: ['ANTHROPIC_AUTH_TOKEN'],
    required: true,
    sensitive: true,
    validateInput: (value) => (!value.trim() ? 'Token 不能为空' : true),
  },
  sonnetModel: {
    id: 'sonnetModel',
    label: 'SONNET 模型',
    // Primary first: `ANTHROPIC_DEFAULT_SONNET_MODEL` is the slot
    // override; `ANTHROPIC_MODEL` is the legacy "default model" key
    // that the create/edit paths keep in sync. `applyField` writes
    // both; `getFieldValue` reads the primary.
    envKeys: ['ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_MODEL'],
    required: false,
    sensitive: false,
    validateInput: (value) => (!value.trim() ? '模型名称不能为空' : true),
  },
  opusModel: {
    id: 'opusModel',
    label: 'OPUS 模型',
    envKeys: ['ANTHROPIC_DEFAULT_OPUS_MODEL'],
    required: false,
    sensitive: false,
    validateInput: (value) => (!value.trim() ? '模型名称不能为空' : true),
  },
  haikuModel: {
    id: 'haikuModel',
    label: 'HAIKU 模型',
    envKeys: ['ANTHROPIC_DEFAULT_HAIKU_MODEL'],
    required: false,
    sensitive: false,
    validateInput: (value) => (!value.trim() ? '模型名称不能为空' : true),
  },
};

/**
 * The 6-row per-profile detail panel. Derived from `PROFILE_FIELDS` so
 * a single field with 2 env keys (e.g. SONNET) gets 2 display rows.
 *
 * Order is: BASE URL, TOKEN, MODEL (legacy), SONNET (slot override),
 * OPUS, HAIKU. This matches the original `formatProfileDetail` order
 * 1:1, so the visible UX is unchanged.
 */
export interface DisplayRowSpec {
  readonly field: ProfileField;
  readonly envKey: string;
  /** Short uppercase label, e.g. "BASE URL", "TOKEN". */
  readonly shortLabel: string;
}

export const PROFILE_DISPLAY_ROWS: readonly DisplayRowSpec[] = [
  { field: 'baseUrl', envKey: 'ANTHROPIC_BASE_URL', shortLabel: 'BASE URL' },
  { field: 'token', envKey: 'ANTHROPIC_AUTH_TOKEN', shortLabel: 'TOKEN' },
  { field: 'sonnetModel', envKey: 'ANTHROPIC_MODEL', shortLabel: 'MODEL' },
  { field: 'sonnetModel', envKey: 'ANTHROPIC_DEFAULT_SONNET_MODEL', shortLabel: 'SONNET' },
  { field: 'opusModel', envKey: 'ANTHROPIC_DEFAULT_OPUS_MODEL', shortLabel: 'OPUS' },
  { field: 'haikuModel', envKey: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', shortLabel: 'HAIKU' },
];

/**
 * Read the primary env value for a field. For SONNET, this is
 * `ANTHROPIC_DEFAULT_SONNET_MODEL`; the legacy `ANTHROPIC_MODEL` is
 * only used as a write-side secondary.
 */
export function getFieldValue(env: EnvConfig, field: ProfileField): string | undefined {
  const primaryKey = PROFILE_FIELDS[field].envKeys[0];
  return primaryKey ? env[primaryKey] : undefined;
}

/**
 * Resolve the default value for a field given a base env (e.g. a
 * provider's `envTemplate`) and a provider-level fallback. Returns
 * the base env's primary env value for the field if it is set;
 * otherwise the fallback (which is also returned when the field
 * has no primary env key, a theoretical case today but possible
 * if a future field is purely synthetic).
 *
 * Single source of truth for "what's the default for field X when
 * building a new profile from a template?" — replaces the previous
 * `provider.envTemplate.ANTHROPIC_DEFAULT_SONNET_MODEL ||
 * provider.defaultModel` dance in `createCommandInteractive`.
 *
 * Pure function — no I/O, no DI. The interface is the test surface.
 */
export function defaultFieldValue(
  env: Partial<EnvConfig>,
  field: ProfileField,
  fallback?: string
): string | undefined {
  const primaryKey = PROFILE_FIELDS[field].envKeys[0];
  if (primaryKey && env[primaryKey]) {
    return env[primaryKey];
  }
  return fallback;
}

/**
 * Apply a field change to an env, returning a new env (immutable).
 * Writes to every env key in the field's `envKeys` list, so SONNET
 * updates both `ANTHROPIC_DEFAULT_SONNET_MODEL` and the legacy
 * `ANTHROPIC_MODEL` in lock-step.
 */
export function applyField(
  env: EnvConfig,
  field: ProfileField,
  value: string
): EnvConfig {
  const spec = PROFILE_FIELDS[field];
  const next: EnvConfig = { ...env };
  for (const key of spec.envKeys) {
    next[key] = value;
  }
  return next;
}

export interface ValidationIssue {
  readonly field: ProfileField;
  /** The specific env key that triggered the issue (e.g. ANTHROPIC_MODEL). */
  readonly envKey: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

/**
 * Validate an env against the profile schema. Returns one issue per
 * missing/empty env key (preserving the original behaviour where SONNET
 * produces two warnings when both `ANTHROPIC_MODEL` and
 * `ANTHROPIC_DEFAULT_SONNET_MODEL` are empty), plus the URL-format
 * check for `baseUrl`.
 *
 * Pure function — no I/O, no DI. The interface is the test surface.
 */
export function validateProfile(env: EnvConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const fieldId of PROFILE_FIELDS_ORDER) {
    const spec = PROFILE_FIELDS[fieldId];
    const emptyKeys = spec.envKeys.filter((k) => !env[k] || !env[k]!.trim());

    if (emptyKeys.length === spec.envKeys.length) {
      // All env keys for this field are empty.
      if (spec.required) {
        issues.push({
          field: fieldId,
          envKey: spec.envKeys[0]!,
          message: `${spec.envKeys[0]} 为空`,
          severity: 'error',
        });
      } else {
        for (const key of emptyKeys) {
          issues.push({
            field: fieldId,
            envKey: key,
            message: `${key} 未设置`,
            severity: 'warning',
          });
        }
      }
    }

    if (fieldId === 'baseUrl') {
      const value = env.ANTHROPIC_BASE_URL;
      if (value) {
        try {
          const url = new URL(value);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            issues.push({
              field: fieldId,
              envKey: 'ANTHROPIC_BASE_URL',
              message: 'URL 格式无效（仅支持 http/https）',
              severity: 'error',
            });
          }
        } catch {
          issues.push({
            field: fieldId,
            envKey: 'ANTHROPIC_BASE_URL',
            message: 'URL 格式无效',
            severity: 'error',
          });
        }
      }
    }
  }

  return issues;
}

export interface DetailRow {
  readonly envKey: string;
  readonly shortLabel: string;
  /** Already masked when the field is sensitive and the value is set. */
  readonly displayValue: string;
  /** `true` if a non-empty value is present, `false` if '未设置'. */
  readonly isSet: boolean;
}

/**
 * Produce the 6 detail rows for a profile's env. Sensitive fields
 * (`token`) are masked via the supplied `mask` function (so the caller
 * controls the masking policy; the schema stays pure). Empty values
 * render as '未设置' for non-sensitive fields and '已设置/未设置' for
 * the token field (matches the original `formatProfileDetail`).
 */
export function profileDetailRows(
  env: EnvConfig,
  mask: (key: string, value: string) => string = (_, v) => v
): DetailRow[] {
  const rows: DetailRow[] = [];
  for (const rowSpec of PROFILE_DISPLAY_ROWS) {
    const value = env[rowSpec.envKey];
    const isSet = !!value && value.trim().length > 0;
    let displayValue: string;
    if (!isSet) {
      // Token field convention: show "已设置/未设置" rather than the
      // actual value or the literal "未设置". This matches the
      // pre-schema behaviour in `formatProfileDetail`.
      if (rowSpec.field === 'token') {
        displayValue = '未设置';
      } else {
        displayValue = '未设置';
      }
    } else if (rowSpec.field === 'token') {
      displayValue = '已设置';
    } else if (PROFILE_FIELDS[rowSpec.field].sensitive) {
      displayValue = mask(rowSpec.envKey, value!);
    } else {
      displayValue = value!;
    }
    rows.push({
      envKey: rowSpec.envKey,
      shortLabel: rowSpec.shortLabel,
      displayValue,
      isSet,
    });
  }
  return rows;
}

/**
 * Default mask policy used by the detail panel. Mirrors the rules in
 * `utils/sensitiveKeys.ts` (show first 4 chars + `****` for tokens
 * longer than 4 chars; `****` for shorter ones) but lives here so the
 * detail panel doesn't have to import from `utils/`.
 *
 * The `envKey` parameter lets future sensitive fields (e.g. an
 * API-key-shaped field) reuse the same masking rule.
 */
export function maskProfileValue(envKey: string, value: string): string {
  if (value.length <= 4) return '****';
  return value.slice(0, 4) + '****';
}

/**
 * The set of env keys considered sensitive, derived from
 * `PROFILE_FIELDS`. This replaces the hand-maintained
 * `SENSITIVE_ENV_KEYS` constant in `utils/sensitiveKeys.ts` so that
 * adding a new sensitive field only requires flipping the
 * `sensitive` flag in its spec.
 */
export const SENSITIVE_ENV_KEYS: ReadonlySet<string> = new Set(
  Object.values(PROFILE_FIELDS).flatMap((spec) =>
    spec.sensitive ? spec.envKeys : []
  )
);
