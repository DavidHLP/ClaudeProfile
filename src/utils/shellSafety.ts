import { AppError } from '../errors.js';

const POSIX_ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidEnvKey(key: string): boolean {
  return POSIX_ENV_KEY_REGEX.test(key);
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function validateEnvKeyOrThrow(key: string): void {
  if (!isValidEnvKey(key)) {
    throw new AppError(
      `非法的环境变量名称: "${key}". 环境变量名必须符合 POSIX 标准 (^[A-Za-z_][A-Za-z0-9_]*$)`,
      'INVALID_ENV_KEY'
    );
  }
}
