import { ProviderTemplate } from '../types/index.js';
import { providerTemplates } from './providers.js';

export interface RegistryOptions {
  allowOverride?: boolean;
}

export interface UnregisterOptions {
  force?: boolean;
}

export class ProviderRegistry {
  private providers: Map<string, ProviderTemplate>;
  private builtInIds: Set<string>;

  constructor() {
    this.providers = new Map();
    this.builtInIds = new Set();

    // Register built-in providers
    for (const provider of providerTemplates) {
      this.providers.set(provider.id, provider);
      this.builtInIds.add(provider.id);
    }
  }

  registerProvider(template: ProviderTemplate, options?: RegistryOptions): void {
    const existing = this.providers.get(template.id);

    if (existing) {
      if (this.builtInIds.has(template.id)) {
        if (!options?.allowOverride) {
          throw new Error(`Provider with ID "${template.id}" is already registered`);
        }
      } else {
        throw new Error(`Provider with ID "${template.id}" is already registered`);
      }
    }

    this.providers.set(template.id, template);
  }

  unregisterProvider(id: string, options?: UnregisterOptions): boolean {
    if (!this.providers.has(id)) {
      return false;
    }

    if (this.builtInIds.has(id) && !options?.force) {
      return false;
    }

    return this.providers.delete(id);
  }

  getProvider(id: string): ProviderTemplate | undefined {
    return this.providers.get(id);
  }

  listProviders(): ProviderTemplate[] {
    return Array.from(this.providers.values());
  }

  loadCustomProviders(configs: ProviderTemplate[]): void {
    for (const config of configs) {
      if (!config || !config.id) {
        continue;
      }

      try {
        this.registerProvider(config, { allowOverride: true });
      } catch {
        // Skip invalid configs silently
      }
    }
  }
}

// Singleton instance with built-in providers pre-registered
export const providerRegistry = new ProviderRegistry();