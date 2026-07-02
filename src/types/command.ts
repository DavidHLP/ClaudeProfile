export interface ProfileCredentialsInput {
  token: string;
  baseUrl: string;
  sonnetModel: string;
  opusModel: string;
  haikuModel: string;
}

export interface CreateProfileInput extends ProfileCredentialsInput {
  providerId: string;
  profileName: string;
}

// `EditableField` is a back-compat alias for the schema's
// `ProfileField` union. The schema (in `domain/profileSchema.ts`) is
// the single source of truth for which fields are editable and what
// they're labelled. New code should import `ProfileField` directly
// from the schema; the alias is preserved so embedders depending on
// `EditableField` from this module keep working.
export type { ProfileField, FieldSpec } from '../domain/profileSchema.js';
export type EditableField = import('../domain/profileSchema.js').ProfileField;

import { PROFILE_FIELDS } from '../domain/profileSchema.js';

export const EDITABLE_FIELD_LABELS: Record<EditableField, string> = Object.fromEntries(
  Object.values(PROFILE_FIELDS).map((spec) => [spec.id, spec.label])
) as Record<EditableField, string>;

export interface EditProfileInput {
  profileName: string;
  field: EditableField;
  value: string;
}

export interface SwitchProfileInput {
  profileName: string;
  dryRun?: boolean;
}

export interface DeleteProfileInput {
  profileName: string;
  yes?: boolean;
}

export interface RenameProfileInput {
  oldName: string;
  newName: string;
}

export interface DuplicateProfileInput {
  sourceName: string;
  newName: string;
}

export interface ExportFileInput {
  profileName: string;
  outputPath?: string;
  format?: 'json' | 'yaml';
}

export interface ImportProfileInput {
  inputPath: string;
  format?: 'json' | 'yaml';
  profileName?: string;
  force?: boolean;
}

export interface BackupConfigInput {
  outputPath?: string;
}

export interface RestoreConfigInput {
  backupPath?: string;
}

export type CommandResult =
  | { success: true; output: string }
  | { success: false; error: string; wasCancelled?: boolean };
