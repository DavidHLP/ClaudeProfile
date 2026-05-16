import { Profile } from '../types/index.js';
import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';

const CONFIG_DIR = join(homedir(), '.config', 'env-switcher');
const CURRENT_FILE = join(CONFIG_DIR, '.current');
const PREV_FILE = join(CONFIG_DIR, '.current-prev');

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function getConfigDir(): string {
  ensureConfigDir();
  return CONFIG_DIR;
}

export function getCurrentProfile(): string | null {
  ensureConfigDir();
  if (existsSync(CURRENT_FILE)) {
    return readFileSync(CURRENT_FILE, 'utf-8').trim();
  }
  return null;
}

export function setCurrentProfile(name: string): void {
  ensureConfigDir();
  writeFileSync(CURRENT_FILE, name, 'utf-8');
}

export function listProfiles(): Profile[] {
  ensureConfigDir();
  const files = readdirSync(CONFIG_DIR).filter((f) => f.endsWith('.json') && f !== '.current');

  const profiles: Profile[] = [];
  for (const file of files) {
    try {
      const content = readFileSync(join(CONFIG_DIR, file), 'utf-8');
      const profile = JSON.parse(content) as Profile;
      profiles.push(profile);
    } catch {
      // Skip invalid files
    }
  }
  return profiles;
}

export function getProfile(name: string): Profile | null {
  const filePath = join(CONFIG_DIR, `${name}.json`);
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

export function saveProfile(profile: Profile): void {
  ensureConfigDir();
  const filePath = join(CONFIG_DIR, `${profile.name}.json`);
  writeFileSync(filePath, JSON.stringify(profile, null, 2), 'utf-8');
}

export function deleteProfile(name: string): boolean {
  const filePath = join(CONFIG_DIR, `${name}.json`);
  if (!existsSync(filePath)) {
    return false;
  }
  unlinkSync(filePath);
  return true;
}

export function getPreviousProfile(): string | null {
  ensureConfigDir();
  if (existsSync(PREV_FILE)) {
    const name = readFileSync(PREV_FILE, 'utf-8').trim();
    return name || null;
  }
  return null;
}

export function setPreviousProfile(name: string | null): void {
  ensureConfigDir();
  if (name === null) {
    if (existsSync(PREV_FILE)) {
      unlinkSync(PREV_FILE);
    }
  } else {
    writeFileSync(PREV_FILE, name, 'utf-8');
  }
}
