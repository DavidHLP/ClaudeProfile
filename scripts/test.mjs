import { readdir, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
if (process.argv.includes('--watch')) {
  // Watch source directories, not emitted JavaScript. Recompile every run.
  let timer;
  const watchers = new Map();
  const run = () => {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { stdio: 'inherit' });
    if (result.error) console.error(result.error);
  };
  async function watchDirectory(directory) {
    if (!watchers.has(directory)) watchers.set(directory, watch(directory, () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        watchers.forEach(watcher => watcher.close());
        watchers.clear();
        await watchDirectory(path.join(root, 'src'));
        await watchDirectory(path.join(root, 'tests'));
        run();
      }, 100);
    }));
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) await watchDirectory(path.join(directory, entry.name));
    }
  }
  await watchDirectory(path.join(root, 'src'));
  await watchDirectory(path.join(root, 'tests'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    clearTimeout(timer);
    watchers.forEach(watcher => watcher.close());
    process.exit(0);
  });
  run();
} else {
  const output = path.join(root, '.test-build');
  await rm(output, { recursive: true, force: true });
  const compile = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.test.json'], { stdio: 'inherit' });
  if (compile.error) throw compile.error;
  if (compile.status !== 0) process.exit(compile.status ?? 1);
  const files = [];
  async function discover(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await discover(filename);
      else if (entry.name.endsWith('.test.js')) files.push(filename);
    }
  }
  await discover(path.join(output, 'tests'));
  files.sort();
  if (!files.length) throw new Error('No test files found');
  const rawCoverage = path.join(output, 'v8-coverage');
  const coverage = process.argv.includes('--coverage');
  if (coverage) await mkdir(rawCoverage);
  const env = { ...process.env };
  if (coverage) env.NODE_V8_COVERAGE = rawCoverage;
  const result = spawnSync(process.execPath, ['--enable-source-maps', '--test', ...files], { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (coverage) {
    const { reportCoverage } = await import('./coverage.mjs');
    await reportCoverage(root, rawCoverage);
  }
  process.exit(result.status ?? 1);
}
