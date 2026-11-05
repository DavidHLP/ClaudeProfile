import { describe, it, expect } from 'vitest';
import { providerTemplates } from '../src/templates/providers.js';
import { baseEnvTemplate } from '../src/templates/baseEnvTemplate.js';

// 派生：所有非 custom 的内置 provider。custom 没有模型槽位，不参与 base 继承验证。
const BUILT_IN_IDS = providerTemplates.map((p) => p.id).filter((id) => id !== 'custom');

describe('baseEnvTemplate inheritance', () => {
  for (const id of BUILT_IN_IDS) {
    describe(`provider "${id}"`, () => {
      const provider = providerTemplates.find((p) => p.id === id);

      it('is registered in the built-in list', () => {
        expect(provider).toBeDefined();
      });

      it('contains every baseEnvTemplate key with the expected value', () => {
        expect(provider).toBeDefined();
        for (const [key, value] of Object.entries(baseEnvTemplate)) {
          expect(provider?.envTemplate[key]).toBe(value);
        }
      });

      it('still sets Opus/Sonnet/Haiku model slots', () => {
        expect(provider).toBeDefined();
        expect(provider?.envTemplate.ANTHROPIC_DEFAULT_OPUS_MODEL).toBeDefined();
        expect(provider?.envTemplate.ANTHROPIC_DEFAULT_SONNET_MODEL).toBeDefined();
        expect(provider?.envTemplate.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBeDefined();
      });
    });
  }
});

describe('xiaomi envTemplate cleanup (PR2 follow-up)', () => {
  const xiaomi = providerTemplates.find((p) => p.id === 'xiaomi');

  it('no longer carries the dead-code ANTHROPIC_BASE_URL duplicate', () => {
    // The URL is now solely expressed via defaultBaseUrl; create.ts copies it into the profile.
    expect(xiaomi?.envTemplate.ANTHROPIC_BASE_URL).toBeUndefined();
  });

  it('no longer carries the suspicious literal "MIMO_API_KEY" auth token', () => {
    // create.ts always overwrites ANTHROPIC_AUTH_TOKEN with user input,
    // so this literal was dead code (and would have been a security footgun if ever persisted).
    expect(xiaomi?.envTemplate.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });

  it('no longer carries ANTHROPIC_MODEL (the create flow derives it from input)', () => {
    expect(xiaomi?.envTemplate.ANTHROPIC_MODEL).toBeUndefined();
  });
});
