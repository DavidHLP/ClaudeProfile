import { describe, it, expect } from 'vitest';
import { AppError } from '../src/errors.js';
import { isValidEnvKey, shellQuote, validateEnvKeyOrThrow } from '../src/utils/shellSafety.js';

describe('shellSafety', () => {
  describe('isValidEnvKey', () => {
    it('should accept valid POSIX env keys', () => {
      expect(isValidEnvKey('FOO')).toBe(true);
      expect(isValidEnvKey('_FOO')).toBe(true);
      expect(isValidEnvKey('FOO_BAR')).toBe(true);
      expect(isValidEnvKey('FOO123')).toBe(true);
      expect(isValidEnvKey('a')).toBe(true);
    });

    it('should reject keys starting with digit', () => {
      expect(isValidEnvKey('1FOO')).toBe(false);
      expect(isValidEnvKey('123')).toBe(false);
    });

    it('should reject keys with hyphens', () => {
      expect(isValidEnvKey('FOO-BAR')).toBe(false);
    });

    it('should reject keys with spaces', () => {
      expect(isValidEnvKey('FOO BAR')).toBe(false);
    });

    it('should reject keys with special characters', () => {
      expect(isValidEnvKey('FOO;BAR')).toBe(false);
      expect(isValidEnvKey('FOO$(cmd)')).toBe(false);
      expect(isValidEnvKey('FOO=`cmd`')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidEnvKey('')).toBe(false);
    });
  });

  describe('shellQuote', () => {
    it('should wrap value in single quotes', () => {
      expect(shellQuote('hello')).toBe("'hello'");
    });

    it('should escape single quotes', () => {
      expect(shellQuote("it's")).toBe("'it'\\''s'");
    });

    it('should handle multiple single quotes', () => {
      expect(shellQuote("''")).toBe("''\\'''\\'''");
    });

    it('should preserve backticks and $() unchanged', () => {
      expect(shellQuote('`rm -rf /`')).toBe("'`rm -rf /`'");
      expect(shellQuote('$(whoami)')).toBe("'$(whoami)'");
    });
  });

  describe('validateEnvKeyOrThrow', () => {
    it('should not throw for valid keys', () => {
      expect(() => validateEnvKeyOrThrow('FOO')).not.toThrow();
    });

    it('should throw for invalid keys', () => {
      expect(() => validateEnvKeyOrThrow('FOO-BAR')).toThrow();
      expect(() => validateEnvKeyOrThrow('1FOO')).toThrow();
      try {
        validateEnvKeyOrThrow('FOO-BAR');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).code).toBe('INVALID_ENV_KEY');
      }
    });
  });
});
