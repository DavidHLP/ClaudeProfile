# Code Review: feat/security-and-sync-fixes

**Reviewed**: 2026-05-24
**Author**: DavidHLP
**Branch**: feat/security-and-sync-fixes → main
**Decision**: APPROVE (with comments)

## Summary
This branch adds security hardening (shell safety, tar validation, input validation, file permissions) and new features (run/exec, sync, doctor, status commands). All CRITICAL and HIGH issues from the initial review have been fixed. Remaining MEDIUM/LOW items are non-blocking improvements.

## Findings

### CRITICAL

#### C1: Interactive `eval` bypasses `_claude_profile_safe_eval`
- **File**: `src/commands/init.ts:104`
- The interactive switch path still uses bare `eval "$export_output"` instead of `_claude_profile_safe_eval <<< "$export_output"`. The non-interactive path (line 89) was correctly fixed. This is the exact same vulnerability the branch aims to fix — an attacker who controls a profile's env values can inject arbitrary shell commands through the interactive path.
- **Fix**: Replace `eval "$export_output"` with `_claude_profile_safe_eval <<< "$export_output"` on line 104.

### HIGH

#### H1: `SwitchProfileInput.scope` typed as `string`, not `SettingsScope`
- **File**: `src/types/command.ts:38`
- `scope?: string` allows any string to pass the type system. `switchCommand` compensates with `isValidSettingsScope()` at runtime, but the type should enforce this at compile time. Same issue in `SyncProfileInput` (sync.ts:12).
- **Fix**: Change to `scope?: SettingsScope` and import the type.

#### H2: `parsed.env as Record<string, unknown>` bypasses type guard
- **File**: `src/commands/import.ts:68`
- The `validateImportedProfile` type guard claims `data is Profile`, but doesn't validate that env values are strings. The `as Record<string, unknown>` assertion is needed because the guard is incomplete. A malicious YAML file with nested objects as env values would pass the type guard but fail at `validateEnvValue()`.
- **Fix**: Extend `validateImportedProfile` to check that all `env` values are strings, then use the guard-narrowed type directly without `as`.

#### H3: Backup directory missing restrictive permissions
- **File**: `src/commands/backup.ts:21`
- `mkdirSync(dir, { recursive: true })` doesn't set `mode: 0o700`, inconsistent with `fileSystemConfigStore.ts` and `claudeSettingsStore.ts` which both use `0o700`. Backup directory contains sensitive token archives.
- **Fix**: Add `mode: 0o700` to the `mkdirSync` call.

#### H4: `env as NodeJS.ProcessEnv` unsafe cast in `run.ts`
- **File**: `src/commands/run.ts:44`
- The merged env object is cast to `NodeJS.ProcessEnv`. While the shapes are compatible, the assertion hides potential `undefined` values from `process.env` spreading.
- **Fix**: Filter out `undefined` values explicitly or use a type-compatible construction.

#### H5: `YAML.parse` without schema restriction enables prototype pollution
- **File**: `src/commands/import.ts:20`
- Default YAML parsing supports `!!js/function` and `__proto__` keys. A crafted YAML file could pollute `Object.prototype`.
- **Fix**: Use `YAML.parse(content, { schema: 'core' })` or `{ schema: 'json' }` to disable custom tags.

### MEDIUM

#### M1: Dead code — `scope` in `SyncOptions`
- **File**: `src/services/settingsSyncService.ts:10`
- `SyncOptions.scope` is declared but never read by `syncOnSwitch`. Scope is handled via `createSettingsSyncService(scope)`.
- **Fix**: Remove `scope` from `SyncOptions`.

#### M2: Duplicated diff logic in `envPresenter.ts`
- **File**: `src/presenters/envPresenter.ts:31-119`
- `buildExportJson`/`buildExportCommands` share identical iteration logic. `buildSwitchJson`/`buildSwitchCommands` share identical diff computation. Only output format differs.
- **Fix**: Extract `computeEnvDiff(oldEnv, newEnv)` returning `{ set, unset }`, then derive all four functions from it.

#### M3: Hardcoded `SENSITIVE_KEYS` in `run.ts`
- **File**: `src/commands/run.ts:29`
- Local `Set(['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'])` duplicates masking logic also in `status.ts`. Should be a shared constant.
- **Fix**: Extract `SENSITIVE_ENV_KEYS` constant and share across `run.ts` and `status.ts`.

