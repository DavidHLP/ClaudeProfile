import { ProviderTemplate } from '../types/index.js';

export const providerTemplates: ProviderTemplate[] = [
  {
    id: 'minimax',
    name: 'MiniMax',
    description: 'MiniMax API',
    defaultBaseUrl: 'https://api.minimaxi.com/anthropic',
    defaultModel: 'MiniMax-M2.7',
    envTemplate: {
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'MiniMax-M2.7',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'MiniMax-M2.7',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'MiniMax-M2.7',
      API_TIMEOUT_MS: '3000000',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    },
  },
  {
    id: 'kimi',
    name: 'Kimi (Moonshot)',
    description: 'Moonshot AI Kimi',
    defaultBaseUrl: 'https://api.kimi.com/coding/',
    defaultModel: 'kimi-k2.5',
    envTemplate: {
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
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'astron-code-latest',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'astron-code-latest',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'astron-code-latest',
      CLAUDE_CODE_SUBAGENT_MODEL: 'astron-code-latest',
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
