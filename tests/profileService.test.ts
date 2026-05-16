import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileServiceImpl } from '../src/services/profileService.js';
import { InMemoryConfigStore } from '../src/config/inMemoryConfigStore.js';
import { ProfileNotFoundError } from '../src/errors.js';

describe('ProfileService', () => {
  let store: InMemoryConfigStore;
  let service: ProfileServiceImpl;

  beforeEach(() => {
    store = new InMemoryConfigStore();
    service = new ProfileServiceImpl(store);
  });

  it('should list profiles from store', () => {
    store.saveProfile({
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
    });

    const profiles = service.listProfiles();

    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('test-profile');
  });

  it('should get profile by name', () => {
    store.saveProfile({
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
    });

    const profile = service.getProfile('minimax');

    expect(profile).not.toBeNull();
    expect(profile.name).toBe('minimax');
    expect(profile.env.ANTHROPIC_BASE_URL).toBe('https://api.minimaxi.com');
  });

  it('should throw ProfileNotFoundError for non-existent profile', () => {
    expect(() => service.getProfile('non-existent')).toThrow(ProfileNotFoundError);
  });

  it('should save and retrieve profile', () => {
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

    service.saveProfile(newProfile);
    const retrieved = service.getProfile('new-profile');

    expect(retrieved.name).toBe('new-profile');
    expect(retrieved.env.ANTHROPIC_AUTH_TOKEN).toBe('new-token');
  });

  it('should delete profile', () => {
    store.saveProfile({
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
    });

    expect(service.getProfile('to-delete')).not.toBeNull();
    service.deleteProfile('to-delete');
    expect(() => service.getProfile('to-delete')).toThrow(ProfileNotFoundError);
  });

  it('should set and get current profile', () => {
    service.setCurrentProfile('test-profile');
    const current = service.getCurrentProfile();

    expect(current).toBe('test-profile');
  });

  it('should return null when no current profile set', () => {
    const current = service.getCurrentProfile();

    expect(current).toBeNull();
  });

  it('should check profile existence', () => {
    store.saveProfile({
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
    });

    expect(service.profileExists('existing')).toBe(true);
    expect(service.profileExists('non-existent')).toBe(false);
  });

  it('should set and get previous profile', () => {
    service.setPreviousProfile('old-profile');
    const prev = service.getPreviousProfile();

    expect(prev).toBe('old-profile');
  });

  it('should return null when no previous profile set', () => {
    const prev = service.getPreviousProfile();

    expect(prev).toBeNull();
  });

  it('should clear previous profile when set to null', () => {
    service.setPreviousProfile('old-profile');
    expect(service.getPreviousProfile()).toBe('old-profile');

    service.setPreviousProfile(null);
    expect(service.getPreviousProfile()).toBeNull();
  });

  it('should return null for store location with in-memory store', () => {
    expect(service.getStoreLocation()).toBeNull();
  });
});
