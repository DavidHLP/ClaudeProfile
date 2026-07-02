import { describe, it, expect, beforeEach } from 'vitest';
import { providerTemplates, getProviderById } from '../src/templates/providers.js';
import type { ProviderTemplate } from '../src/types/index.js';
import { baseEnvTemplate } from '../src/templates/baseEnvTemplate.js';

describe('zai provider', () => {
  let zai: ProviderTemplate | undefined;

  beforeEach(() => {
    zai = getProviderById('zai');
  });

  it('is registered in providerTemplates', () => {
    expect(zai).toBeDefined();
    expect(zai?.id).toBe('zai');
  });

  it('has the expected metadata fields', () => {
    expect(zai).toMatchObject({
      id: 'zai',
      name: 'z.ai(China)',
      description: '智谱 GLM Coding Plan API',
      defaultBaseUrl: 'https://open.bigmodel.cn/api/anthropic',
      defaultModel: 'glm-5.1',
    });
  });

  it('maps Anthropic model slots to GLM-5 series', () => {
    expect(zai?.envTemplate.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('glm-5.1');
    expect(zai?.envTemplate.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('glm-5-turbo');
    expect(zai?.envTemplate.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('glm-4.5-air');
  });

  it('inherits the base env template (BUG workarounds + timeout + telemetry)', () => {
    expect(zai).toBeDefined();
    for (const [key, value] of Object.entries(baseEnvTemplate)) {
      expect(zai?.envTemplate[key]).toBe(value);
    }
  });

  it('does not set CLAUDE_CODE_SUBAGENT_MODEL (lets Claude Code use Haiku default)', () => {
    expect(zai?.envTemplate.CLAUDE_CODE_SUBAGENT_MODEL).toBeUndefined();
  });

});

describe('baseEnvTemplate contract', () => {
  it('contains all four cross-provider base keys', () => {
    expect(baseEnvTemplate).toMatchObject({
      ENABLE_TOOL_SEARCH: '0',
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
      API_TIMEOUT_MS: '3000000',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    });
  });
});

describe('zai ordering', () => {
  it('is positioned after xiaomi and before custom', () => {
    const ids = providerTemplates.map((p) => p.id);
    const xiaomiIdx = ids.indexOf('xiaomi');
    const zaiIdx = ids.indexOf('zai');
    const customIdx = ids.indexOf('custom');

    expect(xiaomiIdx).toBeGreaterThanOrEqual(0);
    expect(zaiIdx).toBeGreaterThan(xiaomiIdx);
    expect(customIdx).toBeGreaterThan(zaiIdx);
  });
});
