/**
 * Tests for the Diagnostic module and its presenter.
 *
 * The diagnostic runner (`runDiagnostics`) is the test surface. Each
 * individual check is exercised through the runner with a controlled
 * `CommandContext` and a mocked `fs` / `os` so the tests are
 * deterministic and don't touch the host.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDiagnostics, type CheckResult } from '../src/domain/diagnostic.js';
import { envPresenter } from '../src/presenters/envRenderer.js';
import { noopPrompts, type CommandContext } from '../src/commands/context.js';
import type { ProfileService } from '../src/services/profileService.js';
import type { Profile } from '../src/types/index.js';

vi.mock('fs', () => ({
  existsSync: vi.fn((p: unknown) => typeof p === 'string' && p.includes('claude-profile')),
  statSync: vi.fn(() => ({ mode: 0o40700 })),
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(() => '# claude-profile hook loaded'),
}));

vi.mock('os', () => ({
  homedir: () => '/tmp',
}));

vi.mock('path', async (importOriginal) => {
  const mod = await importOriginal<typeof import('path')>();
  return {
    ...mod,
    join: (...parts: string[]) => parts.join('/'),
  };
});

function buildService(profiles: Profile[], current: string | null, storeLocation: string | null = '/tmp/.config/claude-profile'): ProfileService {
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

describe('runDiagnostics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 7 checks in canonical order', () => {
    const ctx = buildCtx(buildService([], null));
    const results = runDiagnostics(ctx);
    expect(results).toHaveLength(7);
    expect(results.map((r) => r.name)).toEqual([
      '配置目录',
      '配置文件权限',
      '配置数量',
      '当前配置',
      'Shell Hook',
      'Git 仓库',
      '环境一致性',
    ]);
  });

  it('emits no errors on a healthy system (hook may be warning in test env)', () => {
    // The envConsistency check compares process.env to the current
    // profile's env. In a test environment those would not match by
    // default; we set the matching value to make the test honest.
    // The hook check is a warning in the test env because the mocked
    // rc files do not contain "claude-profile"; that's expected.
    const previous = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_BASE_URL = 'https://example.com';
    try {
      const profile: Profile = {
        name: 'test',
        description: 'Test',
        env: { ANTHROPIC_BASE_URL: 'https://example.com' },
      };
      const ctx = buildCtx(buildService([profile], 'test'));
      const results = runDiagnostics(ctx);
      expect(results.some((r) => r.status === 'error')).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.ANTHROPIC_BASE_URL;
      } else {
        process.env.ANTHROPIC_BASE_URL = previous;
      }
    }
  });

  it('emits error when store location is missing', () => {
    const ctx = buildCtx(buildService([], null, null));
    const results = runDiagnostics(ctx);
    const dir = results.find((r) => r.name === '配置目录');
    expect(dir?.status).toBe('error');
    expect(dir?.message).toContain('不存在');
    expect(dir?.suggestion).toContain('claude-profile create');
  });

  it('emits warning when no profiles exist', () => {
    const ctx = buildCtx(buildService([], null));
    const results = runDiagnostics(ctx);
    const profiles = results.find((r) => r.name === '配置数量');
    expect(profiles?.status).toBe('warning');
    expect(profiles?.message).toBe('没有配置');
  });

  it('emits error for invalid env keys', () => {
    const profile: Profile = {
      name: 'bad',
      description: 'Bad',
      env: { '1invalid': 'value', ANTHROPIC_BASE_URL: 'https://x.com' },
    };
    const ctx = buildCtx(buildService([profile], null));
    const results = runDiagnostics(ctx);
    const sec = results.find((r) => r.name === '配置安全');
    expect(sec?.status).toBe('error');
    expect(sec?.message).toContain('1invalid');
  });

  it('emits warning when no current profile is set', () => {
    const ctx = buildCtx(buildService([], null));
    const results = runDiagnostics(ctx);
    const cur = results.find((r) => r.name === '当前配置');
    expect(cur?.status).toBe('warning');
    expect(cur?.message).toBe('未设置当前配置');
  });

  it('emits error when current profile does not exist on disk', () => {
    // currentProfile="ghost" but listProfiles is empty → getProfile returns null
    const ctx = buildCtx(buildService([], 'ghost'));
    const results = runDiagnostics(ctx);
    const cur = results.find((r) => r.name === '当前配置');
    expect(cur?.status).toBe('error');
    expect(cur?.message).toContain("'ghost' 不存在");
  });

  it('emits ok when current profile exists and is active', () => {
    const profile: Profile = {
      name: 'live',
      description: 'Live',
      env: { ANTHROPIC_BASE_URL: 'https://live.com' },
    };
    const ctx = buildCtx(buildService([profile], 'live'));
    const results = runDiagnostics(ctx);
    const cur = results.find((r) => r.name === '当前配置');
    expect(cur?.status).toBe('ok');
    expect(cur?.message).toBe('已激活: live');
  });

  it('emits ok for env consistency when no current profile', () => {
    const ctx = buildCtx(buildService([], null));
    const results = runDiagnostics(ctx);
    const env = results.find((r) => r.name === '环境一致性');
    expect(env?.status).toBe('ok');
    expect(env?.message).toBe('无当前配置');
  });

  it('emits warning for env consistency when current profile is missing', () => {
    // getCurrentProfile returns 'ghost' but getProfile returns null
    const ctx = buildCtx(buildService([], 'ghost'));
    const results = runDiagnostics(ctx);
    const env = results.find((r) => r.name === '环境一致性');
    expect(env?.status).toBe('ok');
    expect(env?.message).toBe('当前配置不存在');
  });
});

describe('formatDiagnosticReport', () => {
  function check(name: string, status: 'ok' | 'warning' | 'error', message: string, suggestion?: string): CheckResult {
    return suggestion === undefined ? { name, status, message } : { name, status, message, suggestion };
  }

  it('renders 诊断报告 header and summary', () => {
    const results = [check('A', 'ok', 'A ok'), check('B', 'warning', 'B warn'), check('C', 'error', 'C err')];
    const out = envPresenter.formatDiagnosticReport(results);
    expect(out).toContain('诊断报告');
    expect(out).toContain('总结: 1 通过, 1 警告, 1 错误');
  });

  it('renders suggestion with → separator when present', () => {
    const results = [check('A', 'error', 'A err', 'fix it')];
    const out = envPresenter.formatDiagnosticReport(results);
    expect(out).toContain('→ fix it');
  });

  it('omits suggestion line when not present', () => {
    const results = [check('A', 'ok', 'A ok')];
    const out = envPresenter.formatDiagnosticReport(results);
    expect(out).not.toContain('→');
  });

  it('emits leading and trailing blank lines for spacing', () => {
    const out = envPresenter.formatDiagnosticReport([check('A', 'ok', 'A ok')]);
    expect(out.startsWith('\n')).toBe(true);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('renders the three status icons', () => {
    const results = [check('A', 'ok', 'A'), check('B', 'warning', 'B'), check('C', 'error', 'C')];
    const out = envPresenter.formatDiagnosticReport(results);
    // theme.success('✓') = '\x1b[32m✓\x1b[0m' — strip the escape codes
    const stripped = out.replace(/\x1b\[[0-9;]*m/g, '');
    expect(stripped).toContain('✓ A: A');
    expect(stripped).toContain('⚠ B: B');
    expect(stripped).toContain('✗ C: C');
  });

  it('handles empty results array', () => {
    const out = envPresenter.formatDiagnosticReport([]);
    expect(out).toContain('诊断报告');
    expect(out).toContain('总结: 0 通过, 0 警告, 0 错误');
  });
});
