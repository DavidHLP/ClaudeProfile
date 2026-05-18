import type { EnvTemplateConfig, ParsedTemplate } from './types.js';
import { TemplateParseError, CircularReferenceError, UndefinedVariableError } from './types.js';

// Variable reference regex: ${VAR_NAME} or ${VAR_NAME:-default}
const VARIABLE_REF_REGEX = /\$\{([^}:]+)(?::-([^}]*))?\}/g;
// Detect invalid syntax like ${} or ${:}
const INVALID_VAR_SYNTAX_REGEX = /\$\{[}:]*\}/;

/**
 * Extracts all variable references from a template
 */
export function extractReferences(
  template: Record<string, string>
): Set<string> {
  const refs = new Set<string>();

  for (const value of Object.values(template)) {
    let match;
    while ((match = VARIABLE_REF_REGEX.exec(value)) !== null) {
      refs.add(match[1]);
    }
    VARIABLE_REF_REGEX.lastIndex = 0;  // Reset regex state
  }

  return refs;
}

/**
 * Environment Template Engine - handles variable interpolation and inheritance
 */
export class EnvTemplateEngine {
  /**
   * Parses a template configuration and builds the dependency graph
   */
  parse(config: EnvTemplateConfig): ParsedTemplate {
    const mergedConfig = this.mergeTemplates(
      config.extends ? { variables: {}, template: {} } : config,
      config
    );

    // Validate all values for invalid syntax
    this.validateSyntax(mergedConfig.variables, 'variable');
    this.validateSyntax(mergedConfig.template, 'template');

    // Build variable reference map
    const variableRefs = new Map<string, Set<string>>();

    // Get all variables (from both variables and template values)
    const allVars = { ...mergedConfig.variables };

    // Extract references from variables
    for (const [key, value] of Object.entries(mergedConfig.variables)) {
      const refs = new Set<string>();
      let match;
      VARIABLE_REF_REGEX.lastIndex = 0;
      while ((match = VARIABLE_REF_REGEX.exec(value)) !== null) {
        refs.add(match[1]);
      }
      if (refs.size > 0) {
        variableRefs.set(key, refs);
      }
    }

    // Check for circular references
    this.detectCircularReferences(variableRefs, mergedConfig.variables);

    return {
      variables: mergedConfig.variables,
      template: mergedConfig.template,
      variableRefs,
    };
  }

  /**
   * Validates that values don't contain invalid variable syntax
   */
  private validateSyntax(
    values: Record<string, string>,
    _context: string
  ): void {
    for (const [key, value] of Object.entries(values)) {
      // Check for invalid syntax like ${} or ${:}
      if (INVALID_VAR_SYNTAX_REGEX.test(value)) {
        throw new TemplateParseError(
          `Invalid variable syntax in "${key}": ${value}`
        );
      }
      // Check for unclosed variable reference
      const openCount = (value.match(/\$\{/g) || []).length;
      const closeCount = (value.match(/\}/g) || []).length;
      if (openCount !== closeCount) {
        throw new TemplateParseError(
          `Unclosed variable reference in "${key}": ${value}`
        );
      }
    }
  }

  /**
   * Detects circular references in variable definitions
   */
  private detectCircularReferences(
    variableRefs: Map<string, Set<string>>,
    variables: Record<string, string>
  ): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (varName: string): void => {
      visited.add(varName);
      recursionStack.add(varName);

      const refs = variableRefs.get(varName);
      if (refs) {
        for (const ref of refs) {
          if (!visited.has(ref)) {
            dfs(ref);
          } else if (recursionStack.has(ref)) {
            throw new CircularReferenceError(
              `Circular reference detected: ${varName} -> ${ref}`
            );
          }
        }
      }

      recursionStack.delete(varName);
    };

    for (const varName of variableRefs.keys()) {
      if (!visited.has(varName)) {
        dfs(varName);
      }
    }
  }

  /**
   * Interpolates variables in a parsed template
   */
  interpolate(parsed: ParsedTemplate): Record<string, string> {
    const result: Record<string, string> = {};
    const resolved: Record<string, string> = {};

    // First, resolve all variables
    for (const [key, value] of Object.entries(parsed.variables)) {
      resolved[key] = this.interpolateValue(value, parsed.variables, resolved);
    }

    // Then, resolve template values
    for (const [key, value] of Object.entries(parsed.template)) {
      result[key] = this.interpolateValue(value, resolved, resolved);
    }

    return result;
  }

  /**
   * Interpolates a single value with variable references
   */
  private interpolateValue(
    value: string,
    variables: Record<string, string>,
    resolved: Record<string, string>
  ): string {
    return value.replace(VARIABLE_REF_REGEX, (match, varName, defaultValue) => {
      if (varName in resolved) {
        return resolved[varName];
      }
      if (varName in variables) {
        const varValue = this.interpolateValue(variables[varName], variables, resolved);
        resolved[varName] = varValue;
        return varValue;
      }
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new UndefinedVariableError(varName);
    });
  }

  /**
   * Merges child config with parent (extends) config
   */
  mergeTemplates(
    base: EnvTemplateConfig,
    child: EnvTemplateConfig
  ): EnvTemplateConfig {
    // Variables: child overrides parent
    const mergedVariables = { ...base.variables, ...child.variables };

    // Template: child overrides parent, but we need to include parent's template keys
    const mergedTemplate = { ...base.template, ...child.template };

    return {
      variables: mergedVariables,
      template: mergedTemplate,
    };
  }

  /**
   * Fully resolves a template config with inheritance and interpolation
   */
  resolve(config: EnvTemplateConfig): Record<string, string> {
    // Handle extends chain recursively
    let currentConfig = config;
    const chain: EnvTemplateConfig[] = [];

    while (currentConfig.extends) {
      chain.unshift(currentConfig.extends);
      currentConfig = currentConfig.extends;
    }

    // Merge all configs in chain
    let merged: EnvTemplateConfig = { variables: {}, template: {} };
    for (const parentConfig of chain) {
      merged = this.mergeTemplates(merged, parentConfig);
    }
    merged = this.mergeTemplates(merged, config);

    const parsed = this.parse(merged);
    return this.interpolate(parsed);
  }
}

export { TemplateParseError, CircularReferenceError } from './types.js';