export interface EnvConfig {
  [key: string]: string | undefined;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_AUTH_TOKEN?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_DEFAULT_SONNET_MODEL?: string;
  ANTHROPIC_DEFAULT_OPUS_MODEL?: string;
  ANTHROPIC_DEFAULT_HAIKU_MODEL?: string;
  CLAUDE_CODE_SUBAGENT_MODEL?: string;
  API_TIMEOUT_MS?: string;
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC?: string;
  // Claude Code v2.1.69 BUG 规避：https://github.com/anthropics/claude-code/issues/30926
  ENABLE_TOOL_SEARCH?: string;
  CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS?: string;
  // 默认 effort 等级（env var 优先级最高，max 可持久）；第三方 provider 需配合 ALWAYS_ENABLE_EFFORT=1
  CLAUDE_CODE_EFFORT_LEVEL?: string;
  CLAUDE_CODE_ALWAYS_ENABLE_EFFORT?: string;
  // 自动压缩触发百分比（1-100，达到窗口的该百分比时压缩）
  CLAUDE_AUTOCOMPACT_PCT_OVERRIDE?: string;
}

export interface Profile {
  name: string;
  description: string;
  env: EnvConfig;
}

export interface ProviderTemplate {
  id: string;
  name: string;
  description: string;
  defaultBaseUrl: string;
  defaultModel: string;
  envTemplate: Partial<EnvConfig>;
}
