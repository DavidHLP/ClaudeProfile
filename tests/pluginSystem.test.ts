import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PluginManifest, Plugin, PluginHook } from '../src/plugins/types.js';

// Mock types for testing the plugin system interfaces

describe('PluginManifest', () => {
  it('validates required fields', async () => {
    const { PluginManifest: PluginManifestType } = await import('../src/plugins/types.js');

    const validManifest: PluginManifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'A test plugin',
      entry: './dist/index.js',
      hooks: {},
    };

    expect(validManifest.id).toBe('test-plugin');
    expect(validManifest.version).toBe('1.0.0');
  });

  it('rejects manifest with missing required fields', async () => {
    const invalidManifest = {
      name: 'Test Plugin',
      // missing id, version, entry
    } as PluginManifest;

    const { validateManifest } = await import('../src/plugins/validator.js');

    expect(() => validateManifest(invalidManifest)).toThrow();
  });

  it('validates semver version format', async () => {
    const { validateManifest } = await import('../src/plugins/validator.js');

    const manifestWithInvalidVersion: PluginManifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: 'invalid-version',
      description: 'Test',
      entry: './dist/index.js',
      hooks: {},
    };

    expect(() => validateManifest(manifestWithInvalidVersion)).toThrow('Invalid version format');
  });
});

describe('PluginLoader', () => {
  it('loads a valid plugin from manifest', async () => {
    const { PluginLoader } = await import('../src/plugins/loader.js');
    const loader = new PluginLoader();

    const manifest: PluginManifest = {
      id: 'my-plugin',
      name: 'My Plugin',
      version: '1.0.0',
      description: 'Test plugin',
      entry: './plugin.js',
      hooks: {
        onProfileSwitch: async () => console.log('switched'),
      },
    };

    // Plugin loader should validate and prepare the plugin
    const plugin = await loader.loadFromManifest(manifest);
    expect(plugin.manifest.id).toBe('my-plugin');
    expect(plugin.isActive).toBe(false);
  });

  it('rejects plugin with conflicting ID', async () => {
    const { PluginLoader } = await import('../src/plugins/loader.js');
    const { PluginManager } = await import('../src/plugins/manager.js');

    const loader = new PluginLoader();
    const manager = new PluginManager();

    const manifest1: PluginManifest = {
      id: 'conflict-plugin',
      name: 'Plugin 1',
      version: '1.0.0',
      description: 'First',
      entry: './plugin1.js',
      hooks: {},
    };

    const manifest2: PluginManifest = {
      id: 'conflict-plugin',
      name: 'Plugin 2',
      version: '1.0.0',
      description: 'Second',
      entry: './plugin2.js',
      hooks: {},
    };

    await loader.loadFromManifest(manifest1);
    await manager.registerPlugin(manifest1);

    // Second plugin with same ID should be rejected
    await expect(async () => {
      await manager.registerPlugin(manifest2);
    }).rejects.toThrow('Plugin with ID "conflict-plugin" is already registered');
  });
});

