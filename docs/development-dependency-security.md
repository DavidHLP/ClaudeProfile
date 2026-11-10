# Development dependency security and Node 18

The full development workflow still runs on Node 18, 20, and 22 (validation uses
current patch releases, including 18.20.8). The packaged CLI's runtime contract
is unchanged. A newer-only test job plus a Node 18 CLI smoke test is not a
substitute for the complete matrix.

## Remove the vulnerable development execution paths

Issue #33 is addressed by replacing Vitest/Vite and their worker, mock-server,
and coverage-glob dependencies rather than maintaining private security forks
or overriding upstream engine declarations. `node:test` provides process-per-file
isolation and serial tests within each file. Standalone `expect` and `jest-mock`
provide assertions/function mocks, not a Jest runner or module transformation.

- `npm test`: compile a clean ignored `.test-build/` tree, then run all test files.
- `npm run test:coverage`: the same tests with V8 coverage, merged by script URL
  and remapped to original TypeScript. Emits text, `coverage/coverage-final.json`
  and HTML reports. Every application source file is included, including unloaded
  files with zero coverage; tests and dependencies are excluded.
- `npm run test:watch`: recompile and rerun when source/test TypeScript changes.
- `npm run build` and `npx tsc --noEmit`: remain the application type-check gates.
  The separate test emission config uses `noCheck`, as the previous runner did
  not type-check test sources either.

All 438 application tests remain. The 17 tests specifically exercising removed
brace-expansion implementations are retired and replaced by dependency-absence
and test-helper regression assertions. The shell-hook snapshot keeps exactly the
same expected hash as an explicit equality assertion. Module mocks are replaced
by scoped mutable-object/builtin stubs restored after each test.

The old coverage engine's AST remapping and the new V8/source-map converter do
not calculate identical percentages, so raw before/after coverage percentages
must not be treated as a test-coverage regression by themselves. Source coverage
scope and JSON/HTML artifacts remain; no threshold is lowered or disabled.

## Validation

Run clean `npm ci --engine-strict`, type-check, build, full tests, coverage and
CLI smoke on Node 18/20/22. Run full and production-only `npm audit`. No audit
suppression or replacement version metadata is used. `tests/testToolchain.test.ts`
checks the lock contains none of the removed execution/glob paths. A passing
audit is a dated dependency snapshot, not a guarantee against future findings.
