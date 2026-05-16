import { EnvConfig } from './index.js';

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

export interface EditProfileInput extends ProfileCredentialsInput {
  profileName: string;
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