describe('PluginManager', () => {
  let manager: InstanceType<typeof import('../src/plugins/manager.js').PluginManager>;

  beforeEach(async () => {
    const { PluginManager } = await import('../src/plugins/manager.js');
    manager = new PluginManager();
  });

  it('registers a plugin', async () => {
    const { PluginLoader } = await import('../src/plugins/loader.js');
    const loader = new PluginLoader();

    const manifest: PluginManifest = {
      id: 'register-test',
      name: 'Register Test',
      version: '1.0.0',
      description: 'Test registration',
      entry: './index.js',
      hooks: {},
    };

    await manager.registerPlugin(manifest);
    expect(manager.getPlugin('register-test')).toBeDefined();
    expect(manager.listPlugins()).toHaveLength(1);
  });

  it('unregisters a plugin', async () => {
    const manifest: PluginManifest = {
      id: 'unregister-test',
      name: 'Unregister Test',
      version: '1.0.0',
      description: 'Test unregistration',
      entry: './index.js',
      hooks: {},
    };

    await manager.registerPlugin(manifest);
    expect(manager.getPlugin('unregister-test')).toBeDefined();

    const removed = await manager.unregisterPlugin('unregister-test');
    expect(removed).toBe(true);
    expect(manager.getPlugin('unregister-test')).toBeUndefined();
  });

  it('activates a plugin', async () => {
    const activateHook = vi.fn();
    const manifest: PluginManifest = {
      id: 'activate-test',
      name: 'Activate Test',
      version: '1.0.0',
      description: 'Test activation',
      entry: './index.js',
      hooks: {
        onActivate: activateHook,
      },
    };

    await manager.registerPlugin(manifest);
    await manager.activatePlugin('activate-test');

    const plugin = manager.getPlugin('activate-test');
    expect(plugin?.isActive).toBe(true);
    expect(activateHook).toHaveBeenCalled();
  });

  it('deactivates a plugin', async () => {
    const deactivateHook = vi.fn();
    const manifest: PluginManifest = {
      id: 'deactivate-test',
      name: 'Deactivate Test',
      version: '1.0.0',
      description: 'Test deactivation',
      entry: './index.js',
      hooks: {
        onDeactivate: deactivateHook,
      },
    };

    await manager.registerPlugin(manifest);
    await manager.activatePlugin('deactivate-test');
    await manager.deactivatePlugin('deactivate-test');

    const plugin = manager.getPlugin('deactivate-test');
    expect(plugin?.isActive).toBe(false);
    expect(deactivateHook).toHaveBeenCalled();
  });

  it('cannot activate non-existent plugin', async () => {
    await expect(async () => {
      await manager.activatePlugin('non-existent');
    }).rejects.toThrow('Plugin "non-existent" not found');
  });

  it('cannot activate already active plugin', async () => {
    const manifest: PluginManifest = {
      id: 'double-activate',
      name: 'Double Activate Test',
      version: '1.0.0',
      description: 'Test',
      entry: './index.js',
      hooks: {},
    };

    await manager.registerPlugin(manifest);
    await manager.activatePlugin('double-activate');

    await expect(async () => {
      await manager.activatePlugin('double-activate');
    }).rejects.toThrow('Plugin "double-activate" is already active');
  });

  it('lists all registered plugins', async () => {
    const manifests: PluginManifest[] = [
      {
        id: 'plugin-1',
        name: 'Plugin 1',
        version: '1.0.0',
        description: 'First',
        entry: './index.js',
        hooks: {},
      },
      {
        id: 'plugin-2',
        name: 'Plugin 2',
        version: '1.0.0',
        description: 'Second',
        entry: './index.js',
        hooks: {},
      },
    ];

    for (const manifest of manifests) {
      await manager.registerPlugin(manifest);
    }

    const plugins = manager.listPlugins();
    expect(plugins).toHaveLength(2);
  });

  it('lists only active plugins', async () => {
    const manifests: PluginManifest[] = [
      {
        id: 'active-plugin',
        name: 'Active Plugin',
        version: '1.0.0',
        description: 'Active',
        entry: './index.js',
        hooks: {},
      },
      {
        id: 'inactive-plugin',
        name: 'Inactive Plugin',
        version: '1.0.0',
        description: 'Inactive',
        entry: './index.js',
        hooks: {},
      },
    ];

    await manager.registerPlugin(manifests[0]);
    await manager.registerPlugin(manifests[1]);
    await manager.activatePlugin('active-plugin');

    const activePlugins = manager.listActivePlugins();
    expect(activePlugins).toHaveLength(1);
    expect(activePlugins[0].manifest.id).toBe('active-plugin');
  });
});

