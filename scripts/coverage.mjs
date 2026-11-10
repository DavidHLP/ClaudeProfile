import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mergeProcessCovs } from '@bcoe/v8-coverage';
import v8ToIstanbul from 'v8-to-istanbul';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';

// Include only application source, not tests/helpers/dependencies. Emit the
// previous text, JSON and HTML artifacts, remapped to the original TypeScript.
export async function reportCoverage(root, rawDirectory) {
  const records = [];
  for (const name of await readdir(rawDirectory)) {
    if (name.endsWith('.json')) records.push(JSON.parse(await readFile(path.join(rawDirectory, name), 'utf8')));
  }
  if (!records.length) throw new Error('No V8 coverage records were produced');
  const merged = mergeProcessCovs(records);
  const byUrl = new Map(merged.result.map(script => [script.url, script]));
  const coverageMap = libCoverage.createCoverageMap({});
  let matchedScripts = 0;
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.name.endsWith('.js')) {
        const converter = v8ToIstanbul(filename, 0);
        await converter.load();
        const script = byUrl.get(pathToFileURL(filename).href);
        if (script) matchedScripts++;
        const source = await readFile(filename, 'utf8');
        converter.applyCoverage(script?.functions ?? [{
          functionName: '(empty-report)', isBlockCoverage: true,
          ranges: [{ startOffset: 0, endOffset: source.length, count: 0 }],
        }]);
        coverageMap.merge(converter.toIstanbul());
      }
    }
  }
  await visit(path.join(root, '.test-build/src'));
  if (!matchedScripts) throw new Error('No executed application script matched V8 coverage URLs');
  if (!coverageMap.files().length || coverageMap.files().some(file => !path.resolve(file).startsWith(path.join(root, 'src') + path.sep))) {
    throw new Error('Coverage source map escaped application source or produced no files');
  }
  const context = libReport.createContext({ dir: path.join(root, 'coverage'), coverageMap });
  for (const reporter of ['text', 'json', 'html']) reports.create(reporter).execute(context);
}
