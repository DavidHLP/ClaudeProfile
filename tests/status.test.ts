import { describe, it, expect, beforeEach } from 'vitest';
import type { Profile } from '../src/types/index.js';
import { envPresenter } from '../src/presenters/envRenderer.js';
import { noopPrompts, type CommandContext } from '../src/commands/context.js';
import type { ProfileService } from '../src/services/profileService.js';

function buildMockService(
  profiles: Profile[],
  current: string | null,
  storeLocation: string | null = '/tmp/.config/claude-profile',
): ProfileService {
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
    getStoreLocation: () => storeLocation,
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
    // `statusCommand` reads `process.env` via `extractClaudeShellEnv`.
    // We assert the *shape* of the output (current profile / store
    // location / profile count / "Shell 环境变量" header) rather
    // than the host's actual env. The header is always present
    // regardless of whether the host has Claude env vars or not.
  });

  it('shows current profile, store location, and profile count', async () => {
    const service = buildMockService(
      [{ name: 'test', description: 'Test', env: { ANTHROPIC_BASE_URL: 'https://example.com' } }],
      'test',
    );
    const ctx = buildCtx(service);
    const { statusCommand } = await import('../src/commands/status.js');

    const result = await statusCommand(ctx);
    expect(result.success).toBe(true);
    if (result.success) {
      // The 3 context lines, all rendered by `formatStatus`.
      expect(result.output).toContain('当前配置: test');
      expect(result.output).toContain('配置目录: /tmp/.config/claude-profile');
      expect(result.output).toContain('配置数量: 1');
      // The shell-env section is owned by `formatStatus`; the
      // header is always rendered (entries below are host-conditional).
      expect(result.output).toContain('Shell 环境变量 (注入来源):');
    }
  });

  it('shows "无" current profile and "未知" store location when both are missing', async () => {
    // Mock the service to return null for both `getCurrentProfile`
    // AND `getStoreLocation` — this is the "no config dir known"
    // state, e.g. when the CLI is invoked before the first `create`.
    const service = buildMockService([], null, null);
    const ctx = buildCtx(service);
    const { statusCommand } = await import('../src/commands/status.js');

    const result = await statusCommand(ctx);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain('当前配置: 无');
      expect(result.output).toContain('配置目录: 未知');
      expect(result.output).toContain('配置数量: 0');
    }
  });

  it('produces a CommandResult.success=true (the seam does not change the success path)', async () => {
    const service = buildMockService([], null);
    const ctx = buildCtx(service);
    const { statusCommand } = await import('../src/commands/status.js');

    const result = await statusCommand(ctx);
    // The status command is informational; it never returns a
    // failure. After the seam refactor, this invariant is even
    // easier to assert because the only thing the command does is
    // call `formatStatus` and wrap the result in `runCommand`.
    expect(result.success).toBe(true);
  });
});
