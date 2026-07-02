import { describe, it, expect, beforeEach } from 'vitest';
import type { Profile } from '../src/types/index.js';
import { envPresenter } from '../src/presenters/envRenderer.js';
import { noopPrompts, type CommandContext } from '../src/commands/context.js';
import type { ProfileService } from '../src/services/profileService.js';

function buildMockService(profiles: Profile[], current: string | null): ProfileService {
  return {
    listProfiles: () => profiles,
    getProfile: (name) => profiles.find((p) => p.name === name) ?? null,
    saveProfile: () => {},
    deleteProfile: () => true,
    getCurrentProfile: () => current,
    setCurrentProfile: () => {},
    profileExists: (name) => profiles.some((p) => p.name === name),
    getPreviousProfile: () => null,
    setPreviousProfile: () => {},
    getStoreLocation: () => '/tmp/.config/claude-profile',
  };
}

function buildCtx(service: ProfileService): CommandContext {
  return {
    profiles: service,
    env: envPresenter,
    prompts: noopPrompts,
    isTTY: false,
  };
}

describe('statusCommand', () => {
  beforeEach(() => {
    // Ensure the host's process.env doesn't pollute the test (we only
    // read ANTHROPIC_*/CLAUDE_CODE_* from process.env in statusCommand).
  });

  it('shows current profile and env summary', async () => {
    const service = buildMockService(
      [{ name: 'test', description: 'Test', env: { ANTHROPIC_BASE_URL: 'https://example.com' } }],
      'test'
    );
    const ctx = buildCtx(service);
    const { statusCommand } = await import('../src/commands/status.js');

    const result = await statusCommand(ctx);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain('当前配置: test');
      expect(result.output).toContain('配置数量: 1');
    }
  });

  it('shows no current profile when none active', async () => {
    const service = buildMockService([], null);
    const ctx = buildCtx(service);
    const { statusCommand } = await import('../src/commands/status.js');

    const result = await statusCommand(ctx);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain('当前配置: 无');
    }
  });
});
