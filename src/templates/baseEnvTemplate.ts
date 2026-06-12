import type { EnvConfig } from '../types/index.js';

/**
 * 跨 provider 通用 env 基线。
 *
 * 每个内置 provider 的 `envTemplate` 都应通过 `...baseEnvTemplate` 合并这些键，
 * 以保证：
 *   1. Claude Code v2.1.69 BUG 规避（ENABLE_TOOL_SEARCH=0 +
 *      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1），参考
 *      https://github.com/anthropics/claude-code/issues/30926
 *   2. 长任务超时窗口（API_TIMEOUT_MS=3000000，对应 50 分钟）
 *   3. 关闭 Claude Code 非必要流量上报
 *
 * 与 provider 业务相关（base URL、auth token、模型槽位）的字段不进 base，
 * 由各 provider 的 `envTemplate` 自行扩展。
 */
export const baseEnvTemplate: Partial<EnvConfig> = {
  ENABLE_TOOL_SEARCH: '0',
  CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
  API_TIMEOUT_MS: '3000000',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
};
