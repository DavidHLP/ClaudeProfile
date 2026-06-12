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
