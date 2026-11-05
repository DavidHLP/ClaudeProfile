import { AppError } from '../errors.js';
import { CommandResult } from '../types/command.js';
import { CancelledError } from './interactiveSession.js';

export function toCommandResult(err: unknown, operation: string): CommandResult {
  if (err instanceof CancelledError) {
    return { success: false, error: err.message, wasCancelled: true };
  }
  if (err instanceof AppError) {
    return { success: false, error: err.message };
  }
  return { success: false, error: `${operation}失败: ${err instanceof Error ? err.message : String(err)}` };
}

export async function runCommand(
  operation: string,
  fn: () => Promise<CommandResult>
): Promise<CommandResult> {
  try {
    return await fn();
  } catch (err) {
    return toCommandResult(err, operation);
  }
}
