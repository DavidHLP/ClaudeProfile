/**
 * Environment template type definitions
 */

export interface EnvTemplateConfig {
  extends?: EnvTemplateConfig;
  variables: Record<string, string>;
  template: Record<string, string>;
}

export interface ParsedTemplate {
  variables: Record<string, string>;
  template: Record<string, string>;
  variableRefs: Map<string, Set<string>>;  // var -> vars it references
}

export class TemplateParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateParseError';
  }
}

export class CircularReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircularReferenceError';
  }
}

export class UndefinedVariableError extends Error {
  constructor(variable: string) {
    super(`Undefined variable: ${variable}`);
    this.name = 'UndefinedVariableError';
  }
}