import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnvConfig } from '../src/types/index.js';
import { ApiConnectivityError } from '../src/utils/connectivity.js';
import { SettingsSyncServiceImpl } from '../src/services/settingsSyncService.js';
import type { ClaudeSettingsStore } from '../src/config/claudeSettingsStore.js';

describe('API Connectivity Detection', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns true for reachable API endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('{"object":"model_list"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const { checkApiConnectivity } = await import('../src/utils/connectivity.js');

    const result = await checkApiConnectivity('https://api.test.com', 'test-token');
    expect(result).toBe(true);
  });

  it('returns false for unreachable API endpoint', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { checkApiConnectivity } = await import('../src/utils/connectivity.js');

    const result = await checkApiConnectivity('https://unreachable.api', 'test-token');
    expect(result).toBe(false);
  });

  it('returns false for 401 Unauthorized', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('Unauthorized', { status: 401 })
    );

    const { checkApiConnectivity } = await import('../src/utils/connectivity.js');

    const result = await checkApiConnectivity('https://api.test.com', 'invalid-token');
    expect(result).toBe(false);
  });

  it('returns false for 403 Forbidden', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('Forbidden', { status: 403 })
    );

    const { checkApiConnectivity } = await import('../src/utils/connectivity.js');

    const result = await checkApiConnectivity('https://api.test.com', 'forbidden-token');
    expect(result).toBe(false);
  });

  it('throws ApiConnectivityError with correct context', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const { checkApiConnectivity, ApiConnectivityError } = await import('../src/utils/connectivity.js');

    await expect(checkApiConnectivity('https://api.test.com', 'token', { throwOnError: true }))
      .rejects.toThrow(ApiConnectivityError);
  });

  it('uses correct timeout', async () => {
    const mockFetch = vi.fn().mockImplementation(
      (url: string, options?: { signal?: AbortSignal }) => {
        return new Promise((_, reject) => {
          const timeoutId = setTimeout(() => {
            if (options?.signal?.aborted) {
              reject(new Error('Aborted'));
            } else {
              reject(new DOMException('Aborted', 'AbortError'));
            }
          }, 100);
          options?.signal?.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }
    );
    global.fetch = mockFetch;

    const { checkApiConnectivity } = await import('../src/utils/connectivity.js');

    const result = await checkApiConnectivity('https://api.test.com', 'token', { timeoutMs: 50 });
    expect(result).toBe(false);
  });
});

describe('ApiConnectivityError', () => {
  it('has correct properties', () => {
    const error = new ApiConnectivityError(
      'Failed to connect',
      'https://api.test.com',
      500,
      'Internal Server Error'
    );

    expect(error.message).toBe('Failed to connect');
    expect(error.context).toEqual({
      url: 'https://api.test.com',
      statusCode: 500,
      statusText: 'Internal Server Error',
    });
    expect(error.code).toBe('API_CONNECTIVITY_ERROR');
    expect(error.name).toBe('ApiConnectivityError');
  });
});

describe('SettingsSyncService Error Handling', () => {
  let mockStore: ClaudeSettingsStore;
  let service: SettingsSyncServiceImpl;

  beforeEach(() => {
    mockStore = {
      readEnv: vi.fn().mockReturnValue({}),
      writeEnv: vi.fn().mockImplementation(() => {
        throw new Error('Permission denied');
      }),
    } as unknown as ClaudeSettingsStore;

    service = new SettingsSyncServiceImpl(mockStore);
  });

  it('throws error when sync fails in strict mode', () => {
    const env: EnvConfig = {
      ANTHROPIC_AUTH_TOKEN: 'test-token',
    };

    expect(() => {
      service.syncOnSwitch(null, env, { errorStrategy: 'strict' });
    }).toThrow('Permission denied');
  });

  it('returns result with warning when sync fails in warn mode', () => {
    const env: EnvConfig = {
      ANTHROPIC_AUTH_TOKEN: 'test-token',
    };

    const result = service.syncOnSwitch(null, env, { errorStrategy: 'warn' });

    expect(result).toEqual({
      success: false,
      warning: 'Failed to sync to ~/.claude/settings.json: Permission denied',
    });
  });

  it('continues silently when sync fails in silent mode', () => {
    const env: EnvConfig = {
      ANTHROPIC_AUTH_TOKEN: 'test-token',
    };

    const result = service.syncOnSwitch(null, env, { errorStrategy: 'silent' });

    expect(result).toEqual({ success: false });
    expect(mockStore.writeEnv).toHaveBeenCalled();
  });

  it('uses warn as default strategy', () => {
    const env: EnvConfig = {
      ANTHROPIC_AUTH_TOKEN: 'test-token',
    };

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    service.syncOnSwitch(null, env);

    expect(stderrSpy).toHaveBeenCalledWith(
      'Warning: Failed to sync to ~/.claude/settings.json: Permission denied\n'
    );

    stderrSpy.mockRestore();
  });

  it('returns success when sync succeeds', () => {
    mockStore.writeEnv = vi.fn().mockReturnValue(undefined);

    const env: EnvConfig = {
      ANTHROPIC_AUTH_TOKEN: 'test-token',
    };

    const result = service.syncOnSwitch(null, env);

    expect(result).toEqual({ success: true });
  });
});
