# Development dependency security and Node 18

The project currently supports the complete build and test workflow on Node
18, 20, and 22, not only execution of the packaged CLI. Keep that distinction
when updating development dependencies.

## Temporary brace-expansion pins

The version-scoped overrides preserve the two APIs used by the coverage chain:

- `@vitest/coverage-v8` → `test-exclude` → `minimatch` 10 uses the named
  `expand` export from `brace-expansion` 5.0.7.
- `test-exclude` → `glob` 10 → `minimatch` 9 uses the callable CommonJS export
  from `brace-expansion` 2.1.7.

Both versions fix the exponential expansion of repeated non-expanding brace
groups in [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp).
The 2.1.7 branch also includes the later 2.x fixes. The overrides keep future
dependency resolution from reverting those minimums or selecting an unsupported
5.x release: 5.0.7 declares Node 18 support, while 5.0.8 and later require Node 20.
Do not flatten both consumers onto one major version.

This is **partial remediation**. The 5.0.7 branch still matches subsequent
brace-expansion advisories, including
[GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), whose
5.x fix is 5.0.12. Other development dependency findings in Vitest, mocker,
tinypool, glob, and minimatch also remain. Do not suppress those audit results
or describe this change as making the full dependency tree vulnerability-free.

These dependencies process development/coverage configuration, and no remotely
exploitable CLI path has been established from the version matches alone.

## Validation and retirement

`tests/braceExpansion.test.ts` resolves both packages through their actual
minimatch consumers. It checks ordinary expansion/matching and runs the
exponential-regression input in time- and memory-bounded child processes.
Validate updates with clean installation, type checking, build, full tests,
and coverage on Node 18, 20, and 22. Review both full and production-only audits.

Revisit these pins when upstream publishes compatible fixes or when a separately
reviewed development-toolchain migration is approved. A newer toolchain tested
on Node 20+ plus a packaged-CLI smoke test on Node 18 does not preserve the
existing ability to run the full test suite and coverage on Node 18.
