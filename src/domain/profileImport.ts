/**
 * Profile Import — the canonical "parse + validate an imported profile"
 * pipeline.
 *
 * Why this module exists
 * ----------------------
 * Before this module, the import path in `commands/import.ts` mixed four
 * concerns in 30+ inline lines:
 *
 *   1. Format detection (`.json` / `.yaml` / `.yml` extension or
 *      explicit `format` option)
 *   2. Content parsing (JSON.parse, YAML.parse with the `core` schema)
 *   3. Shape validation (the file must have a string `name` and an
 *      `env` object)
 *   4. Per-field validation (profile name regex, env key POSIX, env
 *      value string-with-no-newlines)
 *
 * Each step's error had its own throw-and-rewrap dance, and the same
 * `validateProfileName` / `validateEnvKey` / `validateEnvValue` helpers
 * in `utils/validation.ts` were only used by this one caller. The
 * helpers themselves were wrapped in a `ValidationError` class that
 * carried no information not already on `AppError` (the callers
 * immediately unpacked the message and code and re-wrapped into a
 * fresh `AppError`).
 *
 * After this module:
 *   - The whole "what does a valid import look like?" question lives
 *     in one pure function. The command is a 5-step shell: read
 *     file, parse, check exists, save, present.
 *   - The `utils/validation.ts` file is gone — its 4 dead exports
 *     (`validateUrl`, `validateToken`, `validateProfileUrl`,
 *     `validateProfileToken`) and its unused `ProfileValidationResult`
 *     interface were never called outside their own test file. The 3
 *     used exports moved here as internal helpers.
 *   - The `ProfileImportError` class is the typed error the rest of
 *     the codebase already understands (it extends `AppError`).
 *
 * The deletion test: if you delete this module, the import pipeline
 * reappears in `commands/import.ts` within 30 lines and the three
 * `validate*` helpers reappear in `utils/validation.ts`. Keeping the
 * import path in one place means a new format (e.g. `.toml`) is one
 * branch in `detectImportFormat` and one branch in the parser loop,
 * not 30 lines of spread.
 *
 * Locality: every "what does a valid import look like" decision
 * (parse rules, validation rules, error messages, error codes) lives
 * here. The command layer is reduced to I/O orchestration.
 *
 * Dependency category
 * -------------------
 * In-process (per `DEEPENING.md`): no I/O, no DI, pure functions. The
 * primitives are the test surface for the import shape; every caller
 * goes through them; every test for the import shape lives in
 * `tests/profileImport.test.ts`.
 */
import { AppError } from '../errors.js';
import { Profile } from '../types/index.js';
import { isValidEnvKey } from '../utils/shellSafety.js';
import * as YAML from 'yaml';

/** The on-disk format an import source can take. */
export type ImportFormat = 'json' | 'yaml';

/**
 * Typed error for the import pipeline. Extends `AppError` so the
 * command layer's `runCommand` wrapper (which checks `err instanceof
 * AppError`) catches it without any special-casing.
 */
export class ProfileImportError extends AppError {
  constructor(
    code: string,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message, code, context);
    this.name = 'ProfileImportError';
  }
}

/**
 * Detect the on-disk format from a file path, honoring an explicit
 * override. Pure: takes a path and an optional override, returns
 * `'json' | 'yaml'`. The override wins when present (so the
 * `--format json` CLI flag is honored regardless of extension);
 * otherwise the path extension is the source of truth.
 *
 * `.yml` is treated as `yaml` to match the YAML community convention.
 * Anything else (including no extension) defaults to `json` — the
 * pre-refactor behavior was "anything not .yaml/.yml is JSON."
 */
export function detectImportFormat(
  filePath: string,
  override?: ImportFormat
): ImportFormat {
  if (override) {
    return override;
  }
  const ext = filePath.toLowerCase().split('.').pop();
  return ext === 'yaml' || ext === 'yml' ? 'yaml' : 'json';
}

interface ProfileShape {
  name: string;
  description?: string;
  env: Record<string, unknown>;
}

