import { Profile } from '../types/index.js';
import { ConfigStore } from '../config/configStore.js';
import { FileSystemConfigStore } from '../config/fileSystemConfigStore.js';
import { ProfileNotFoundError, FileOperationError } from '../errors.js';

export interface ProfileService {
  listProfiles(): Profile[];
  getProfile(name: string): Profile;
  saveProfile(profile: Profile): void;
  deleteProfile(name: string): void;
  getCurrentProfile(): string | null;
  setCurrentProfile(name: string): void;
  profileExists(name: string): boolean;
  getPreviousProfile(): string | null;
  setPreviousProfile(name: string | null): void;
  getStoreLocation(): string | null;
}

export class ProfileServiceImpl implements ProfileService {
  constructor(private readonly store: ConfigStore) {}

  listProfiles(): Profile[] {
    try {
      return this.store.listProfiles();
    } catch (err) {
      throw new FileOperationError('list', 'config store', err);
    }
  }

  getProfile(name: string): Profile {
    const profile = this.store.getProfile(name);
    if (!profile) {
      throw new ProfileNotFoundError(name);
    }
    return profile;
  }

  saveProfile(profile: Profile): void {
    try {
      this.store.saveProfile(profile);
    } catch (err) {
      throw new FileOperationError('save', `config store/${profile.name}.json`, err);
    }
  }

  deleteProfile(name: string): void {
    const success = this.store.deleteProfile(name);
    if (!success) {
      throw new ProfileNotFoundError(name);
    }
  }

  getCurrentProfile(): string | null {
    try {
      return this.store.getCurrentProfile();
    } catch (err) {
      throw new FileOperationError('read current', 'config store', err);
    }
  }

  setCurrentProfile(name: string): void {
    try {
      this.store.setCurrentProfile(name);
    } catch (err) {
      throw new FileOperationError('write current', 'config store', err);
    }
  }

  profileExists(name: string): boolean {
    return this.store.getProfile(name) !== null;
  }

  getPreviousProfile(): string | null {
    try {
      return this.store.getPreviousProfile();
    } catch {
      return null;
    }
  }

  setPreviousProfile(name: string | null): void {
    try {
      this.store.setPreviousProfile(name);
    } catch (err) {
      throw new FileOperationError('write previous', 'config store', err);
    }
  }

  getStoreLocation(): string | null {
    return this.store.getStoreLocation();
  }
}

export const profileService: ProfileService = new ProfileServiceImpl(new FileSystemConfigStore());
