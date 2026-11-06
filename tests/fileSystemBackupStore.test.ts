import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { Header, Pax } from 'tar';
import { FileSystemBackupStore } from '../src/services/fileSystemBackupStore.js';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function header(data: ConstructorParameters<typeof Header>[0]): Buffer {
  const entry = new Header(data);
  entry.encode();
  return entry.block!;
}

function longPathArchive(format: 'GNU' | 'PAX'): Buffer {
  const path = `${'a/'.repeat(12_000)}profile.json`;
  let metadata: Buffer;
  if (format === 'PAX') {
    metadata = new Pax({ path }).encode();
  } else {
    const body = Buffer.from(`${path}\0`);
    metadata = Buffer.concat([
      header({ path: '././@LongLink', type: 'NextFileHasLongPath', size: body.length }),
      body,
      Buffer.alloc((512 - (body.length % 512)) % 512),
    ]);
  }
  return gzipSync(Buffer.concat([
    metadata,
    header({ path: 'profile.json', type: 'File', size: 0, mode: 0o600 }),
    Buffer.alloc(1024),
  ]));
}

describe('FileSystemBackupStore (real archives)', () => {
  let root: string;
  let target: string;
  let store: FileSystemBackupStore;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'claude-profile-backup-test-'));
    target = join(root, 'target');
    mkdirSync(target);
    vi.stubEnv('HOME', root);
    store = new FileSystemBackupStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('round-trips a profile and a nested file through the production adapter', async () => {
    const source = join(root, 'source');
    mkdirSync(join(source, 'nested'), { recursive: true });
    const profile = JSON.stringify({ name: 'test-profile', env: { TEST_VALUE: 'example' } });
    writeFileSync(join(source, 'profile.json'), profile);
    writeFileSync(join(source, 'nested', 'notes.txt'), 'backup control');

    const archive = await store.create(source);
    expect(store.list().map((entry) => entry.path)).toContain(archive);
    await store.extract(archive, target);

    expect(readFileSync(join(target, 'profile.json'), 'utf8')).toBe(profile);
    expect(readFileSync(join(target, 'nested', 'notes.txt'), 'utf8')).toBe('backup control');
  });

  it.each(['GNU', 'PAX'] as const)('handles a deep %s path without member selection', async (format) => {
    const archive = join(root, `${format}.tar.gz`);
    writeFileSync(archive, longPathArchive(format));

    // The application does not select archive members. The upstream maxDepth
    // guard skips this entry without writing files or overflowing the stack.
    await expect(store.extract(archive, target)).resolves.toBeUndefined();
    expect(readdirSync(target)).toEqual([]);
  });

  it.each(['GNU', 'PAX'] as const)('guards the tar dependency against %s member-selection recursion', (format) => {
    const archive = join(root, `${format}.tar.gz`);
    writeFileSync(archive, longPathArchive(format));

    // GHSA-r292-9mhp-454m requires member selection, which the application does
    // not use. Exercise the upstream boundary in a bounded child process so
    // a vulnerable dependency fails this test instead of crashing Vitest.
    const child = spawnSync(process.execPath, [
      '--input-type=module',
      '-e',
      "import { list } from 'tar'; await list({ file: process.argv[1] }, ['not-selected']);",
      archive,
    ], { cwd: projectRoot, encoding: 'utf8', timeout: 10_000 });

    expect(child.error).toBeUndefined();
    expect(child.signal).toBeNull();
    expect(child.status, child.stderr).toBe(0);
  }, 15_000);
});