function isProfileShape(raw: unknown): raw is ProfileShape {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== 'string' || !obj.name.trim()) {
    return false;
  }
  if (typeof obj.env !== 'object' || obj.env === null) {
    return false;
  }
  return true;
}

// Profile-name policy: letters, numbers, hyphens, underscores. Matches
// the filesystem filename constraint (the profile is persisted as
// `<name>.json`) and the shell-completion script's filename filter.
const PROFILE_NAME_REGEX = /^[a-zA-Z0-9-_]+$/;

/**
 * The single import primitive. Takes the raw file content, the
 * resolved format, and an optional name override, and returns a
 * fully-validated `Profile`. Throws `ProfileImportError` on any
 * failure (bad format, missing name, bad env key, bad env value).
 *
 * Pure function — no I/O, no DI, no class. The interface is the
 * test surface.
 *
 * Validation order is load-bearing:
 *   1. Parse the content (JSON.parse / YAML.parse) — surfaces
 *      `INVALID_FORMAT`.
 *   2. Check the shape (has string `name`, has `env` object) —
 *      surfaces `INVALID_PROFILE_SCHEMA`.
 *   3. Resolve the profile name (override or file's `name`) and
 *      validate the regex — surfaces `NAME_REQUIRED` / `NAME_INVALID`.
 *   4. Validate every env key (POSIX) and value (string, no
 *      newlines, no null bytes) — surfaces `ENV_KEY_INVALID` /
 *      `ENV_VALUE_*`. Stops at the first bad key (matching the
 *      pre-refactor `commands/import.ts` behavior, which threw on
 *      the first bad key as well).
 *
 * The returned profile is a defensive copy of the env (so a caller
 * mutating the result does not mutate the parsed JSON object).
 */
export function parseImportedProfile(
  content: string,
  format: ImportFormat,
  profileNameOverride?: string
): Profile {
  // 1. Parse content.
  let raw: unknown;
  try {
    raw = format === 'yaml'
      ? YAML.parse(content, { schema: 'core' })
      : JSON.parse(content);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ProfileImportError(
      'INVALID_FORMAT',
      `无效的 ${format.toUpperCase()} 格式: ${detail}`,
      { format }
    );
  }

  // 2. Validate shape.
  if (!isProfileShape(raw)) {
    throw new ProfileImportError(
      'INVALID_PROFILE_SCHEMA',
      '无效的配置文件结构: 缺少 name 或 env 字段'
    );
  }

  // 3. Resolve and validate the profile name.
  const profileName = (profileNameOverride?.trim() || raw.name).trim();
  if (!profileName) {
    throw new ProfileImportError('NAME_REQUIRED', 'Profile name is required');
  }
  if (!PROFILE_NAME_REGEX.test(profileName)) {
    throw new ProfileImportError(
      'NAME_INVALID',
      'Profile name can only contain letters, numbers, hyphens, and underscores',
      { profileName }
    );
  }

  // 4. Validate every env key + value.
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.env)) {
    if (!isValidEnvKey(key)) {
      throw new ProfileImportError(
        'ENV_KEY_INVALID',
        `Invalid env key: "${key}". Must match POSIX standard (^[A-Za-z_][A-Za-z0-9_]*$)`,
        { key }
      );
    }
    if (value === undefined || value === null) {
      throw new ProfileImportError(
        'ENV_VALUE_NULL',
        'Env value cannot be null or undefined',
        { key }
      );
    }
    if (typeof value !== 'string') {
      throw new ProfileImportError(
        'ENV_VALUE_TYPE',
        'Env value must be a string',
        { key, actualType: typeof value }
      );
    }
    if (value.includes('\0')) {
      throw new ProfileImportError(
        'ENV_VALUE_NULL',
        'Env value cannot contain null bytes',
        { key }
      );
    }
    if (value.includes('\n')) {
      throw new ProfileImportError(
        'ENV_VALUE_NEWLINE',
        'Env value cannot contain newlines (shell export does not support multi-line values)',
        { key }
      );
    }
    env[key] = value;
  }

  return {
    name: profileName,
    description: typeof raw.description === 'string' ? raw.description : '',
    env,
  };
}
