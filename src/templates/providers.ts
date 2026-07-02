import type { Profile, EnvConfig } from '../types/index.js';
import { ProviderTemplate } from '../types/index.js';
import { baseEnvTemplate } from './baseEnvTemplate.js';

export const providerTemplates: ProviderTemplate[] = [
  {
    id: 'minimax',
    name: 'MiniMax',
    description: 'MiniMax API',
    defaultBaseUrl: 'https://api.minimaxi.com/anthropic',
    defaultModel: 'MiniMax-M3[1M]',
    envTemplate: {
      ...baseEnvTemplate,
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'MiniMax-M3[1M]',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'MiniMax-M3[1M]',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'MiniMax-M3[1M]',
    },
  },
  {
    id: 'kimi',
    name: 'Kimi (Moonshot)',
    description: 'Moonshot AI Kimi',
    defaultBaseUrl: 'https://api.kimi.com/coding/',
    defaultModel: 'kimi-k2.5',
    envTemplate: {
      ...baseEnvTemplate,
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'kimi-k2.5',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'kimi-k2.5',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'kimi-k2.5',
      CLAUDE_CODE_SUBAGENT_MODEL: 'kimi-k2.5',
    },
  },
  {
    id: 'aliyun',
    name: '阿里云百炼',
    description: '阿里云百炼 API',
    defaultBaseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic',
    defaultModel: 'qwen3.6-plus',
    envTemplate: {
      ...baseEnvTemplate,
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'qwen3.6-plus',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'qwen3.6-plus',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'qwen3.6-plus',
      CLAUDE_CODE_SUBAGENT_MODEL: 'qwen3.6-plus',
    },
  },
  {
    id: 'volcano',
    name: '火山引擎',
    description: '火山引擎方舟 API',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/coding',
    defaultModel: 'GLM-5.1',
    envTemplate: {
      ...baseEnvTemplate,
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'MiniMax-M2.7',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'GLM-5.1',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'MiniMax-M2.7',
    },
  },
  {
    id: 'xunfei',
    name: '讯飞星辰',
    description: '讯飞星辰 Coding Plan API',
    defaultBaseUrl: 'https://maas-coding-api.cn-huabei-1.xf-yun.com/anthropic',
    defaultModel: 'astron-code-latest',
    envTemplate: {
      ...baseEnvTemplate,
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'astron-code-latest',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'astron-code-latest',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'astron-code-latest',
      CLAUDE_CODE_SUBAGENT_MODEL: 'astron-code-latest',
    },
  },
  {
    id: 'xiaomi',
    name: '小米',
    description: '小米 Token Plan API',
    defaultBaseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
    defaultModel: 'mimo-v2.5-pro',
    envTemplate: {
      ...baseEnvTemplate,
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'mimo-v2.5-pro',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'mimo-v2.5-pro',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'mimo-v2.5-pro',
    },
  },
  {
    id: 'zai',
    name: 'z.ai(China)',
    description: '智谱 GLM Coding Plan API',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/anthropic',
    defaultModel: 'glm-5.1',
    envTemplate: {
      ...baseEnvTemplate,
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.1',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-5-turbo',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-4.5-air',
    },
  },
  {
    id: 'custom',
    name: '自定义',
    description: '手动配置所有参数',
    defaultBaseUrl: '',
    defaultModel: '',
    envTemplate: {},
  },
];

export function getProviderById(id: string): ProviderTemplate | undefined {
  return providerTemplates.find((p) => p.id === id);
}

/**
 * Materialize a complete `Profile` from a provider template and the
 * credentials the user supplied. Single source of truth for the
 * `provider.envTemplate + 5 ANTHROPIC_* keys` merge that every profile
 * creation goes through.
 *
 * Why a function and not a method on `ProviderTemplate`: the literal
 * template objects in `providerTemplates` are plain data, and adding
 * a method would require either changing them to classes (large
 * churn) or attaching the method at module load time (clever, but
 * harder to test and to read). A free function is the smallest
 * honest shape.
 */
export function materializeProfile(
  provider: ProviderTemplate,
  input: {
    token: string;
    baseUrl: string;
    sonnetModel: string;
    opusModel: string;
    haikuModel: string;
  },
  profileName: string
): Profile {
  const env: EnvConfig = {
    ...provider.envTemplate,
    ANTHROPIC_BASE_URL: input.baseUrl,
    ANTHROPIC_AUTH_TOKEN: input.token,
    ANTHROPIC_MODEL: input.sonnetModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: input.sonnetModel,
    ANTHROPIC_DEFAULT_OPUS_MODEL: input.opusModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: input.haikuModel,
  };

  return {
    name: profileName,
    description: provider.name,
    env,
  };
}
