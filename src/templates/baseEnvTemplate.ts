import type { EnvConfig } from '../types/index.js';

/**
 * 跨 provider 通用 env 基线（单一事实源）。
 *
 * 这些键同时服务两处：
 *   1. 每个内置 provider 的 `envTemplate` 通过 `...baseEnvTemplate` 合并它们
 *      （switch 时随 profile.env 注入）；
 *   2. `eval "$(claude-profile init)"` 时由 buildDefaultEnvBlock 作为默认基线注入
 *      当前 shell，让未配置 profile 的用户也开箱即用。
 *
 *   1. Claude Code v2.1.69 BUG 规避（ENABLE_TOOL_SEARCH=0 +
 *      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1），参考
 *      https://github.com/anthropics/claude-code/issues/30926
 *   2. 长任务超时窗口（API_TIMEOUT_MS=3000000，对应 50 分钟）
 *   3. 关闭 Claude Code 非必要流量上报
 *   4. 默认最高 effort（CLAUDE_CODE_EFFORT_LEVEL=ultracode）：env var 优先级高于 /effort
 *      和 effortLevel 设置，且 ultracode 经 env var 设置可持久（绕过其 session-only 限制）。
 *      配合 CLAUDE_CODE_ALWAYS_ENABLE_EFFORT=1——走第三方 provider/自定义模型 ID 时，
 *      Claude Code 不识别为 effort-capable，需强制发送 effort 参数，否则 ultracode 形同虚设。
 *      参考 https://code.claude.com/docs/en/env-vars 与 model-config
 *   5. 自动压缩百分比（CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=75）：在 autocompact 窗口的
 *      75% 时触发压缩（更早压缩，避免接近上限才压）。注意：仅在 Claude Code 主动压缩
 *      场景生效（标准 200K 模型 / cloud 会话）；扩展上下文或 Opus 4.8 本地会话需配合
 *      CLAUDE_CODE_AUTO_COMPACT_WINDOW 才生效。参考 code.claude.com/docs/en/env-vars
 *
 * 与 provider 业务相关（base URL、auth token、模型槽位）的字段不进 base，
 * 由各 provider 的 `envTemplate` 自行扩展。
 */
export const baseEnvTemplate: Partial<EnvConfig> = {
  ENABLE_TOOL_SEARCH: '0',
  CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
  API_TIMEOUT_MS: '3000000',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  CLAUDE_CODE_EFFORT_LEVEL: 'ultracode',
  CLAUDE_CODE_ALWAYS_ENABLE_EFFORT: '1',
  CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '75',
};
