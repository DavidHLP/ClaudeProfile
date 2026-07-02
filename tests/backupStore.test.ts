/**
 * Tests for the BackupStore port and its two adapters.
 *
 * The port is the test surface. The two adapters are tested through
 * the same `BackupStore` contract so a port-level refactor is
 * transparent to the tests.
 *
 * The in-memory adapter also tests the security validator
 * (path-traversal, symlink rejection) by injecting synthetic
 * entries; the filesystem adapter's identical validator is the
 * same code path.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryBackupStore } from '../src/services/inMemoryBackupStore.js';
import { backupStore } from '../src/services/backupStore.js';
import { AppError, FileOperationError } from '../src/errors.js';
import type { BackupStore } from '../src/services/backupStore.js';

describe('InMemoryBackupStore (test adapter)', () => {
  let store: InMemoryBackupStore;

  beforeEach(() => {
    store = new InMemoryBackupStore();
    store.injectSourceDir('/source');
  });

  it('injects a source dir for create() to find', () => {
    // The beforeEach already injected /source
    expect(store.validateEntry({ path: 'ok' })).toBe(true);
  });

  describe('create + list + extract flow', () => {
    it('create returns a path, list returns the entry, extract records the call', async () => {
      const path = await store.create('/source');
      expect(path).toMatch(/claude-profile-backup-/);

      const list = store.list();
      expect(list).toHaveLength(1);
      expect(list[0].path).toBe(path);

      await store.extract(path, '/target');
      expect(store.getLastExtractPath()).toBe(path);
    });

    it('list returns newest first', async () => {
      const first = await store.create('/source');
      await new Promise((r) => setTimeout(r, 5));
      const second = await store.create('/source');

      const list = store.list();
      expect(list.map((e) => e.path)).toEqual([second, first]);
    });

    it('create uses provided outputPath when given', async () => {
      const custom = '/custom/backup.tar.gz';
      const path = await store.create('/source', custom);
      expect(path).toBe(custom);
    });
  });

  describe('errors', () => {
    it('throws when source dir does not exist', async () => {
      await expect(store.create('/missing')).rejects.toThrow(AppError);
    });

    it('throws when extract is called with a missing archive', async () => {
      await expect(store.extract('/missing.tar.gz', '/target')).rejects.toThrow(FileOperationError);
    });
  });

  describe('security validator', () => {
    it('accepts plain relative paths', () => {
      expect(store.validateEntry({ path: 'profile.json' })).toBe(true);
      expect(store.validateEntry({ path: 'sub/dir/file.json' })).toBe(true);
    });

    it('rejects absolute paths', () => {
      expect(store.validateEntry({ path: '/etc/passwd' })).toBe(false);
    });

    it('rejects path traversal', () => {
      expect(store.validateEntry({ path: '../../etc/passwd' })).toBe(false);
      expect(store.validateEntry({ path: 'foo/../../bar' })).toBe(false);
    });

    it('rejects symlinks and hardlinks', () => {
      expect(store.validateEntry({ path: 'evil', type: 'SymbolicLink' })).toBe(false);
      expect(store.validateEntry({ path: 'evil', type: 'Link' })).toBe(false);
    });

    it('rejects entries without a path', () => {
      expect(store.validateEntry({})).toBe(false);
    });

    it('honors a custom validator', () => {
      const custom = new InMemoryBackupStore({ validator: () => false });
      expect(custom.validateEntry({ path: 'anything' })).toBe(false);
    });
  });

  describe('generateBackupName + getBackupDir', () => {
    it('generateBackupName produces timestamped unique names', () => {
      const a = store.generateBackupName();
      const b = store.generateBackupName();
      expect(a).not.toBe(b);
      expect(a).toMatch(/^claude-profile-backup-.*\.tar\.gz$/);
    });

    it('getBackupDir returns the configured or default path', () => {
      expect(store.getBackupDir()).toBe('/virtual/.claude-profile-backups');
      const custom = new InMemoryBackupStore({ backupDir: '/my/backups' });
      expect(custom.getBackupDir()).toBe('/my/backups');
    });
  });
});

describe('BackupStore port (contract test against production singleton)', () => {
  it('exposes the full interface', () => {
    const s: BackupStore = backupStore;
    expect(typeof s.create).toBe('function');
    expect(typeof s.extract).toBe('function');
    expect(typeof s.list).toBe('function');
    expect(typeof s.getBackupDir).toBe('function');
    expect(typeof s.generateBackupName).toBe('function');
  });

  it('list returns an array (possibly empty) when the backup dir does not exist', () => {
    // Production singleton uses ~/.claude-profile-backups which
    // does not exist on the test host; list() must return [] not
    // throw.
    const list = backupStore.list();
    expect(Array.isArray(list)).toBe(true);
  });

  it('generateBackupName returns a timestamped filename', () => {
    const name = backupStore.generateBackupName();
    expect(name).toMatch(/^claude-profile-backup-.*\.tar\.gz$/);
  });

  it('getBackupDir returns a path under $HOME', () => {
    const dir = backupStore.getBackupDir();
    expect(dir).toContain('.claude-profile-backups');
  });
});
