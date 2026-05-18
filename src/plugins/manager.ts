import type { PluginManifest, Plugin, HookName, ProfileSwitchContext } from './types.js';
import { PluginLoader } from './loader.js';

/**
 * Manages plugin lifecycle and registration
 */
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private loader: PluginLoader;

  constructor() {
    this.loader = new PluginLoader();
  }

  async registerPlugin(manifest: PluginManifest): Promise<void> {
    const existing = this.plugins.get(manifest.id);
    if (existing) {
      throw new Error(`Plugin with ID "${manifest.id}" is already registered`);
    }

    const plugin = await this.loader.loadFromManifest(manifest);
    this.plugins.set(plugin.manifest.id, plugin);
  }

  async unregisterPlugin(id: string): Promise<boolean> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      return false;
    }

    if (plugin.isActive) {
      await this.deactivatePlugin(id);
    }

    return this.plugins.delete(id);
  }

  async activatePlugin(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new Error(`Plugin "${id}" not found`);
    }

    if (plugin.isActive) {
      throw new Error(`Plugin "${id}" is already active`);
    }

    if (plugin.hooks.onActivate) {
      await plugin.hooks.onActivate();
    }

    plugin.isActive = true;
  }

  async deactivatePlugin(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new Error(`Plugin "${id}" not found`);
    }

    if (!plugin.isActive) {
      return;
    }

    if (plugin.hooks.onDeactivate) {
      await plugin.hooks.onDeactivate();
    }

    plugin.isActive = false;
  }

  getPlugin(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  listPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  listActivePlugins(): Plugin[] {
    return Array.from(this.plugins.values()).filter((p) => p.isActive);
  }

  async callHook(hookName: HookName, context?: unknown): Promise<void> {
    const activePlugins = this.listActivePlugins();

    for (const plugin of activePlugins) {
      const hook = plugin.hooks[hookName];
      if (hook) {
        try {
          await hook(context as never);
        } catch (error) {
          // Log error but continue with other hooks
          console.error(`Error in plugin "${plugin.manifest.id}" hook "${hookName}":`, error);
        }
      }
    }
  }
}