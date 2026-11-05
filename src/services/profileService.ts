import { Profile } from '../types/index.js';
import { ConfigStore } from '../config/configStore.js';
import { FileSystemConfigStore } from '../config/fileSystemConfigStore.js';
import {
  ProfileNotFoundError,
  ProfileAlreadyExistsError,
  FileOperationError,
} from '../errors.js';

export interface ProfileService {
  listProfiles(): Profile[];
  getProfile(name: string): Profile;
  /**
   * Save `profile` under its own name. If a profile with that name
   * already exists it is overwritten; to refuse, callers should call
   * `profileExists` first (or use `cloneProfile`, which encodes the
   * "refuse on conflict" policy).
   */
  saveProfile(profile: Profile): void;
  /**
   * Materialize a new profile under `newName` whose `description` and
   * `env` are an independent copy of `sourceName`. The two profiles
   * share no mutable state after the call: mutating the source's env
   * afterwards does not affect the clone, and vice versa.
   *
   * Throws:
   *   - `ProfileNotFoundError` if `sourceName` does not exist.
   *   - `ProfileAlreadyExistsError` if `newName` already exists.
   *
   * This is the single home for the "derive a new profile from an
   * existing one" operation. Both `renameCommand` and `duplicateCommand`
   * consume it; command-specific side effects (e.g. re-pointing the
   * active marker, deleting the source) stay in those commands.
   */
  cloneProfile(sourceName: string, newName: string): void;
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

  cloneProfile(sourceName: string, newName: string): void {
    // Source presence is the load-bearing check; let the standard
    // `ProfileNotFoundError` flow through `runCommand` so the caller's
    // `CommandResult` is `{ success: false, error: "配置 'X' 不存在" }`
    // without any duplicate error-mapping.
    const source = this.getProfile(sourceName);

    // Refuse on name collision so the caller never has to remember the
    // `profileExists` precondition. Matches the `ProfileAlreadyExistsError`
    // thrown by the import pipeline (ADR-0011) and by the original
    // inline logic in `renameCommand` / `duplicateCommand`.
    if (this.profileExists(newName)) {
      throw new ProfileAlreadyExistsError(newName);
    }

    this.saveProfile({
      name: newName,
      description: source.description,
      // Independent env copy: the spread is shallow, but `EnvConfig` is
      // a flat `Record<string, string>`, so a shallow copy is the
      // correct deep copy. If a future field is non-string (e.g. nested
      // object), this is the single place to revisit.
      env: { ...source.env },
    });
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
