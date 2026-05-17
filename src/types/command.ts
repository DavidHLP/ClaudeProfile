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
}

export interface DeleteProfileInput {
  profileName: string;
}

export type CommandResult =
  | { success: true; output: string }
  | { success: false; error: string; wasCancelled?: boolean };
