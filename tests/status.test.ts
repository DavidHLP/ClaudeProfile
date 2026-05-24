import { describe, it, expect, vi, beforeEach } from 'vitest';
import { statusCommand } from '../src/commands/status.js';

vi.mock('../src/services/profileService.js', () => ({
  profileService: {
    getStoreLocation: vi.fn(),
    listProfiles: vi.fn(),
    getCurrentProfile: vi.fn(),
    getProfile: vi.fn(),
  },
}));

import { profileService } from '../src/services/profileService.js';

describe('statusCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows current profile and env summary', async () => {
    vi.mocked(profileService.getStoreLocation).mockReturnValue('/tmp/.config/claude-profile');
    vi.mocked(profileService.listProfiles).mockReturnValue([
      { name: 'test', description: 'Test', env: { ANTHROPIC_BASE_URL: 'https://example.com' } },
    ]);
    vi.mocked(profileService.getCurrentProfile).mockReturnValue('test');

    const result = await statusCommand();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain('当前配置: test');
      expect(result.output).toContain('配置数量: 1');
    }
  });

  it('shows no current profile when none active', async () => {
    vi.mocked(profileService.getStoreLocation).mockReturnValue('/tmp/.config/claude-profile');
    vi.mocked(profileService.listProfiles).mockReturnValue([]);
    vi.mocked(profileService.getCurrentProfile).mockReturnValue(null);

    const result = await statusCommand();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain('当前配置: 无');
    }
  });
});
