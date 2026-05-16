import type { Profile } from '../types/index.js';

export interface ConfigStore {
  listProfiles(): Profile[];
  getProfile(name: string): Profile | null;
  saveProfile(profile: Profile): void;
  deleteProfile(name: string): boolean;
  getCurrentProfile(): string | null;
  setCurrentProfile(name: string): void;
  getPreviousProfile(): string | null;
  setPreviousProfile(name: string | null): void;
  getStoreLocation(): string | null;
}
