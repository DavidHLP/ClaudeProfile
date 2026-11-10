import { describe, it as nativeIt, beforeEach, afterEach, before, after } from 'node:test';
import { expect } from 'expect';
import { ModuleMocker } from 'jest-mock';
import { format } from 'node:util';

export { describe, beforeEach, afterEach, before, after, expect };
const moduleMocker = new ModuleMocker(globalThis);
const env = new Map<string, string | undefined>();
export const mocks = {
  fn: moduleMocker.fn.bind(moduleMocker),
  clearAllMocks: () => moduleMocker.clearAllMocks(),
  stubEnv(name: string, value: string) {
    if (!env.has(name)) env.set(name, process.env[name]);
    process.env[name] = value;
  },
  unstubAllEnvs() {
    for (const [name, value] of env) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    env.clear();
  },
};
export const it = Object.assign(
  (name: string, fn: () => unknown, timeout?: number) => nativeIt(name, { timeout: timeout ?? 5_000 }, fn),
  { each: <T>(rows: readonly T[]) => (name: string, fn: (row: T) => unknown, timeout?: number) => {
    for (const row of rows) nativeIt(format(name, row), { timeout: timeout ?? 5_000 }, () => fn(row));
  } },
);
