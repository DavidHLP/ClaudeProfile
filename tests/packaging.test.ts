import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

interface PackageJson {
  files?: string[];
  scripts?: Record<string, string>;
}

const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8')
) as PackageJson;

describe('package configuration', () => {
  it('builds compiled CLI targets during install and publish preparation', () => {
    expect(packageJson.scripts?.prepare).toBe('npm run build');
    expect(packageJson.scripts?.prepublishOnly).toBe('npm run build');
  });

  it('includes compiled output in published packages', () => {
    expect(packageJson.files).toEqual(expect.arrayContaining(['bin/', 'dist/']));
  });
});
