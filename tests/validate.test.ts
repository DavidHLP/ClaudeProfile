import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Factory function for creating valid profiles
function createValidProfile(overrides = {}) {
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
      ...overrides,
    },
    ...overrides,
  };
}

describe('validateCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateProfiles', () => {
    it('should return success for valid profiles', async () => {
      const validProfile = createValidProfile();
      mockProfileService.listProfiles.mockReturnValue([validProfile]);
      mockProfileService.getCurrentProfile.mockReturnValue('test-profile');

      const { validateCommand } = await import('../src/commands/validate.js');
      const result = await validateCommand();

      expect(result.success).toBe(true);
      expect(result.output).toContain('验证通过');
    });

    it('should detect missing token', async () => {
      const profileNoToken = {
        name: 'no-token',
        description: 'Test',
        env: {
          ANTHROPIC_BASE_URL: 'https://api.test.com',
          ANTHROPIC_AUTH_TOKEN: '',
        },
      };
      mockProfileService.listProfiles.mockReturnValue([profileNoToken]);

      const { validateCommand } = await import('../src/commands/validate.js');
      const result = await validateCommand();

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain('ANTHROPIC_AUTH_TOKEN');
    });

    it('should detect missing base URL', async () => {
      const profileNoUrl = {
        name: 'no-url',
        description: 'Test',
        env: {
          ANTHROPIC_BASE_URL: '',
          ANTHROPIC_AUTH_TOKEN: 'token',
        },
      };
      mockProfileService.listProfiles.mockReturnValue([profileNoUrl]);

      const { validateCommand } = await import('../src/commands/validate.js');
      const result = await validateCommand();

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain('ANTHROPIC_BASE_URL');
    });

    it('should detect invalid URL format', async () => {
      const profileInvalidUrl = {
        name: 'invalid-url',
        description: 'Test',
        env: {
          ANTHROPIC_BASE_URL: 'not-a-valid-url',
          ANTHROPIC_AUTH_TOKEN: 'token',
        },
      };
      mockProfileService.listProfiles.mockReturnValue([profileInvalidUrl]);

      const { validateCommand } = await import('../src/commands/validate.js');
      const result = await validateCommand();

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain('URL 格式无效');
    });

    it('should warn when current profile is missing model', async () => {
      const profileNoModel = createValidProfile({
        ANTHROPIC_MODEL: '',
      });
      mockProfileService.listProfiles.mockReturnValue([profileNoModel]);
      mockProfileService.getCurrentProfile.mockReturnValue('test-profile');

      const { validateCommand } = await import('../src/commands/validate.js');
      const result = await validateCommand();

      // Missing model is a warning, not an error - so still success: true
      expect(result.success).toBe(true);
      expect(result.output).toContain('ANTHROPIC_MODEL');
    });

    it('should handle empty profile list', async () => {
      mockProfileService.listProfiles.mockReturnValue([]);

      const { validateCommand } = await import('../src/commands/validate.js');
      const result = await validateCommand();

      expect(result.success).toBe(true);
      expect(result.output).toContain('没有配置');
    });

    it('should include verbose details when verbose option is true', async () => {
      const validProfile = createValidProfile();
      mockProfileService.listProfiles.mockReturnValue([validProfile]);
      mockProfileService.getCurrentProfile.mockReturnValue('test-profile');

      const { validateCommand } = await import('../src/commands/validate.js');
      const result = await validateCommand({ verbose: true });

      expect(result.output).toContain('详细信息');
      expect(result.output).toContain('BASE URL');
    });

    it('should check all required fields for completeness', async () => {
      const incompleteProfile = {
        name: 'incomplete',
        description: 'Test',
        env: {
          ANTHROPIC_BASE_URL: 'https://api.test.com',
          ANTHROPIC_AUTH_TOKEN: 'token',
          ANTHROPIC_MODEL: '',
          ANTHROPIC_DEFAULT_SONNET_MODEL: '',
          ANTHROPIC_DEFAULT_OPUS_MODEL: '',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: '',
        },
      };
      mockProfileService.listProfiles.mockReturnValue([incompleteProfile]);

      const { validateCommand } = await import('../src/commands/validate.js');
      const result = await validateCommand({ verbose: true });

      expect(result.success).toBe(true);
      expect(result.output).toContain('未设置');
    });
  });
});
