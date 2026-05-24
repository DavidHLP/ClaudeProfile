import { AppError } from '../errors.js';
import { isValidEnvKey } from './shellSafety.js';

export class ValidationError extends AppError {
  constructor(
    message: string,
    value: string,
    code: string
  ) {
    super(message, code, { value });
    this.name = 'ValidationError';
  }

  getFormattedMessage(): string {
    return `${this.message} (value: ${this.context?.value})`;
  }
}

const PROFILE_NAME_REGEX = /^[a-zA-Z0-9-_]+$/;

export function validateProfileName(name: string): ValidationError | null {
  if (!name || typeof name !== 'string') {
    return new ValidationError('Profile name is required', '', 'NAME_REQUIRED');
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return new ValidationError('Profile name cannot be empty', name, 'NAME_EMPTY');
  }

  if (!PROFILE_NAME_REGEX.test(trimmed)) {
    return new ValidationError(
      'Profile name can only contain letters, numbers, hyphens, and underscores',
      name,
      'NAME_INVALID'
    );
  }

  return null;
}

export function validateEnvKey(key: string): ValidationError | null {
  if (!key || typeof key !== 'string') {
    return new ValidationError('Env key is required', '', 'ENV_KEY_REQUIRED');
  }

  if (!isValidEnvKey(key)) {
    return new ValidationError(
      `Invalid env key: "${key}". Must match POSIX standard (^[A-Za-z_][A-Za-z0-9_]*$)`,
      key,
      'ENV_KEY_INVALID'
    );
  }

  return null;
}

export function validateEnvValue(value: unknown): ValidationError | null {
  if (value === undefined || value === null) {
    return new ValidationError('Env value cannot be null or undefined', String(value), 'ENV_VALUE_NULL');
  }

  if (typeof value !== 'string') {
    return new ValidationError('Env value must be a string', String(value), 'ENV_VALUE_TYPE');
  }

  if (value.includes('\0')) {
    return new ValidationError('Env value cannot contain null bytes', value, 'ENV_VALUE_NULL');
  }

  if (value.includes('\n')) {
    return new ValidationError('Env value cannot contain newlines (shell export does not support multi-line values)', value, 'ENV_VALUE_NEWLINE');
  }

  return null;
}

export function validateUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const trimmed = url.trim();
  if (trimmed !== url) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateToken(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const trimmed = token.trim();
  if (trimmed.length === 0) {
    return false;
  }

  if (trimmed.length < 3) {
    return false;
  }

  return true;
}

export interface ProfileValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export function validateProfileUrl(url: string | undefined): ValidationError | null {
  if (!url) {
    return new ValidationError('URL is required', '', 'URL_REQUIRED');
  }

  if (!validateUrl(url)) {
    return new ValidationError('Invalid URL format', url, 'URL_INVALID');
  }

  return null;
}

export function validateProfileToken(token: string | undefined): ValidationError | null {
  if (!token) {
    return new ValidationError('Token is required', '', 'TOKEN_REQUIRED');
  }

  if (!validateToken(token)) {
    return new ValidationError('Invalid token format', token, 'TOKEN_INVALID');
  }

  return null;
}
