import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiConnectivityError } from '../src/utils/connectivity.js';

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
