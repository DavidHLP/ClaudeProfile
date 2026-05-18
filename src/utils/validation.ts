import { AppError } from '../errors.js';

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
