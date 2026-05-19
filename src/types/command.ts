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

export type EditableField =
  | 'token'
  | 'baseUrl'
  | 'sonnetModel'
  | 'opusModel'
  | 'haikuModel';

export const EDITABLE_FIELD_LABELS: Record<EditableField, string> = {
  token: 'API Token',
  baseUrl: 'API Base URL',
  sonnetModel: 'SONNET 模型',
  opusModel: 'OPUS 模型',
  haikuModel: 'HAIKU 模型',
};

export interface EditProfileInput {
  profileName: string;
  field: EditableField;
  value: string;
}

export interface SwitchProfileInput {
  profileName: string;
  syncToSettings?: boolean;
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
