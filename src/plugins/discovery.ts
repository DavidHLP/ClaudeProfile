import type { PluginManifest } from './types.js';
import { validateManifest } from './validator.js';
import { readdir } from 'fs/promises';
import { join } from 'path';

export interface DiscoveryOptions {
  pluginDir: string;
}

/**
 * Discovers plugins from a directory
 */
export async function discoverPlugins(
  pluginDir: string,
  readDirFn: (path: string) => Promise<string[]> = readdir
): Promise<PluginManifest[]> {
  try {
    const entries = await readDirFn(pluginDir);
    const manifests: PluginManifest[] = [];

    for (const entry of entries) {
      const manifestPath = join(pluginDir, entry, 'manifest.json');

      try {
        const { readFile } = await import('fs/promises');
        const content = await readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(content) as unknown;

        try {
          validateManifest(manifest);
          manifests.push(manifest as PluginManifest);
        } catch {
          // Skip invalid manifests
        }
      } catch {
        // Skip if manifest.json doesn't exist or can't be read
      }
    }

    return manifests;
  } catch {
    return [];
  }
}