describe('PluginHooks', () => {
  it('calls onProfileSwitch hook when profile changes', async () => {
    const { PluginManager } = await import('../src/plugins/manager.js');
    const manager = new PluginManager();

    const switchHook = vi.fn();
    const manifest: PluginManifest = {
      id: 'switch-hook-test',
      name: 'Switch Hook Test',
      version: '1.0.0',
      description: 'Test hook',
      entry: './index.js',
      hooks: {
        onProfileSwitch: switchHook,
      },
    };

    await manager.registerPlugin(manifest);
    await manager.activatePlugin('switch-hook-test');

    // Simulate profile switch
    await manager.callHook('onProfileSwitch', { profile: 'test-profile', previousProfile: null });

    expect(switchHook).toHaveBeenCalledWith({ profile: 'test-profile', previousProfile: null });
  });

  it('calls multiple hooks in order', async () => {
    const { PluginManager } = await import('../src/plugins/manager.js');
    const manager = new PluginManager();

    const callOrder: string[] = [];

    const manifest1: PluginManifest = {
      id: 'hook-plugin-1',
      name: 'Hook Plugin 1',
      version: '1.0.0',
      description: 'First',
      entry: './index.js',
      hooks: {
        onProfileSwitch: async () => { callOrder.push('plugin1'); },
      },
    };

    const manifest2: PluginManifest = {
      id: 'hook-plugin-2',
      name: 'Hook Plugin 2',
      version: '1.0.0',
      description: 'Second',
      entry: './index.js',
      hooks: {
        onProfileSwitch: async () => { callOrder.push('plugin2'); },
      },
    };

    await manager.registerPlugin(manifest1);
    await manager.registerPlugin(manifest2);
    await manager.activatePlugin('hook-plugin-1');
    await manager.activatePlugin('hook-plugin-2');

    await manager.callHook('onProfileSwitch', { profile: 'test', previousProfile: null });

    // Plugins should be called in registration order
    expect(callOrder).toEqual(['plugin1', 'plugin2']);
  });

  it('handles hook errors gracefully', async () => {
    const { PluginManager } = await import('../src/plugins/manager.js');
    const capturedErrors: Array<{ pluginId: string; hookName: string; error: unknown }> = [];
    const manager = new PluginManager((pluginId, hookName, error) => {
      capturedErrors.push({ pluginId, hookName, error });
    });

    const errorHook = vi.fn(() => {
      throw new Error('Hook error');
    });

    const normalHook = vi.fn();

    const manifests: PluginManifest[] = [
      {
        id: 'error-hook-plugin',
        name: 'Error Hook Plugin',
        version: '1.0.0',
        description: 'Errors',
        entry: './index.js',
        hooks: {
          onProfileSwitch: errorHook,
        },
      },
      {
        id: 'normal-hook-plugin',
        name: 'Normal Hook Plugin',
        version: '1.0.0',
        description: 'Normal',
        entry: './index.js',
        hooks: {
          onProfileSwitch: normalHook,
        },
      },
    ];

    await manager.registerPlugin(manifests[0]);
    await manager.registerPlugin(manifests[1]);
    await manager.activatePlugin('error-hook-plugin');
    await manager.activatePlugin('normal-hook-plugin');

    // Should not throw, but should log error and continue
    await manager.callHook('onProfileSwitch', { profile: 'test', previousProfile: null });

    // Error should have been captured via onError callback
    expect(capturedErrors).toHaveLength(1);
    expect(capturedErrors[0].pluginId).toBe('error-hook-plugin');
    expect(capturedErrors[0].hookName).toBe('onProfileSwitch');

    // Normal hook should still be called even if error hook failed
    expect(normalHook).toHaveBeenCalled();
  });
});

describe('PluginDiscovery', () => {
  it('discovers plugins from directory', async () => {
    const { discoverPlugins } = await import('../src/plugins/discovery.js');

    // Mock fs operations
    const mockReadDir = vi.fn().mockResolvedValue(['plugin-a', 'plugin-b']);

    // Should discover plugins from standard directory
    const plugins = await discoverPlugins('/some/plugin/path', mockReadDir);
    expect(Array.isArray(plugins)).toBe(true);
  });
});