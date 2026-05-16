import { Profile, EnvConfig } from '../types/index.js';
import {
  getConfigDir,
  listProfiles as listFromDisk,
  getProfile as getFromDisk,
  saveProfile as saveToDisk,
  deleteProfile as deleteFromDisk,
  getCurrentProfile as getCurrentFromDisk,
  setCurrentProfile as setCurrentToDisk,
  getPreviousProfile as getPreviousFromDisk,
  setPreviousProfile as setPreviousToDisk
} from '../config/manager.js';
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
}

class ProfileServiceImpl implements ProfileService {
  listProfiles(): Profile[] {
    try {
      return listFromDisk();
    } catch (err) {
      throw new FileOperationError('list', getConfigDir(), err);
    }
  }

  getProfile(name: string): Profile {
    const profile = getFromDisk(name);
    if (!profile) {
      throw new ProfileNotFoundError(name);
    }
    return profile;
  }

  saveProfile(profile: Profile): void {
    try {
      saveToDisk(profile);
    } catch (err) {
      throw new FileOperationError('save', `${getConfigDir()}/${profile.name}.json`, err);
    }
  }

  deleteProfile(name: string): void {
    const success = deleteFromDisk(name);
    if (!success) {
      throw new ProfileNotFoundError(name);
    }
  }

  getCurrentProfile(): string | null {
    try {
      return getCurrentFromDisk();
    } catch (err) {
      throw new FileOperationError('read current', getConfigDir(), err);
    }
  }

  setCurrentProfile(name: string): void {
    try {
      setCurrentToDisk(name);
    } catch (err) {
      throw new FileOperationError('write current', getConfigDir(), err);
    }
  }

  profileExists(name: string): boolean {
    return getFromDisk(name) !== null;
  }

  getPreviousProfile(): string | null {
    try {
      return getPreviousFromDisk();
    } catch {
      return null;
    }
  }

  setPreviousProfile(name: string | null): void {
    try {
      setPreviousToDisk(name);
    } catch (err) {
      throw new FileOperationError('write previous', getConfigDir(), err);
    }
  }
}

export const profileService: ProfileService = new ProfileServiceImpl();
