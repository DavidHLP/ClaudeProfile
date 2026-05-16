import { EnvConfig, Profile } from './index.js';

export interface CreateProfileInput {
  providerId: string;
  profileName: string;
  token: string;
  baseUrl: string;
  sonnetModel: string;
  opusModel: string;
  haikuModel: string;
}

export interface EditProfileInput {
  profileName: string;
  token: string;
  baseUrl: string;
  sonnetModel: string;
  opusModel: string;
  haikuModel: string;
}

export interface SwitchProfileInput {
  profileName: string;
}

export interface DeleteProfileInput {
  profileName: string;
}

export interface ListProfilesInput {
  // No input needed for list
}

export type CommandResult = {
  success: true;
  output: string;
} | {
  success: false;
  error: string;
  wasCancelled?: boolean;
};
