import type { PluginManifest } from './types.js';

/**
 * Validates a plugin manifest
 */
export function validateManifest(manifest: unknown): asserts manifest is PluginManifest {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Manifest must be an object');
  }

  const m = manifest as Record<string, unknown>;

  if (typeof m.id !== 'string' || !m.id.trim()) {
    throw new Error('Manifest must have a non-empty id string');
  }

  if (typeof m.name !== 'string' || !m.name.trim()) {
    throw new Error('Manifest must have a non-empty name string');
  }

  if (typeof m.version !== 'string' || !isValidVersion(m.version)) {
    throw new Error('Invalid version format. Must be a valid semver string.');
  }

  if (typeof m.entry !== 'string' || !m.entry.trim()) {
    throw new Error('Manifest must have a non-empty entry string');
  }

  if (!m.hooks || typeof m.hooks !== 'object') {
    throw new Error('Manifest must have a hooks object');
  }
}

function isValidVersion(version: string): boolean {
  // Simple semver validation
  const semverRegex = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/;
  return semverRegex.test(version);
}