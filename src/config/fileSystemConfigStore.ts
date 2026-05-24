import { Profile } from '../types/index.js';
import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { ConfigStore } from './configStore.js';

const CONFIG_DIR_MODE = 0o700;
const CONFIG_FILE_MODE = 0o600;

export class FileSystemConfigStore implements ConfigStore {
  private readonly configDir: string;
  private readonly currentFile: string;
  private readonly prevFile: string;

  constructor() {
    this.configDir = join(homedir(), '.config', 'claude-profile');
    this.currentFile = join(this.configDir, '.current');
    this.prevFile = join(this.configDir, '.current-prev');
    this.ensureConfigDir();
  }

  private ensureConfigDir(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true, mode: CONFIG_DIR_MODE });
    }
  }

  listProfiles(): Profile[] {
    const files = readdirSync(this.configDir).filter((f) => f.endsWith('.json') && f !== '.current');

    const profiles: Profile[] = [];
    for (const file of files) {
      try {
        const content = readFileSync(join(this.configDir, file), 'utf-8');
        const profile = JSON.parse(content) as Profile;
        profiles.push(profile);
      } catch {
        // Skip invalid files
      }
    }
    return profiles;
  }

  getProfile(name: string): Profile | null {
    const filePath = join(this.configDir, `${name}.json`);
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as Profile;
    } catch {
      return null;
    }
  }

  saveProfile(profile: Profile): void {
    const filePath = join(this.configDir, `${profile.name}.json`);
    writeFileSync(filePath, JSON.stringify(profile, null, 2), { encoding: 'utf-8', mode: CONFIG_FILE_MODE });
  }

  deleteProfile(name: string): boolean {
    const filePath = join(this.configDir, `${name}.json`);
    if (!existsSync(filePath)) {
      return false;
    }
    unlinkSync(filePath);
    return true;
  }

  getCurrentProfile(): string | null {
    if (existsSync(this.currentFile)) {
      return readFileSync(this.currentFile, 'utf-8').trim();
    }
    return null;
  }

  setCurrentProfile(name: string): void {
    writeFileSync(this.currentFile, name, { encoding: 'utf-8', mode: CONFIG_FILE_MODE });
  }

  getPreviousProfile(): string | null {
    if (existsSync(this.prevFile)) {
      const name = readFileSync(this.prevFile, 'utf-8').trim();
      return name || null;
    }
    return null;
  }

  setPreviousProfile(name: string | null): void {
    if (name === null) {
      if (existsSync(this.prevFile)) {
        unlinkSync(this.prevFile);
      }
    } else {
      writeFileSync(this.prevFile, name, { encoding: 'utf-8', mode: CONFIG_FILE_MODE });
    }
  }

  getStoreLocation(): string | null {
    return this.configDir;
  }
}
