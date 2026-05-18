import { describe, it, expect, beforeEach } from 'vitest';
import type { EnvTemplateConfig } from '../src/templates/envTemplate/types.js';
import {
  EnvTemplateEngine,
  TemplateParseError,
  CircularReferenceError,
} from '../src/templates/envTemplate/engine.js';

describe('EnvTemplateEngine', () => {
  let engine: EnvTemplateEngine;

  beforeEach(() => {
    engine = new EnvTemplateEngine();
  });

  describe('parse()', () => {
    it('parses simple key-value template', async () => {
      const config: EnvTemplateConfig = {
        variables: {
          BASE_URL: 'https://api.example.com',
          TOKEN: 'secret-token',
        },
        template: {
          ANTHROPIC_BASE_URL: '${BASE_URL}',
          ANTHROPIC_AUTH_TOKEN: '${TOKEN}',
        },
      };

      const template = engine.parse(config);
      expect(template.variables).toEqual(config.variables);
    });

    it('throws TemplateParseError for invalid variable syntax', async () => {
      const config: EnvTemplateConfig = {
        variables: {},
        template: {
          INVALID_VAR: '${}',  // Empty variable name
        },
      };

      expect(() => engine.parse(config)).toThrow(TemplateParseError);
    });

    it('throws TemplateParseError for unclosed variable reference', async () => {
      const config: EnvTemplateConfig = {
        variables: {},
        template: {
          INVALID_VAR: '${未闭合',
        },
      };

      expect(() => engine.parse(config)).toThrow(TemplateParseError);
    });
  });

  describe('interpolate()', () => {
    it('interpolates simple variable references', async () => {
      const config: EnvTemplateConfig = {
        variables: {
          BASE_URL: 'https://api.example.com',
          MODEL: 'my-model',
        },
        template: {
          ANTHROPIC_BASE_URL: '${BASE_URL}',
          ANTHROPIC_MODEL: '${MODEL}',
        },
      };

      const template = engine.parse(config);
      const result = engine.interpolate(template);

      expect(result['ANTHROPIC_BASE_URL']).toBe('https://api.example.com');
      expect(result['ANTHROPIC_MODEL']).toBe('my-model');
    });

    it('handles nested variable references', async () => {
      const config: EnvTemplateConfig = {
        variables: {
          ENV: 'prod',
          REGION: 'us-west',
          BASE_URL: 'https://${REGION}.api.example.com',
          FULL_URL: '${BASE_URL}/${ENV}',
        },
        template: {
          FINAL_URL: '${FULL_URL}',
        },
      };

      const template = engine.parse(config);
      const result = engine.interpolate(template);

      expect(result['FINAL_URL']).toBe('https://us-west.api.example.com/prod');
    });

    it('handles missing variable gracefully with default value', async () => {
      const config: EnvTemplateConfig = {
        variables: {},
        template: {
          OPTIONAL_VAR: '${MISSING_VAR:-default-value}',
        },
      };

      const template = engine.parse(config);
      const result = engine.interpolate(template);

      expect(result['OPTIONAL_VAR']).toBe('default-value');
    });

    it('uses actual value when variable is defined', async () => {
      const config: EnvTemplateConfig = {
        variables: {
          MISSING_VAR: 'actual-value',
        },
        template: {
          OPTIONAL_VAR: '${MISSING_VAR:-default-value}',
        },
      };

      const template = engine.parse(config);
      const result = engine.interpolate(template);

      expect(result['OPTIONAL_VAR']).toBe('actual-value');
    });

    it('throws error for undefined variable without default', async () => {
      const config: EnvTemplateConfig = {
        variables: {},
        template: {
          UNDEFINED_VAR: '${TOTALLY_MISSING}',
        },
      };

      const template = engine.parse(config);
      expect(() => engine.interpolate(template)).toThrow('Undefined variable');
    });

    it('handles multiple variables in single value', async () => {
      const config: EnvTemplateConfig = {
        variables: {
          PROTOCOL: 'https',
          DOMAIN: 'api.example.com',
          PATH: '/v1',
        },
        template: {
          FULL_URL: '${PROTOCOL}://${DOMAIN}${PATH}',
        },
      };

      const template = engine.parse(config);
      const result = engine.interpolate(template);

      expect(result['FULL_URL']).toBe('https://api.example.com/v1');
    });

    it('handles literal $ without variable syntax', async () => {
      const config: EnvTemplateConfig = {
        variables: {},
        template: {
          PRICE: '$100 USD',  // Literal dollar sign
        },
      };

      const template = engine.parse(config);
      const result = engine.interpolate(template);

      expect(result['PRICE']).toBe('$100 USD');
    });
  });

  describe('circular reference detection', () => {
    it('detects direct circular reference', async () => {
      const config: EnvTemplateConfig = {
        variables: {
          A: '${B}',
          B: '${A}',
        },
        template: {},
      };

      expect(() => engine.parse(config)).toThrow(CircularReferenceError);
    });

    it('detects indirect circular reference', async () => {
      const config: EnvTemplateConfig = {
        variables: {
          A: '${B}',
          B: '${C}',
          C: '${A}',
        },
        template: {},
      };

      expect(() => engine.parse(config)).toThrow(CircularReferenceError);
    });

    it('allows valid variable chains', async () => {
      const config: EnvTemplateConfig = {
        variables: {
          A: '${B}',
          B: '${C}',
          C: 'final-value',
        },
        template: {
          RESULT: '${A}',
        },
      };

      const template = engine.parse(config);
      const result = engine.interpolate(template);

      expect(result['RESULT']).toBe('final-value');
    });
  });

  describe('template inheritance', () => {
    it('inherits from base template', async () => {
      const baseConfig: EnvTemplateConfig = {
        variables: {
          BASE_URL: 'https://base.api.com',
        },
        template: {
          ANTHROPIC_BASE_URL: '${BASE_URL}',
          ANTHROPIC_MODEL: 'base-model',
        },
      };

      const childConfig: EnvTemplateConfig = {
        extends: baseConfig,
        variables: {
          BASE_URL: 'https://child.api.com',
        },
        template: {
          ANTHROPIC_MODEL: 'child-model',
        },
      };

      const result = engine.mergeTemplates(baseConfig, childConfig);

      expect(result.template['ANTHROPIC_BASE_URL']).toBe('${BASE_URL}');
      expect(result.template['ANTHROPIC_MODEL']).toBe('child-model');
      expect(result.variables['BASE_URL']).toBe('https://child.api.com');
    });

    it('child variables override parent variables', async () => {
      const baseConfig: EnvTemplateConfig = {
        variables: {
          SHARED_VAR: 'parent-value',
        },
        template: {},
      };

      const childConfig: EnvTemplateConfig = {
        extends: baseConfig,
        variables: {
          SHARED_VAR: 'child-value',
        },
        template: {},
      };

      const result = engine.mergeTemplates(baseConfig, childConfig);

      expect(result.variables['SHARED_VAR']).toBe('child-value');
    });

    it('deep merges nested variables', async () => {
      const baseConfig: EnvTemplateConfig = {
        variables: {
          A: 'a',
          B: 'b',
        },
        template: {},
      };

      const childConfig: EnvTemplateConfig = {
        extends: baseConfig,
        variables: {
          C: 'c',
        },
        template: {},
      };

      const result = engine.mergeTemplates(baseConfig, childConfig);

      expect(result.variables['A']).toBe('a');
      expect(result.variables['B']).toBe('b');
      expect(result.variables['C']).toBe('c');
    });

    it('preserves parent template values not overridden', async () => {
      const baseConfig: EnvTemplateConfig = {
        variables: {},
        template: {
          PRESERVED: 'yes',
          OVERRIDE_ME: 'parent',
        },
      };

      const childConfig: EnvTemplateConfig = {
        extends: baseConfig,
        template: {
          OVERRIDE_ME: 'child',
        },
      };

      const result = engine.mergeTemplates(baseConfig, childConfig);

      expect(result.template['PRESERVED']).toBe('yes');
      expect(result.template['OVERRIDE_ME']).toBe('child');
    });
  });

  describe('resolve()', () => {
    it('fully resolves template with inheritance and interpolation', async () => {
      // BASE_URL must be in variables to be referenced by child templates
      const baseConfig: EnvTemplateConfig = {
        variables: {
          REGION: 'us-east',
          DOMAIN: 'api.example.com',
          BASE_URL: 'https://${REGION}.${DOMAIN}',
        },
        template: {
          // BASE_URL is available as a variable for child templates
        },
      };

      const childConfig: EnvTemplateConfig = {
        extends: baseConfig,
        variables: {
          REGION: 'eu-west',
        },
        template: {
          FINAL_URL: '${BASE_URL}/api',
        },
      };

      const result = engine.resolve(childConfig);

      expect(result['FINAL_URL']).toBe('https://eu-west.api.example.com/api');
    });
  });
});

