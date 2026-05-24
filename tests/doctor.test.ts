import { describe, it, expect, vi, beforeEach } from 'vitest';
import { doctorCommand } from '../src/commands/doctor.js';

vi.mock('../src/services/profileService.js', () => ({
  profileService: {
    getStoreLocation: vi.fn(),
    listProfiles: vi.fn(),
    getCurrentProfile: vi.fn(),
    getProfile: vi.fn(),
    getPreviousProfile: vi.fn(),
    setPreviousProfile: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ mode: 0o40700 })),
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(() => '{}'),
}));

import { profileService } from '../src/services/profileService.js';

describe('doctorCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('reports ok when everything is healthy', async () => {
    vi.mocked(profileService.getStoreLocation).mockReturnValue('/tmp/.config/claude-profile');
    vi.mocked(profileService.listProfiles).mockReturnValue([
      { name: 'test', description: 'Test', env: { ANTHROPIC_BASE_URL: 'https://example.com' } },
    ]);
    vi.mocked(profileService.getCurrentProfile).mockReturnValue('test');
    vi.mocked(profileService.getProfile).mockReturnValue({
      name: 'test',
      description: 'Test',
      env: { ANTHROPIC_BASE_URL: 'https://example.com' },
    });

    const result = await doctorCommand();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain('诊断报告');
    }
  });

  it('reports warning when no profiles exist', async () => {
    vi.mocked(profileService.getStoreLocation).mockReturnValue('/tmp/.config/claude-profile');
    vi.mocked(profileService.listProfiles).mockReturnValue([]);
    vi.mocked(profileService.getCurrentProfile).mockReturnValue(null);

    const result = await doctorCommand();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain('没有配置');
    }
  });
});
