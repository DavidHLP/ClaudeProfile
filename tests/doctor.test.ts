import { doctorCommand } from '../src/commands/doctor.js';
import fs from 'node:fs';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { describe, it, expect, mocks, beforeEach, afterEach } from './support/test.js';
import type { Profile } from '../src/types/index.js';
import { envPresenter } from '../src/presenters/envRenderer.js';
import { noopPrompts, type CommandContext } from '../src/commands/context.js';
import type { ProfileService } from '../src/services/profileService.js';

// Doctor reaches into `fs` for permissions, `.bashrc`/`.zshrc` for shell-hook
// detection, and `process.cwd()` for git. We stub them all so the test is
// deterministic and doesn't touch the host.
const originalFs = { existsSync: fs.existsSync, statSync: fs.statSync, readdirSync: fs.readdirSync, readFileSync: fs.readFileSync };
const originalHomedir = os.homedir;
beforeEach(() => {
Object.assign(fs, {
  existsSync: mocks.fn((p: unknown) => typeof p === 'string' && p.includes('claude-profile')),
  statSync: mocks.fn(() => ({ mode: 0o40700 })),
  readdirSync: mocks.fn(() => []),
  readFileSync: mocks.fn(() => '# claude-profile hook loaded'),
});

Object.assign(os, {
  homedir: () => '/tmp',
});

// Stub the .git check to look at our process.cwd
const realCwd = process.cwd();
const realGitPath = `${realCwd}/.git`;

// Native path functions are retained; fixtures use platform-correct paths.
syncBuiltinESMExports();
});
afterEach(() => {
  Object.assign(fs, originalFs);
  os.homedir = originalHomedir;
  syncBuiltinESMExports();
});


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

describe('doctorCommand', () => {
  beforeEach(() => {
    mocks.clearAllMocks();
  });

  it('reports ok when everything is healthy', async () => {
    const profile: Profile = {
      name: 'test',
      description: 'Test',
      env: { ANTHROPIC_BASE_URL: 'https://example.com' },
    };
    const service = buildMockService([profile], 'test');
    const ctx = buildCtx(service);

    const result = await doctorCommand(ctx);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain('诊断报告');
    }
  });

  it('reports warning when no profiles exist', async () => {
    const service = buildMockService([], null);
    const ctx = buildCtx(service);

    const result = await doctorCommand(ctx);
    // Empty profiles is a warning, not an error
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain('没有配置');
    }
  });
});
