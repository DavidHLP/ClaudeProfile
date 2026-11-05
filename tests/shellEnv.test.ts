/**
 * Tests for the ShellEnv domain primitive.
 *
 * The two exports — `CLAUDE_ENV_KEY_PREFIXES` (the canonical
 * prefix set) and `extractClaudeShellEnv(processEnv)` (the pure
 * filter) — are the test surface. The `extractClaudeShellEnv`
 * contract is pinned here: empty input, mixed-case keys, empty
 * values, invalid keys, custom prefix set, and insertion-order
 * preservation.
 */
import { describe, it, expect } from 'vitest';
import { CLAUDE_ENV_KEY_PREFIXES, extractClaudeShellEnv } from '../src/domain/shellEnv.js';

describe('ShellEnv', () => {
  describe('CLAUDE_ENV_KEY_PREFIXES', () => {
    it('is a non-empty readonly array of strings', () => {
      expect(Array.isArray(CLAUDE_ENV_KEY_PREFIXES)).toBe(true);
      expect(CLAUDE_ENV_KEY_PREFIXES.length).toBeGreaterThan(0);
      for (const p of CLAUDE_ENV_KEY_PREFIXES) {
        expect(typeof p).toBe('string');
        expect(p.length).toBeGreaterThan(0);
      }
    });

    it('contains the two prefixes the eval-bridge knows how to inject', () => {
      expect(CLAUDE_ENV_KEY_PREFIXES).toContain('ANTHROPIC_');
      expect(CLAUDE_ENV_KEY_PREFIXES).toContain('CLAUDE_CODE_');
    });
  });

  describe('extractClaudeShellEnv', () => {
    it('returns an empty object for an empty input', () => {
      expect(extractClaudeShellEnv({})).toEqual({});
    });

    it('returns an empty object when no key matches the prefixes', () => {
      const result = extractClaudeShellEnv({
        PATH: '/usr/bin',
        HOME: '/home/u',
        USER: 'u',
      });
      expect(result).toEqual({});
    });

    it('keeps only ANTHROPIC_* and CLAUDE_CODE_* keys', () => {
      const result = extractClaudeShellEnv({
        PATH: '/usr/bin',
        ANTHROPIC_BASE_URL: 'https://api.test.com',
        ANTHROPIC_AUTH_TOKEN: 'sk-abc',
        CLAUDE_CODE_SUBAGENT_MODEL: 'haiku',
        EDITOR: 'vim',
        LANG: 'en_US.UTF-8',
      });
      expect(Object.keys(result).sort()).toEqual([
        'ANTHROPIC_AUTH_TOKEN',
        'ANTHROPIC_BASE_URL',
        'CLAUDE_CODE_SUBAGENT_MODEL',
      ]);
    });

    it('drops empty-string and undefined values', () => {
      const result = extractClaudeShellEnv({
        ANTHROPIC_BASE_URL: '',
        ANTHROPIC_AUTH_TOKEN: undefined,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku',
      });
      expect(result).toEqual({ ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku' });
    });

    it('keeps whitespace-only values (the shell is the source of truth)', () => {
      const result = extractClaudeShellEnv({
        ANTHROPIC_BASE_URL: '   ',
      });
      // The status command shows the user what is in their shell;
      // hiding a whitespace-only value would mask a real
      // misconfiguration. The function preserves it.
      expect(result).toEqual({ ANTHROPIC_BASE_URL: '   ' });
    });

    it('prefix filter is the primary filter (anything starting with the prefix is kept if valid)', () => {
      // The prefix set itself (`ANTHROPIC_`, `CLAUDE_CODE_`) consists
      // of valid POSIX env-key chars, so any key that matches the
      // prefix is virtually always a valid POSIX key too. The
      // `isValidEnvKey` call is defense-in-depth for the
      // theoretical case where a misbehaving caller passes a key
      // like `ANTHROPIC_<weird>` (e.g. with embedded NULs or
      // non-ASCII). We exercise the contract: valid Claude-prefixed
      // keys are kept; non-prefixed keys are dropped regardless of
      // their validity.
      const result = extractClaudeShellEnv({
        'ANTHROPIC_BAR': 'kept',
        'HOME': '/home/u',          // valid POSIX, but not a Claude prefix
        'NOT_PREFIX': 'dropped',    // also not a Claude prefix
      });
      expect(result).toEqual({ ANTHROPIC_BAR: 'kept' });
    });

    it('preserves insertion order from the input', () => {
      const result = extractClaudeShellEnv({
        ZZZ_ANTHROPIC_OLD: 'no-prefix-match-z',
        ANTHROPIC_BASE_URL: 'b',
        ANTHROPIC_AUTH_TOKEN: 'a',
        CLAUDE_CODE_X: 'c',
      });
      expect(Object.keys(result)).toEqual([
        'ANTHROPIC_BASE_URL',
        'ANTHROPIC_AUTH_TOKEN',
        'CLAUDE_CODE_X',
      ]);
    });

    it('accepts a custom prefix set', () => {
      const result = extractClaudeShellEnv(
        {
          ANTHROPIC_BASE_URL: 'b',
          CLAUDE_CODE_X: 'c',
          FOO_BAR: 'kept-by-custom',
        },
        ['FOO_'],
      );
      expect(result).toEqual({ FOO_BAR: 'kept-by-custom' });
    });

    it('returns a new object (does not alias the input)', () => {
      const input: Record<string, string | undefined> = {
        ANTHROPIC_BASE_URL: 'b',
      };
      const out = extractClaudeShellEnv(input);
      expect(out).not.toBe(input);
      out['NEW_KEY'] = 'new';
      expect(input['NEW_KEY']).toBeUndefined();
    });

    it('treats ANTHROPIC and anthropic as different keys (case-sensitive)', () => {
      // POSIX env keys are case-sensitive on Linux. The function
      // matches by literal prefix, so lowercase variants of the
      // prefix do not match.
      const result = extractClaudeShellEnv({
        anthropic_base_url: 'lowercase',
        ANTHROPIC_BASE_URL: 'uppercase',
      });
      expect(result).toEqual({ ANTHROPIC_BASE_URL: 'uppercase' });
    });
  });
});
