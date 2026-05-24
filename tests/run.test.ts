import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockProfileService = {
  getProfile: vi.fn(),
};

vi.mock('../src/services/profileService.js', () => ({
  profileService: mockProfileService,
}));

describe('runProfileCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error for non-existent profile', async () => {
    mockProfileService.getProfile.mockReturnValue(null);

    const { runProfileCommand } = await import('../src/commands/run.js');
    const result = await runProfileCommand({
      profileName: 'missing',
      command: ['echo', 'hello'],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('不存在');
    }
  });

  it('should return error when no command is provided', async () => {
    mockProfileService.getProfile.mockReturnValue({
      name: 'test',
      env: { FOO: 'bar' },
    });

    const { runProfileCommand } = await import('../src/commands/run.js');
    const result = await runProfileCommand({
      profileName: 'test',
      command: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('没有指定');
    }
  });

  it('should print env with --print-env', async () => {
    mockProfileService.getProfile.mockReturnValue({
      name: 'test',
      env: { ANTHROPIC_BASE_URL: 'https://api.test.com' },
    });

    const { runProfileCommand } = await import('../src/commands/run.js');
    const result = await runProfileCommand({
      profileName: 'test',
      command: [],
      printEnv: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain('ANTHROPIC_BASE_URL=https://api.test.com');
    }
  });

  it('exec should behave as alias for run', async () => {
    mockProfileService.getProfile.mockReturnValue({
      name: 'test',
      env: { FOO: 'bar' },
    });

    const { execProfileCommand } = await import('../src/commands/run.js');
    const result = await execProfileCommand({
      profileName: 'test',
      command: [],
      printEnv: true,
    });

    expect(result.success).toBe(true);
  });
});