#### M4: Missing `tests/sync.test.ts`
- `syncCommand` is a core new feature with no dedicated test file.
- **Fix**: Create `tests/sync.test.ts` covering: success, invalid scope, missing profile, dry-run, sync failure warning.

#### M5: New public API not exported from `index.ts`
- `runProfileCommand`, `syncCommand`, `doctorCommand`, `statusCommand`, `shellQuote`, `validateEnvKeyOrThrow`, `ValidationError`, `SettingsScope`, etc. are not exported.
- **Fix**: Export new command functions at minimum.

#### M6: `getBackupDir()` uses `~` fallback instead of `homedir()`
- **File**: `src/commands/backup.ts:14`
- Falls back to literal `~` if HOME/USERPROFILE are unset, which won't expand in fs paths. Rest of project uses `homedir()` from `os`.
- **Fix**: Use `homedir()` from `os`.

#### M7: `node -e` fallback uses `===` as IFS delimiter
- **File**: `src/commands/init.ts:56`
- `IFS=== read -r key val` could mis-split if a value contains `===`. The probability is low but the delimiter is not unambiguous.
- **Fix**: Use a more unique delimiter like `$'\x01'` or a UUID-like separator.

#### M8: Tar extraction filter may miss symlink type codes
- **File**: `src/commands/backup.ts:73-82`
- Checks for string type `'SymbolicLink'`/`'Link'`, but node-tar may also emit numeric codes (`'2'` for symlink, `'1'` for hardlink).
- **Fix**: Also check for numeric type codes `entry.type === '2'` and `entry.type === '1'`.

#### M9: `JSON.parse` in `doctor.ts` returns `any`
- **File**: `src/commands/doctor.ts:114`
- `JSON.parse(content)` returns `any`; accessing `parsed.env` has no type safety.
- **Fix**: Type the parsed result or add runtime validation.

### LOW

#### L1: `validation.ts` error messages in English, `shellSafety.ts` in Chinese
- **File**: `src/utils/validation.ts`, `src/utils/shellSafety.ts`
- Inconsistent user-facing language. `ValidationError` messages propagate to CLI output.

#### L2: `validateToken` is too permissive (min length 3)
- **File**: `src/utils/validation.ts:96-111`
- Allows nearly any string as a token.

#### L3: `validateEnvValue` rejects newlines unconditionally
- **File**: `src/utils/validation.ts:71-73`
- May block legitimate multi-line values (certificates). Shell export path can't handle them, but JSON path could.

#### L4: Redundant `existsSync` checks (TOCTOU pattern)
- **Files**: `fileSystemConfigStore.ts`, `claudeSettingsStore.ts`, `backup.ts`, `doctor.ts`
- Multiple `existsSync` then `readFileSync`/`statSync` patterns. Should use try/catch on the operation directly.

#### L5: `bin/claude-profile.js` is untyped JS
- Accesses `result.output`/`result.error` without discriminated union guards (though runtime behavior is correct).

## Validation Results

| Check | Result |
|-------|--------|
| Type check (`tsc --noEmit`) | Pass |
| Tests (`vitest run`) | Pass (223/223) |
| Build (`npm run build`) | Pass |

## Files Reviewed

| File | Change Type |
|------|------------|
| `bin/claude-profile.js` | Modified |
| `src/commands/backup.ts` | Modified |
| `src/commands/export.ts` | Modified |
| `src/commands/import.ts` | Modified |
| `src/commands/init.ts` | Modified |
| `src/commands/switch.ts` | Modified |
| `src/commands/doctor.ts` | Added |
| `src/commands/run.ts` | Added |
| `src/commands/status.ts` | Added |
| `src/commands/sync.ts` | Added |
| `src/config/claudeSettingsStore.ts` | Modified |
| `src/config/fileSystemConfigStore.ts` | Modified |
| `src/presenters/envPresenter.ts` | Modified |
| `src/services/settingsSyncService.ts` | Modified |
| `src/types/command.ts` | Modified |
| `src/utils/shellSafety.ts` | Added |
| `src/utils/validation.ts` | Added |
| `tests/commands.test.ts` | Modified |
| `tests/connectivity.test.ts` | Modified |
| `tests/envPresenter.test.ts` | Modified |
| `tests/doctor.test.ts` | Added |
| `tests/run.test.ts` | Added |
| `tests/shellSafety.test.ts` | Added |
| `tests/status.test.ts` | Added |