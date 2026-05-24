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
  syncOnSwitch: vi.fn().mockReturnValue({ success: true }),
};

vi.mock('../src/services/settingsSyncService.js', () => ({
  settingsSyncService: mockSettingsSyncService,
  createSettingsSyncService: vi.fn().mockReturnValue(mockSettingsSyncService),
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
      expect(result.output).toContain('已切换到');
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
      if (result.success) { expect(result.output).toContain('unset API_TIMEOUT_MS'); };
    });

    it('should call syncOnSwitch by default', async () => {
      const { switchCommand } = await import('../src/commands/switch.js');
      await switchCommand({ profileName: 'test-profile' }, true);

      expect(mockSettingsSyncService.syncOnSwitch).toHaveBeenCalled();
    });

    it('should not call syncOnSwitch when syncToSettings is false', async () => {
      const { switchCommand } = await import('../src/commands/switch.js');
      await switchCommand({ profileName: 'test-profile', syncToSettings: false }, true);

      expect(mockSettingsSyncService.syncOnSwitch).not.toHaveBeenCalled();
    });

    it('should call syncOnSwitch when syncToSettings is explicitly true', async () => {
      const { switchCommand } = await import('../src/commands/switch.js');
      await switchCommand({ profileName: 'test-profile', syncToSettings: true }, true);

      expect(mockSettingsSyncService.syncOnSwitch).toHaveBeenCalled();
      const [oldEnv, newEnv] = mockSettingsSyncService.syncOnSwitch.mock.calls[0];
      expect(newEnv.ANTHROPIC_BASE_URL).toBe('https://api.test.com');
    });

    it('should not call setCurrentProfile in dry-run mode', async () => {
      const { switchCommand } = await import('../src/commands/switch.js');
      const result = await switchCommand({ profileName: 'test-profile', dryRun: true }, true);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toContain('dry-run');
      }
      expect(mockProfileService.setCurrentProfile).not.toHaveBeenCalled();
      expect(mockSettingsSyncService.syncOnSwitch).not.toHaveBeenCalled();
    });

    it('should not call syncOnSwitch in dry-run mode even with syncToSettings true', async () => {
      const { switchCommand } = await import('../src/commands/switch.js');
      await switchCommand({ profileName: 'test-profile', syncToSettings: true, dryRun: true }, true);

      expect(mockProfileService.setCurrentProfile).not.toHaveBeenCalled();
      expect(mockSettingsSyncService.syncOnSwitch).not.toHaveBeenCalled();
    });

    it('should use scoped syncService when scope is provided', async () => {
      const { switchCommand } = await import('../src/commands/switch.js');
      await switchCommand({ profileName: 'test-profile', scope: 'project' }, true);

      expect(mockProfileService.setCurrentProfile).toHaveBeenCalledWith('test-profile');
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
    it('should update only the specified field', async () => {
      const { editCommand } = await import('../src/commands/edit.js');
      const result = await editCommand({
        profileName: 'test-profile',
        field: 'token',
        value: 'updated-token',
      });

      expect(result.success).toBe(true);
      expect(mockProfileService.saveProfile).toHaveBeenCalled();

      const savedProfile = mockProfileService.saveProfile.mock.calls[0][0];
      expect(savedProfile.env.ANTHROPIC_AUTH_TOKEN).toBe('updated-token');
    });

    it('should leave other env fields unchanged when editing one field', async () => {
      const { editCommand } = await import('../src/commands/edit.js');
      const result = await editCommand({
        profileName: 'test-profile',
        field: 'baseUrl',
        value: 'https://api.updated.com',
      });

      expect(result.success).toBe(true);

      const savedProfile = mockProfileService.saveProfile.mock.calls[0][0];
      expect(savedProfile.env.ANTHROPIC_BASE_URL).toBe('https://api.updated.com');
      expect(savedProfile.env.ANTHROPIC_AUTH_TOKEN).toBe('test-token');
      expect(savedProfile.env.ANTHROPIC_MODEL).toBe('test-model');
      expect(savedProfile.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('test-sonnet');
      expect(savedProfile.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('test-opus');
      expect(savedProfile.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('test-haiku');
    });

    it('should sync ANTHROPIC_MODEL and ANTHROPIC_DEFAULT_SONNET_MODEL when editing sonnetModel', async () => {
      const { editCommand } = await import('../src/commands/edit.js');
      const result = await editCommand({
        profileName: 'test-profile',
        field: 'sonnetModel',
        value: 'updated-sonnet',
      });

      expect(result.success).toBe(true);

      const savedProfile = mockProfileService.saveProfile.mock.calls[0][0];
      expect(savedProfile.env.ANTHROPIC_MODEL).toBe('updated-sonnet');
      expect(savedProfile.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('updated-sonnet');
      expect(savedProfile.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('test-opus');
      expect(savedProfile.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('test-haiku');
    });

    it('should not mutate the original profile object', async () => {
      const original = createMockProfile();
      mockProfileService.getProfile.mockReturnValueOnce(original);

      const { editCommand } = await import('../src/commands/edit.js');
      await editCommand({
        profileName: 'test-profile',
        field: 'token',
        value: 'updated-token',
      });

      expect(original.env.ANTHROPIC_AUTH_TOKEN).toBe('test-token');
    });

    it('should return error for non-existent profile', async () => {
      mockProfileService.getProfile.mockImplementationOnce(() => {
        throw new ProfileNotFoundError('non-existent');
      });

      const { editCommand } = await import('../src/commands/edit.js');
      const result = await editCommand({
        profileName: 'non-existent',
        field: 'token',
        value: 'token',
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
      expect(result.output).toContain('claude-profile()');
      expect(result.output).toContain('_claude_profile_bin()');
    });

    it('should include switch command handler', async () => {
      const { initCommand } = await import('../src/commands/init.js');
      const result = await initCommand();

      expect(result.success).toBe(true);
      expect(result.output).toContain('if [ "$1" = "switch" ]');
      expect(result.output).toContain('_claude_profile_safe_eval');
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
      expect(result.output).toContain('CLAUDE_PROFILE_BIN');
      expect(result.output).toContain('unset -f claude-profile');
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
      if (!result.success) { expect(result.error).toContain('不存在'); };
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
      if (!result.success) { expect(result.error).toContain('不存在'); };
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
      if (result.success) { expect(result.output).toContain('unset API_TIMEOUT_MS'); };
      expect(mockProfileService.setPreviousProfile).toHaveBeenCalledWith(null);
    });
  });

  describe('renameCommand', () => {
    it('should rename profile successfully', async () => {
      mockProfileService.profileExists.mockReturnValue(false);

      const { renameCommand } = await import('../src/commands/rename.js');
      const result = await renameCommand({ oldName: 'test-profile', newName: 'renamed-profile' });

      expect(result.success).toBe(true);
      if (result.success) { expect(result.output).toContain('renamed-profile'); };
      expect(mockProfileService.saveProfile).toHaveBeenCalled();
      expect(mockProfileService.deleteProfile).toHaveBeenCalledWith('test-profile');
    });

    it('should update current profile reference if renaming active', async () => {
      mockProfileService.getCurrentProfile.mockReturnValue('test-profile');
      mockProfileService.profileExists.mockReturnValue(false);

      const { renameCommand } = await import('../src/commands/rename.js');
      const result = await renameCommand({ oldName: 'test-profile', newName: 'renamed-profile' });

      expect(result.success).toBe(true);
      expect(mockProfileService.setCurrentProfile).toHaveBeenCalledWith('renamed-profile');
    });

    it('should return error when old profile does not exist', async () => {
      mockProfileService.getProfile.mockImplementationOnce(() => {
        throw new ProfileNotFoundError('non-existent');
      });

      const { renameCommand } = await import('../src/commands/rename.js');
      const result = await renameCommand({ oldName: 'non-existent', newName: 'new-name' });

      expect(result.success).toBe(false);
      if (!result.success) { expect(result.error).toContain('不存在'); };
    });

    it('should return error when new name already exists', async () => {
      mockProfileService.profileExists.mockReturnValueOnce(true);

      const { renameCommand } = await import('../src/commands/rename.js');
      const result = await renameCommand({ oldName: 'test-profile', newName: 'existing-name' });

      expect(result.success).toBe(false);
      if (!result.success) { expect(result.error).toContain('已存在'); };
    });

    it('should not mutate original profile', async () => {
      const original = createMockProfile({ name: 'test-profile' });
      mockProfileService.getProfile.mockReturnValueOnce(original);

      const { renameCommand } = await import('../src/commands/rename.js');
      await renameCommand({ oldName: 'test-profile', newName: 'renamed-profile' });

      expect(original.name).toBe('test-profile');
      expect(original.env.ANTHROPIC_AUTH_TOKEN).toBe('test-token');
    });

    it('should copy all env fields to renamed profile', async () => {
      mockProfileService.profileExists.mockReturnValue(false);

      const { renameCommand } = await import('../src/commands/rename.js');
      const result = await renameCommand({ oldName: 'test-profile', newName: 'renamed-profile' });

      expect(result.success).toBe(true);
      const savedProfile = mockProfileService.saveProfile.mock.calls[0][0];
      expect(savedProfile.env.ANTHROPIC_BASE_URL).toBe('https://api.test.com');
      expect(savedProfile.env.ANTHROPIC_AUTH_TOKEN).toBe('test-token');
      expect(savedProfile.env.ANTHROPIC_MODEL).toBe('test-model');
    });
  });

  describe('duplicateCommand', () => {
    it('should duplicate profile successfully', async () => {
      mockProfileService.profileExists.mockReturnValue(false);

      const { duplicateCommand } = await import('../src/commands/duplicate.js');
      const result = await duplicateCommand({ sourceName: 'test-profile', newName: 'copy-profile' });

      expect(result.success).toBe(true);
      if (result.success) { expect(result.output).toContain('copy-profile'); };
      expect(mockProfileService.saveProfile).toHaveBeenCalled();
    });

    it('should create copy with identical env', async () => {
      mockProfileService.profileExists.mockReturnValue(false);

      const { duplicateCommand } = await import('../src/commands/duplicate.js');
      await duplicateCommand({ sourceName: 'test-profile', newName: 'copy-profile' });

      const savedProfile = mockProfileService.saveProfile.mock.calls[0][0];
      expect(savedProfile.env.ANTHROPIC_BASE_URL).toBe('https://api.test.com');
      expect(savedProfile.env.ANTHROPIC_AUTH_TOKEN).toBe('test-token');
      expect(savedProfile.env.ANTHROPIC_MODEL).toBe('test-model');
      expect(savedProfile.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('test-sonnet');
      expect(savedProfile.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('test-opus');
      expect(savedProfile.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('test-haiku');
    });

    it('should return error when source does not exist', async () => {
      mockProfileService.getProfile.mockImplementationOnce(() => {
        throw new ProfileNotFoundError('non-existent');
      });

      const { duplicateCommand } = await import('../src/commands/duplicate.js');
      const result = await duplicateCommand({ sourceName: 'non-existent', newName: 'new-name' });

      expect(result.success).toBe(false);
      if (!result.success) { expect(result.error).toContain('不存在'); };
    });

    it('should return error when new name already exists', async () => {
      mockProfileService.profileExists.mockReturnValueOnce(true);

      const { duplicateCommand } = await import('../src/commands/duplicate.js');
      const result = await duplicateCommand({ sourceName: 'test-profile', newName: 'existing-name' });

      expect(result.success).toBe(false);
      if (!result.success) { expect(result.error).toContain('已存在'); };
    });

    it('should not mutate original profile', async () => {
      const original = createMockProfile({ name: 'test-profile' });
      mockProfileService.getProfile.mockReturnValueOnce(original);

      const { duplicateCommand } = await import('../src/commands/duplicate.js');
      await duplicateCommand({ sourceName: 'test-profile', newName: 'copy-profile' });

      expect(original.name).toBe('test-profile');
      expect(original.env.ANTHROPIC_AUTH_TOKEN).toBe('test-token');
    });
  });
});
