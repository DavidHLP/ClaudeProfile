import { describe, it, expect } from 'vitest';
import { validateUrl, validateToken, ValidationError } from '../src/utils/validation.js';

describe('URL Validation', () => {
  it('accepts valid https URL', () => {
    expect(validateUrl('https://api.minimaxi.com')).toBe(true);
    expect(validateUrl('https://api.anthropic.com')).toBe(true);
    expect(validateUrl('https://dash.dashscope.aliyuncs.com')).toBe(true);
  });

  it('accepts valid http URL', () => {
    expect(validateUrl('http://localhost:8080')).toBe(true);
    expect(validateUrl('http://192.168.1.1:3000')).toBe(true);
  });

  it('rejects URL without scheme', () => {
    expect(validateUrl('api.minimaxi.com')).toBe(false);
  });

  it('rejects URL with invalid scheme', () => {
    expect(validateUrl('ftp://api.minimaxi.com')).toBe(false);
    expect(validateUrl('ws://api.minimaxi.com')).toBe(false);
  });

  it('rejects URL with missing host', () => {
    expect(validateUrl('https://')).toBe(false);
    expect(validateUrl('http://')).toBe(false);
  });

  it('rejects empty URL', () => {
    expect(validateUrl('')).toBe(false);
  });

  it('rejects URL with whitespace', () => {
    expect(validateUrl('  https://api.minimaxi.com  ')).toBe(false);
    expect(validateUrl('https://api .minimaxi.com')).toBe(false);
  });
});

describe('Token Validation', () => {
  it('accepts valid non-empty token', () => {
    expect(validateToken('sk-test-1234567890')).toBe(true);
    expect(validateToken('abc123xyz')).toBe(true);
    expect(validateToken('token_with_underscores')).toBe(true);
  });

  it('rejects empty token', () => {
    expect(validateToken('')).toBe(false);
  });

  it('rejects whitespace-only token', () => {
    expect(validateToken('   ')).toBe(false);
    expect(validateToken('\t\n')).toBe(false);
  });

  it('rejects token that is too short', () => {
    expect(validateToken('ab')).toBe(false);
  });
});

describe('ValidationError', () => {
  it('has correct properties', () => {
    const error = new ValidationError('Invalid URL', 'https://example.com', 'URL_INVALID');

    expect(error.message).toBe('Invalid URL');
    expect(error.context).toEqual({ value: 'https://example.com' });
    expect(error.code).toBe('URL_INVALID');
    expect(error.name).toBe('ValidationError');
  });

  it('formats error message with context', () => {
    const error = new ValidationError('Token too short', 'abc', 'TOKEN_TOO_SHORT');
    expect(error.getFormattedMessage()).toBe('Token too short (value: abc)');
  });
});
