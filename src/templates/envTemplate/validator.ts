import type { EnvTemplateConfig } from './types.js';

/**
 * Validates an environment template configuration
 */
export function validateTemplateConfig(config: unknown): asserts config is EnvTemplateConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Config must be an object');
  }

  const c = config as Record<string, unknown>;

  if (!c.variables || typeof c.variables !== 'object') {
    throw new Error('Config must have a variables object');
  }

  if (!c.template || typeof c.template !== 'object') {
    throw new Error('Config must have a template object');
  }
}