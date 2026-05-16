import { Profile } from '../types/index.js';
import { ConfigStore } from './configStore.js';

export class InMemoryConfigStore implements ConfigStore {
  private profiles = new Map<string, Profile>();
  private currentProfile: string | null = null;
  private previousProfile: string | null = null;

  listProfiles(): Profile[] {
    return Array.from(this.profiles.values());
  }

  getProfile(name: string): Profile | null {
    return this.profiles.get(name) ?? null;
  }

  saveProfile(profile: Profile): void {
    this.profiles.set(profile.name, profile);
  }

  deleteProfile(name: string): boolean {
    return this.profiles.delete(name);
  }

  getCurrentProfile(): string | null {
    return this.currentProfile;
  }

  setCurrentProfile(name: string): void {
    this.currentProfile = name;
  }

  getPreviousProfile(): string | null {
    return this.previousProfile;
  }

  setPreviousProfile(name: string | null): void {
    this.previousProfile = name;
  }

  getStoreLocation(): string | null {
    return null;
  }
}
