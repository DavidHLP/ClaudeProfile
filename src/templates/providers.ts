import type { Profile, EnvConfig } from '../types/index.js';
import { ProviderTemplate } from '../types/index.js';
import { baseEnvTemplate } from './baseEnvTemplate.js';
import { applyField } from '../domain/profileSchema.js';

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
    // 自定义模式同样继承 baseEnvTemplate：
    // 1) 与其他 provider 行为一致（CLAUDE_CODE_EFFORT_LEVEL=max 等基线键进 profile.env）
    // 2) profile 可移植：拷贝到别处仍带 max effort 默认
    // 3) 避免未来 envDiff 清理"多余" CLAUDE_CODE_* 键时静默丢失 max
    // 模型槽位由用户在 create 时手填，这里不预设 ANTHROPIC_DEFAULT_*_MODEL。
    envTemplate: { ...baseEnvTemplate },
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
    /**
     * Optional. Defaults to the provider's `envTemplate.CLAUDE_CODE_EFFORT_LEVEL`
     * (or `'max'` if absent) so older callers that pass only the 5
     * first-class fields keep working unchanged.
     */
    effortLevel?: string;
  },
  profileName: string
): Profile {
  // Field-by-field application: each `applyField` call writes to every
  // env key the field owns, so the SONNET slot also updates the legacy
  // `ANTHROPIC_MODEL` env key in lock-step. The schema is the single
  // source of truth for which env keys each field controls.
  let env: EnvConfig = { ...provider.envTemplate };
  env = applyField(env, 'baseUrl', input.baseUrl);
  env = applyField(env, 'token', input.token);
  env = applyField(env, 'sonnetModel', input.sonnetModel);
  env = applyField(env, 'opusModel', input.opusModel);
  env = applyField(env, 'haikuModel', input.haikuModel);
  // Resolve the EFFORT default from the provider template (which already
  // carries baseEnvTemplate.CLAUDE_CODE_EFFORT_LEVEL for every built-in
  // provider including 'custom'); fall back to 'max' for synthetic test
  // providers that omit it.
  const effort = input.effortLevel ?? provider.envTemplate.CLAUDE_CODE_EFFORT_LEVEL ?? 'max';
  env = applyField(env, 'effortLevel', effort);

  return {
    name: profileName,
    description: provider.name,
    env,
  };
}
