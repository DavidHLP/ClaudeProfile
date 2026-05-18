import type { PluginManifest, Plugin, PluginHooks } from './types.js';
import { validateManifest } from './validator.js';

/**
 * Loads and validates plugins from manifests
 */
export class PluginLoader {
  async loadFromManifest(manifest: PluginManifest): Promise<Plugin> {
    validateManifest(manifest);

    const plugin: Plugin = {
      manifest,
      isActive: false,
      hooks: this.extractHooks(manifest),
    };

    return plugin;
  }

  private extractHooks(manifest: PluginManifest): PluginHooks {
    return {
      onActivate: manifest.hooks.onActivate,
      onDeactivate: manifest.hooks.onDeactivate,
      onProfileSwitch: manifest.hooks.onProfileSwitch,
      onProfileCreate: manifest.hooks.onProfileCreate,
      onProfileDelete: manifest.hooks.onProfileDelete,
    };
  }
}