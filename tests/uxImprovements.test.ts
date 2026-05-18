import { describe, it, expect, vi, beforeEach } from 'vitest';

// Factory function for fresh mock profile
function createMockProfile(overrides: any = {}) {
  return {
    name: 'test-profile',
    description: 'Test Provider',
    env: {
      ANTHROPIC_BASE_URL: 'https://api.test.com',
      ANTHROPIC_AUTH_TOKEN: 'test-token',
      ANTHROPIC_MODEL: 'test-model',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'test-sonnet',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'test-opus',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'test-haiku',
      ...overrides.env,
    },
    ...overrides,
  };
}

// Mock the profileService
const mockProfileService = {
  listProfiles: vi.fn(),
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  deleteProfile: vi.fn().mockReturnValue(true),
  getCurrentProfile: vi.fn().mockReturnValue(null),
  setCurrentProfile: vi.fn(),
  profileExists: vi.fn().mockReturnValue(true),
  getPreviousProfile: vi.fn().mockReturnValue(null),
  setPreviousProfile: vi.fn(),
  getStoreLocation: vi.fn().mockReturnValue('/test/config'),
};

vi.mock('../src/services/profileService.js', () => ({
  profileService: mockProfileService,
}));

// Mock the settingsSyncService
const mockSettingsSyncService = {
  syncOnSwitch: vi.fn(),
};

vi.mock('../src/services/settingsSyncService.js', () => ({
  settingsSyncService: mockSettingsSyncService,
}));

describe('UX Improvements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const freshProfile = createMockProfile();
    mockProfileService.listProfiles.mockReturnValue([freshProfile]);
    mockProfileService.getProfile.mockReturnValue(freshProfile);
  });

  describe('listCommand with verbose option', () => {
    it('should include store location in verbose mode', async () => {
      const { listCommand } = await import('../src/commands/list.js');
      const result = await listCommand({ verbose: true });

      expect(result.success).toBe(true);
      expect(result.output).toContain('/test/config');
    });

    it('should NOT include store location in normal mode', async () => {
      const { listCommand } = await import('../src/commands/list.js');
      const result = await listCommand();

      expect(result.success).toBe(true);
      expect(result.output).not.toContain('/test/config');
    });

    it('should show profile count in verbose mode', async () => {
      const { listCommand } = await import('../src/commands/list.js');
      const result = await listCommand({ verbose: true });

      expect(result.success).toBe(true);
      expect(result.output).toContain('配置数量');
    });

    it('should show extra env vars details in verbose mode', async () => {
      const { listCommand } = await import('../src/commands/list.js');
      const result = await listCommand({ verbose: true });

      expect(result.success).toBe(true);
      expect(result.output).toContain('BASE URL');
    });
  });

  describe('deleteCommand with yes option', () => {
    it('should skip warning for active profile when yes is true', async () => {
      mockProfileService.getCurrentProfile.mockReturnValueOnce('test-profile');

      const { deleteCommand } = await import('../src/commands/delete.js');
      const result = await deleteCommand({ profileName: 'test-profile', yes: true });

      expect(result.success).toBe(true);
      expect(mockProfileService.deleteProfile).toHaveBeenCalledWith('test-profile');
    });

    it('should show warning when deleting active profile without yes flag', async () => {
      mockProfileService.getCurrentProfile.mockReturnValueOnce('test-profile');

      const { deleteCommand } = await import('../src/commands/delete.js');
      const result = await deleteCommand({ profileName: 'test-profile' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('当前激活');
    });

    it('should work with yes flag for non-active profile', async () => {
      mockProfileService.getCurrentProfile.mockReturnValueOnce('other-profile');

      const { deleteCommand } = await import('../src/commands/delete.js');
      const result = await deleteCommand({ profileName: 'test-profile', yes: true });

      expect(result.success).toBe(true);
      expect(mockProfileService.deleteProfile).toHaveBeenCalledWith('test-profile');
    });
  });
});
