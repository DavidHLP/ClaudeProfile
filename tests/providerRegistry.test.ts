import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ProviderTemplate } from '../src/types/index.js';

// We will import the actual registry once implemented
// For now, we test the interface contract

describe('ProviderRegistry', () => {
  describe('registerProvider()', () => {
    it('registers a new provider template', async () => {
      const { ProviderRegistry } = await import('../src/templates/providerRegistry.js');
      const registry = new ProviderRegistry();

      const customProvider: ProviderTemplate = {
        id: 'custom-provider',
        name: 'Custom Provider',
        description: 'A custom provider for testing',
        defaultBaseUrl: 'https://custom.api.example.com',
        defaultModel: 'custom-model-v1',
        envTemplate: {
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'custom-model-v1',
        },
      };

      registry.registerProvider(customProvider);
      expect(registry.getProvider('custom-provider')).toEqual(customProvider);
    });

    it('throws error when registering provider with duplicate ID', async () => {
      const { ProviderRegistry } = await import('../src/templates/providerRegistry.js');
      const registry = new ProviderRegistry();

      const provider: ProviderTemplate = {
        id: 'duplicate-id',
        name: 'First Provider',
        description: 'Test',
        defaultBaseUrl: 'https://api.example.com',
        defaultModel: 'model-1',
        envTemplate: {},
      };

      registry.registerProvider(provider);

      await expect(async () => {
        registry.registerProvider({ ...provider, name: 'Second Provider' });
      }).rejects.toThrow('Provider with ID "duplicate-id" is already registered');
    });

    it('overrides existing built-in provider when override flag is true', async () => {
      const { ProviderRegistry } = await import('../src/templates/providerRegistry.js');
      const registry = new ProviderRegistry();

      const overrideProvider: ProviderTemplate = {
        id: 'minimax',
        name: 'Overridden MiniMax',
        description: 'This overrides the built-in minimax',
        defaultBaseUrl: 'https://overridden.minimaxi.com/anthropic',
        defaultModel: 'overridden-model',
        envTemplate: {
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'overridden-model',
        },
      };

      registry.registerProvider(overrideProvider, { allowOverride: true });

      const result = registry.getProvider('minimax');
      expect(result?.name).toBe('Overridden MiniMax');
      expect(result?.defaultBaseUrl).toBe('https://overridden.minimaxi.com/anthropic');
    });
  });

  describe('unregisterProvider()', () => {
    it('unregisters an existing provider', async () => {
      const { ProviderRegistry } = await import('../src/templates/providerRegistry.js');
      const registry = new ProviderRegistry();

      const provider: ProviderTemplate = {
        id: 'to-remove',
        name: 'Provider To Remove',
        description: 'Test',
        defaultBaseUrl: 'https://api.example.com',
        defaultModel: 'model-1',
        envTemplate: {},
      };

      registry.registerProvider(provider);
      expect(registry.getProvider('to-remove')).toEqual(provider);

      const removed = registry.unregisterProvider('to-remove');
      expect(removed).toBe(true);
      expect(registry.getProvider('to-remove')).toBeUndefined();
    });

    it('returns false when unregistering non-existent provider', async () => {
      const { ProviderRegistry } = await import('../src/templates/providerRegistry.js');
      const registry = new ProviderRegistry();

      const result = registry.unregisterProvider('non-existent');
      expect(result).toBe(false);
    });

    it('cannot unregister built-in providers by default', async () => {
      const { ProviderRegistry } = await import('../src/templates/providerRegistry.js');
      const registry = new ProviderRegistry();

      const result = registry.unregisterProvider('minimax');
      expect(result).toBe(false);
      expect(registry.getProvider('minimax')).toBeDefined();
    });

    it('can force unregister built-in providers', async () => {
      const { ProviderRegistry } = await import('../src/templates/providerRegistry.js');
      const registry = new ProviderRegistry();

      const result = registry.unregisterProvider('minimax', { force: true });
      expect(result).toBe(true);
      expect(registry.getProvider('minimax')).toBeUndefined();
    });
  });

  describe('listProviders()', () => {
    it('lists all registered providers including built-ins', async () => {
      const { ProviderRegistry } = await import('../src/templates/providerRegistry.js');
      const registry = new ProviderRegistry();

      const providers = registry.listProviders();
      expect(providers.length).toBeGreaterThanOrEqual(5);

      const ids = providers.map((p) => p.id);
      expect(ids).toContain('minimax');
      expect(ids).toContain('kimi');
      expect(ids).toContain('aliyun');
      expect(ids).toContain('volcano');
      expect(ids).toContain('custom');
    });
  });

  describe('getProvider()', () => {
    it('retrieves a provider by ID', async () => {
      const { ProviderRegistry } = await import('../src/templates/providerRegistry.js');
      const registry = new ProviderRegistry();

      const provider = registry.getProvider('minimax');
      expect(provider).toBeDefined();
      expect(provider?.id).toBe('minimax');
      expect(provider?.name).toBe('MiniMax');
    });

    it('returns undefined for non-existent provider', async () => {
      const { ProviderRegistry } = await import('../src/templates/providerRegistry.js');
      const registry = new ProviderRegistry();

      const provider = registry.getProvider('non-existent');
      expect(provider).toBeUndefined();
    });
  });

  describe('loadCustomProviders()', () => {
    it('loads providers from a configuration object', async () => {
      const { ProviderRegistry } = await import('../src/templates/providerRegistry.js');
      const registry = new ProviderRegistry();

      const customConfigs: ProviderTemplate[] = [
        {
          id: 'loaded-provider-1',
          name: 'Loaded Provider 1',
          description: 'Loaded from config',
          defaultBaseUrl: 'https://loaded1.api.com',
          defaultModel: 'loaded-model-1',
          envTemplate: {},
        },
        {
          id: 'loaded-provider-2',
          name: 'Loaded Provider 2',
          description: 'Loaded from config',
          defaultBaseUrl: 'https://loaded2.api.com',
          defaultModel: 'loaded-model-2',
          envTemplate: {},
        },
      ];

      registry.loadCustomProviders(customConfigs);

      expect(registry.getProvider('loaded-provider-1')).toBeDefined();
      expect(registry.getProvider('loaded-provider-2')).toBeDefined();
    });
  });
});

describe('Singleton providerRegistry', () => {
  it('should have built-in providers pre-registered', async () => {
    const { providerRegistry } = await import('../src/templates/providerRegistry.js');

    expect(providerRegistry.getProvider('minimax')).toBeDefined();
    expect(providerRegistry.getProvider('kimi')).toBeDefined();
    expect(providerRegistry.getProvider('aliyun')).toBeDefined();
    expect(providerRegistry.getProvider('volcano')).toBeDefined();
    expect(providerRegistry.getProvider('custom')).toBeDefined();
  });

  it('should not allow unregistering built-in providers without force', async () => {
    const { providerRegistry } = await import('../src/templates/providerRegistry.js');

    expect(providerRegistry.unregisterProvider('minimax')).toBe(false);
  });

  it('should allow registering new custom providers', async () => {
    const { providerRegistry } = await import('../src/templates/providerRegistry.js');

    const customProvider: ProviderTemplate = {
      id: 'test-custom',
      name: 'Test Custom Provider',
      description: 'For testing',
      defaultBaseUrl: 'https://test.api.com',
      defaultModel: 'test-model',
      envTemplate: {},
    };

    providerRegistry.registerProvider(customProvider);
    expect(providerRegistry.getProvider('test-custom')).toEqual(customProvider);

    // Clean up
    providerRegistry.unregisterProvider('test-custom', { force: true });
  });
});