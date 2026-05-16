import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// We need to test the ProfileService with a mocked config directory
// Since the module uses singleton CONFIG_DIR, we need to re-import for each test

describe('ProfileService', () => {
  const originalHomedir = process.env.HOME;
  const testConfigDir = mkdtempSync(join(tmpdir(), 'env-switcher-test-'));
  const testHomeDir = join(testConfigDir, 'home');
  
  beforeEach(() => {
    mkdirSync(testHomeDir, { recursive: true });
    process.env.HOME = testHomeDir;
  });
  
  afterEach(() => {
    process.env.HOME = originalHomedir;
    rmSync(testConfigDir, { recursive: true, force: true });
  });

  it('should list profiles from config directory', async () => {
    // Create a test profile file directly
    const configDir = join(testHomeDir, '.config', 'env-switcher');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'test-profile.json'), JSON.stringify({
      name: 'test-profile',
      description: 'Test',
      env: {
        ANTHROPIC_BASE_URL: 'https://api.test.com',
        ANTHROPIC_AUTH_TOKEN: 'token',
        ANTHROPIC_MODEL: 'model',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'sonnet',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'opus',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku',
      },
    }));

    // Re-import to pick up new HOME
    const { profileService } = await import('../src/services/profileService.js');
    const profiles = profileService.listProfiles();

    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('test-profile');
  });

  it('should get profile by name', async () => {
    const configDir = join(testHomeDir, '.config', 'env-switcher');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'minimax.json'), JSON.stringify({
      name: 'minimax',
      description: 'MiniMax',
      env: {
        ANTHROPIC_BASE_URL: 'https://api.minimaxi.com',
        ANTHROPIC_AUTH_TOKEN: 'token',
        ANTHROPIC_MODEL: 'model',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'sonnet',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'opus',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku',
      },
    }));

    const { profileService } = await import('../src/services/profileService.js');
    const profile = profileService.getProfile('minimax');

    expect(profile).not.toBeNull();
    expect(profile!.name).toBe('minimax');
    expect(profile!.env.ANTHROPIC_BASE_URL).toBe('https://api.minimaxi.com');
  });

  it('should throw ProfileNotFoundError for non-existent profile', async () => {
    const { profileService } = await import('../src/services/profileService.js');
    
    expect(() => profileService.getProfile('non-existent')).toThrow('不存在');
  });

  it('should save and retrieve profile', async () => {
    const { profileService } = await import('../src/services/profileService.js');
    const newProfile = {
      name: 'new-profile',
      description: 'New Profile',
      env: {
        ANTHROPIC_BASE_URL: 'https://api.new.com',
        ANTHROPIC_AUTH_TOKEN: 'new-token',
        ANTHROPIC_MODEL: 'new-model',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'new-sonnet',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'new-opus',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'new-haiku',
      },
    };

    profileService.saveProfile(newProfile);
    const retrieved = profileService.getProfile('new-profile');

    expect(retrieved.name).toBe('new-profile');
    expect(retrieved.env.ANTHROPIC_AUTH_TOKEN).toBe('new-token');
  });

  it('should delete profile', async () => {
    const configDir = join(testHomeDir, '.config', 'env-switcher');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'to-delete.json'), JSON.stringify({
      name: 'to-delete',
      description: 'To Delete',
      env: {
        ANTHROPIC_BASE_URL: 'https://api.delete.com',
        ANTHROPIC_AUTH_TOKEN: 'token',
        ANTHROPIC_MODEL: 'model',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'sonnet',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'opus',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku',
      },
    }));

    const { profileService } = await import('../src/services/profileService.js');
    
    expect(profileService.getProfile('to-delete')).not.toBeNull();
    profileService.deleteProfile('to-delete');
    expect(() => profileService.getProfile('to-delete')).toThrow();
  });

  it('should set and get current profile', async () => {
    const { profileService } = await import('../src/services/profileService.js');
    
    profileService.setCurrentProfile('test-profile');
    const current = profileService.getCurrentProfile();
    
    expect(current).toBe('test-profile');
  });

  it('should return null when no current profile set', async () => {
    const { profileService } = await import('../src/services/profileService.js');
    const current = profileService.getCurrentProfile();
    
    expect(current).toBeNull();
  });

  it('should check profile existence', async () => {
    const configDir = join(testHomeDir, '.config', 'env-switcher');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'existing.json'), JSON.stringify({
      name: 'existing',
      description: 'Existing',
      env: {
        ANTHROPIC_BASE_URL: 'https://api.test.com',
        ANTHROPIC_AUTH_TOKEN: 'token',
        ANTHROPIC_MODEL: 'model',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'sonnet',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'opus',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku',
      },
    }));

    const { profileService } = await import('../src/services/profileService.js');

    expect(profileService.profileExists('existing')).toBe(true);
    expect(profileService.profileExists('non-existent')).toBe(false);
  });

  it('should set and get previous profile', async () => {
    const { profileService } = await import('../src/services/profileService.js');

    profileService.setPreviousProfile('old-profile');
    const prev = profileService.getPreviousProfile();

    expect(prev).toBe('old-profile');
  });

  it('should return null when no previous profile set', async () => {
    const { profileService } = await import('../src/services/profileService.js');
    const prev = profileService.getPreviousProfile();

    expect(prev).toBeNull();
  });

  it('should clear previous profile when set to null', async () => {
    const { profileService } = await import('../src/services/profileService.js');

    profileService.setPreviousProfile('old-profile');
    expect(profileService.getPreviousProfile()).toBe('old-profile');

    profileService.setPreviousProfile(null);
    expect(profileService.getPreviousProfile()).toBeNull();
  });
});