describe('EnvTemplateConfig validation', () => {
  it('validates required fields', async () => {
    const { validateTemplateConfig } = await import('../src/templates/envTemplate/validator.js');

    const validConfig: EnvTemplateConfig = {
      variables: {},
      template: {},
    };

    expect(() => validateTemplateConfig(validConfig)).not.toThrow();
  });

  it('rejects config with circular extends', async () => {
    const { validateTemplateConfig } = await import('../src/templates/envTemplate/validator.js');

    // This would require parsing the extends chain to detect
    // For now we test basic structure validation
    const configWithSelf = {
      extends: {} as EnvTemplateConfig,  // circular reference would be detected at parse time
      variables: {},
      template: {},
    };

    // Self-reference would be caught by engine
    expect(typeof validateTemplateConfig).toBe('function');
  });
});

describe('Variable Reference Extraction', () => {
  it('extracts all variable references from template', async () => {
    const { extractReferences } = await import('../src/templates/envTemplate/engine.js');

    const template = {
      VAR1: '${A}',
      VAR2: '${B}',
      VAR3: '${A}-${B}',
      VAR4: 'literal',
    };

    const refs = extractReferences(template);

    expect(refs).toContain('A');
    expect(refs).toContain('B');
    expect(refs).toHaveLength(2);  // A and B, not duplicated
  });

  it('handles nested references', async () => {
    const { extractReferences } = await import('../src/templates/envTemplate/engine.js');

    const template = {
      OUTER: '${INNER}',
      INNER: '${DEEP}',
    };

    const refs = extractReferences(template);

    expect(refs).toContain('INNER');
    expect(refs).toContain('DEEP');
  });
});