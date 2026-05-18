/**
 * Plugin system type definitions
 */

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  entry: string;
  hooks: PluginHooks;
  dependencies?: Record<string, string>;
  author?: string;
}

export interface PluginHooks {
  onActivate?: () => Promise<void> | void;
  onDeactivate?: () => Promise<void> | void;
  onProfileSwitch?: (context: ProfileSwitchContext) => Promise<void> | void;
  onProfileCreate?: (context: ProfileContext) => Promise<void> | void;
  onProfileDelete?: (context: ProfileContext) => Promise<void> | void;
}

export interface ProfileSwitchContext {
  profile: string;
  previousProfile: string | null;
}

export interface ProfileContext {
  profile: string;
}

export interface Plugin {
  manifest: PluginManifest;
  isActive: boolean;
  hooks: PluginHooks;
}

export type HookName = keyof PluginHooks;