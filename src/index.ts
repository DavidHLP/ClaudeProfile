/**
 * Public API surface for `@claude-code/claude-profile`.
 *
 * Two groups of exports:
 *   1. Commands and command inputs (legacy signatures, preserved for
 *      the bin and any external embedders).
 *   2. Seams — `CommandContext`, `Prompts`, and the default-context
 *      factory. Embedders wanting to test or extend should depend on
 *      these rather than on the module-level singletons.
 */

// ── Commands ────────────────────────────────────────────────────────────
export { createCommand, createCommandInteractive } from './commands/create.js';
export { editCommand, editCommandInteractive } from './commands/edit.js';
export { deleteCommand, deleteCommandInteractive } from './commands/delete.js';
export { listCommand } from './commands/list.js';
export { switchCommand, switchCommandInteractive } from './commands/switch.js';
export { exportCommand, exportCurrentCommand, exportFileCommand, exportCurrentFileCommand, type ExportProfileInput } from './commands/export.js';
export { importFileCommand, importFileCommandInteractive } from './commands/import.js';
export { renameCommand, renameCommandInteractive } from './commands/rename.js';
export { duplicateCommand, duplicateCommandInteractive } from './commands/duplicate.js';
export { backupCommand, restoreCommand, restoreCommandInteractive } from './commands/backup.js';
export { initCommand } from './commands/init.js';
export { validateCommand, type ValidateOptions } from './commands/validate.js';
export { completionCommand, type CompletionOptions } from './commands/completion.js';
export { runProfileCommand, execProfileCommand, type RunProfileInput } from './commands/run.js';
export { doctorCommand } from './commands/doctor.js';
export { statusCommand } from './commands/status.js';

// ── Command input/output types ──────────────────────────────────────────
export type {
  CreateProfileInput,
  EditProfileInput,
  EditableField,
  ProfileCredentialsInput,
  SwitchProfileInput,
  DeleteProfileInput,
  RenameProfileInput,
  DuplicateProfileInput,
  ImportProfileInput,
  BackupConfigInput,
  RestoreConfigInput,
  ExportFileInput,
  CommandResult,
} from './types/command.js';
export { EDITABLE_FIELD_LABELS } from './types/command.js';

// ── Service + presenter interfaces ──────────────────────────────────────
export type { ProfileService } from './services/profileService.js';
export type { EnvPresenter } from './presenters/envRenderer.js';

// ── Default singletons (back-compat) ────────────────────────────────────
export { ProfileServiceImpl, profileService } from './services/profileService.js';
export { envPresenter } from './presenters/envRenderer.js';
export {
  buildExportCommands,
  buildSwitchCommands,
  buildExportJson,
  buildSwitchJson,
  type EnvJsonOutput,
} from './engine/envDiff.js';

// ── Backup port (filesystem in prod, in-memory in tests) ────────────
export type { BackupStore, BackupEntry } from './services/backupStore.js';
export { backupStore } from './services/backupStore.js';
export { FileSystemBackupStore } from './services/fileSystemBackupStore.js';
export { InMemoryBackupStore } from './services/inMemoryBackupStore.js';

// ── Stores ──────────────────────────────────────────────────────────────
export type { ConfigStore } from './config/configStore.js';
export { FileSystemConfigStore } from './config/fileSystemConfigStore.js';
export { InMemoryConfigStore } from './config/inMemoryConfigStore.js';

// ── CommandContext seam (preferred entry point for embedders) ──────────
export {
  createDefaultContext,
  createTestContext,
  noopPrompts,
  realPrompts,
  type CommandContext,
  type TestContextOverrides,
  type Prompts,
} from './commands/context.js';

// ── Profile materialization (template → env merge) ───
export { materializeProfile } from './templates/providers.js';

// ── Profile schema (canonical shape of first-class fields) ───
export {
  PROFILE_FIELDS,
  PROFILE_FIELDS_ORDER,
  PROFILE_DISPLAY_ROWS,
  SENSITIVE_ENV_KEYS,
  applyField,
  getFieldValue,
  getEffectiveFieldValue,
  defaultFieldValue,
  formatFieldDisplayValue,
  validateProfile,
  profileDetailRows,
  maskProfileValue,
  type ProfileField,
  type FieldSpec,
  type DisplayRowSpec,
  type FieldDisplayOptions,
  type ValidationIssue,
  type DetailRow,
} from './domain/profileSchema.js';

// ── Shell env extraction (canonical "Claude env key" filter) ───
export {
  CLAUDE_ENV_KEY_PREFIXES,
  extractClaudeShellEnv,
} from './domain/shellEnv.js';

// ── Interactive session (select / confirm / execute flow) ───
export {
  runSelectableAction,
  runProfileAction,
  CancelledError,
  type SelectableActionFlow,
  type SelectableConfirmMessage,
  type ProfileActionFlow,
  type ConfirmMessage,
} from './commands/interactiveSession.js';
