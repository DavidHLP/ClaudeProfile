import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Profile } from '../src/types/index.js';
import { ProfileNotFoundError } from '../src/errors.js';

// Factory function for fresh mock profile
function createMockProfile(overrides = {}) {
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

describe('Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockProfile to fresh state before each test
    const freshProfile = createMockProfile();
    mockProfileService.listProfiles.mockReturnValue([freshProfile]);
    mockProfileService.getProfile.mockReturnValue(freshProfile);
  });

  describe('listCommand', () => {
    it('should return success with formatted profile list', async () => {
      const { listCommand } = await import('../src/commands/list.js');
      const result = await listCommand();

      expect(result.success).toBe(true);
      expect(result.output).toContain('test-profile');
      expect(result.output).toContain('Test Provider');
    });

    it('should return no profiles message when empty', async () => {
      mockProfileService.listProfiles.mockReturnValueOnce([]);
      
      const { listCommand } = await import('../src/commands/list.js');
      const result = await listCommand();

      expect(result.success).toBe(true);
      expect(result.output).toContain('没有可用的配置');
    });
  });

  describe('switchCommand', () => {
    it('should return export commands in non-TTY mode', async () => {
      const { switchCommand } = await import('../src/commands/switch.js');
      const result = await switchCommand({ profileName: 'test-profile' }, false);

      expect(result.success).toBe(true);
      expect(result.output).toContain('export ANTHROPIC_BASE_URL');
      expect(result.output).not.toContain('已切换到配置');
    });

    it('should return formatted success in TTY mode', async () => {
      const { switchCommand } = await import('../src/commands/switch.js');
      const result = await switchCommand({ profileName: 'test-profile' }, true);

      expect(result.success).toBe(true);
      expect(result.output).toContain('>> switched to:');
      expect(result.output).toContain('test-profile');
    });

    it('should return error for non-existent profile', async () => {
      mockProfileService.getProfile.mockImplementationOnce(() => {
        throw new ProfileNotFoundError('non-existent');
      });
      
      const { switchCommand } = await import('../src/commands/switch.js');
      const result = await switchCommand({ profileName: 'non-existent' }, true);

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-existent');
    });

    it('should call setCurrentProfile', async () => {
      const { switchCommand } = await import('../src/commands/switch.js');
      await switchCommand({ profileName: 'test-profile' }, true);

      expect(mockProfileService.setCurrentProfile).toHaveBeenCalledWith('test-profile');
    });

    it('should include unset commands when switching from a different profile', async () => {
      const oldProfile = createMockProfile({
        name: 'old-profile',
        env: {
          ANTHROPIC_BASE_URL: 'https://old.com',
          ANTHROPIC_AUTH_TOKEN: 'old-token',
          ANTHROPIC_MODEL: 'old-model',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'old-sonnet',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'old-opus',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'old-haiku',
          API_TIMEOUT_MS: '3000000',
        },
      });
      mockProfileService.getCurrentProfile.mockReturnValueOnce('old-profile');
      mockProfileService.getProfile
        .mockImplementationOnce(() => oldProfile)
        .mockImplementationOnce(() => createMockProfile());

      const { switchCommand } = await import('../src/commands/switch.js');
      const result = await switchCommand({ profileName: 'test-profile' }, false);

      expect(result.success).toBe(true);
      expect(result.output).toContain('unset API_TIMEOUT_MS');
    });

    it('should call syncOnSwitch with old and new env', async () => {
      const { switchCommand } = await import('../src/commands/switch.js');
      await switchCommand({ profileName: 'test-profile' }, true);

      expect(mockSettingsSyncService.syncOnSwitch).toHaveBeenCalled();
      const [oldEnv, newEnv] = mockSettingsSyncService.syncOnSwitch.mock.calls[0];
      expect(newEnv.ANTHROPIC_BASE_URL).toBe('https://api.test.com');
    });
  });

  describe('deleteCommand', () => {
    it('should return success when deleting profile', async () => {
      const { deleteCommand } = await import('../src/commands/delete.js');
      const result = await deleteCommand({ profileName: 'test-profile' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('已删除');
      expect(mockProfileService.deleteProfile).toHaveBeenCalledWith('test-profile');
    });

    it('should include active warning when deleting current profile', async () => {
      mockProfileService.getCurrentProfile.mockReturnValueOnce('test-profile');
      
      const { deleteCommand } = await import('../src/commands/delete.js');
      const result = await deleteCommand({ profileName: 'test-profile' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('当前激活');
    });

    it('should return error for non-existent profile', async () => {
      mockProfileService.deleteProfile.mockImplementationOnce(() => {
        throw new ProfileNotFoundError('non-existent');
      });
      
      const { deleteCommand } = await import('../src/commands/delete.js');
      const result = await deleteCommand({ profileName: 'non-existent' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-existent');
    });
  });

  describe('createCommand', () => {
    it('should create profile with correct env values', async () => {
      const { createCommand } = await import('../src/commands/create.js');
      const result = await createCommand({
        providerId: 'minimax',
        profileName: 'new-profile',
        token: 'new-token',
        baseUrl: 'https://api.new.com',
        sonnetModel: 'new-sonnet',
        opusModel: 'new-opus',
        haikuModel: 'new-haiku',
      });

      expect(result.success).toBe(true);
      expect(mockProfileService.saveProfile).toHaveBeenCalled();
      
      const savedProfile = mockProfileService.saveProfile.mock.calls[0][0];
      expect(savedProfile.name).toBe('new-profile');
      expect(savedProfile.env.ANTHROPIC_AUTH_TOKEN).toBe('new-token');
      expect(savedProfile.env.ANTHROPIC_MODEL).toBe('new-sonnet');
      expect(savedProfile.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('new-opus');
      expect(savedProfile.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('new-haiku');
    });

    it('should return error for unknown provider', async () => {
      const { createCommand } = await import('../src/commands/create.js');
      const result = await createCommand({
        providerId: 'unknown-provider',
        profileName: 'test',
        token: 'token',
        baseUrl: 'https://api.test.com',
        sonnetModel: 'model',
        opusModel: 'model',
        haikuModel: 'model',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('未知的 Provider');
    });
  });

  describe('editCommand', () => {
    it('should update profile with new values', async () => {
      const { editCommand } = await import('../src/commands/edit.js');
      const result = await editCommand({
        profileName: 'test-profile',
        token: 'updated-token',
        baseUrl: 'https://api.updated.com',
        sonnetModel: 'updated-sonnet',
        opusModel: 'updated-opus',
        haikuModel: 'updated-haiku',
      });

      expect(result.success).toBe(true);
      expect(mockProfileService.saveProfile).toHaveBeenCalled();

      const savedProfile = mockProfileService.saveProfile.mock.calls[0][0];
      expect(savedProfile.env.ANTHROPIC_AUTH_TOKEN).toBe('updated-token');
      expect(savedProfile.env.ANTHROPIC_BASE_URL).toBe('https://api.updated.com');
      expect(savedProfile.env.ANTHROPIC_MODEL).toBe('updated-sonnet');
    });

    it('should return error for non-existent profile', async () => {
      mockProfileService.getProfile.mockImplementationOnce(() => {
        throw new ProfileNotFoundError('non-existent');
      });

      const { editCommand } = await import('../src/commands/edit.js');
      const result = await editCommand({
        profileName: 'non-existent',
        token: 'token',
        baseUrl: 'https://api.test.com',
        sonnetModel: 'model',
        opusModel: 'model',
        haikuModel: 'model',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-existent');
    });
  });

  describe('initCommand', () => {
    it('should return shell hook script', async () => {
      const { initCommand } = await import('../src/commands/init.js');
      const result = await initCommand();

      expect(result.success).toBe(true);
      expect(result.output).toContain('env-switcher()');
      expect(result.output).toContain('_env_switcher_bin()');
    });

    it('should include switch command handler', async () => {
      const { initCommand } = await import('../src/commands/init.js');
      const result = await initCommand();

      expect(result.success).toBe(true);
      expect(result.output).toContain('if [ "$1" = "switch" ]');
      expect(result.output).toContain('eval "$export_output"');
    });

    it('should include export command handler', async () => {
      const { initCommand } = await import('../src/commands/init.js');
      const result = await initCommand();

      expect(result.success).toBe(true);
      expect(result.output).toContain('elif [ "$1" = "export" ]');
    });

    it('should include bin lookup logic', async () => {
      const { initCommand } = await import('../src/commands/init.js');
      const result = await initCommand();

      expect(result.success).toBe(true);
      expect(result.output).toContain('ENV_SWITCHER_BIN');
      expect(result.output).toContain('unset -f env-switcher');
    });

    it('should use switch command for non-interactive profile switch', async () => {
      const { initCommand } = await import('../src/commands/init.js');
      const result = await initCommand();

      expect(result.success).toBe(true);
      // Non-interactive path should use $bin switch, not $bin export
      expect(result.output).toMatch(/\$bin switch "\$profile"/);
    });
  });

  describe('exportCommand', () => {
    it('should return export commands for profile', async () => {
      const { exportCommand } = await import('../src/commands/export.js');
      const result = await exportCommand({ profileName: 'test-profile' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('export ANTHROPIC_BASE_URL');
      expect(result.output).toContain('export ANTHROPIC_AUTH_TOKEN');
      expect(result.output).toContain('https://api.test.com');
    });

    it('should return error for non-existent profile', async () => {
      mockProfileService.getProfile.mockImplementationOnce(() => {
        throw new ProfileNotFoundError('non-existent');
      });

      const { exportCommand } = await import('../src/commands/export.js');
      const result = await exportCommand({ profileName: 'non-existent' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });
  });

  describe('exportCurrentCommand', () => {
    it('should return export commands for current profile', async () => {
      mockProfileService.getCurrentProfile.mockReturnValue('test-profile');

      const { exportCurrentCommand } = await import('../src/commands/export.js');
      const result = await exportCurrentCommand();

      expect(result.success).toBe(true);
      expect(result.output).toContain('export ANTHROPIC_BASE_URL');
      expect(result.output).toContain('https://api.test.com');
    });

    it('should return error when no current profile', async () => {
      mockProfileService.getCurrentProfile.mockReturnValue(null);

      const { exportCurrentCommand } = await import('../src/commands/export.js');
      const result = await exportCurrentCommand();

      expect(result.success).toBe(false);
      expect(result.error).toContain('没有当前配置');
    });

    it('should return error when current profile not found', async () => {
      mockProfileService.getCurrentProfile.mockReturnValue('ghost-profile');
      mockProfileService.getProfile.mockImplementationOnce(() => {
        throw new ProfileNotFoundError('ghost-profile');
      });

      const { exportCurrentCommand } = await import('../src/commands/export.js');
      const result = await exportCurrentCommand();

      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });

    it('should include unset commands when previous profile differs', async () => {
      mockProfileService.getCurrentProfile.mockReturnValue('new-profile');
      const oldProfile = createMockProfile({
        name: 'old-profile',
        env: {
          ANTHROPIC_BASE_URL: 'https://old.com',
          ANTHROPIC_AUTH_TOKEN: 'old-token',
          ANTHROPIC_MODEL: 'old-model',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'old-sonnet',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'old-opus',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'old-haiku',
          API_TIMEOUT_MS: '3000000',
        },
      });
      mockProfileService.getPreviousProfile.mockReturnValue('old-profile');
      mockProfileService.getProfile
        .mockImplementationOnce(() => createMockProfile())  // current profile
        .mockImplementationOnce(() => oldProfile);           // previous profile

      const { exportCurrentCommand } = await import('../src/commands/export.js');
      const result = await exportCurrentCommand();

      expect(result.success).toBe(true);
      expect(result.output).toContain('unset API_TIMEOUT_MS');
      expect(mockProfileService.setPreviousProfile).toHaveBeenCalledWith(null);
    });
  });
});
