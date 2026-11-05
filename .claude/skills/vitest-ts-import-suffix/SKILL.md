---
name: vitest-ts-import-suffix
description: "Vitest requires .js suffix for TS imports and tests in separate directory"
user-invocable: false
origin: auto-extracted
---

# Vitest + TypeScript Import Syntax Pattern

**Extracted:** 2026-05-18
**Context:** Setting up tests for TypeScript project using vitest

## Problem
When using vitest with TypeScript, tests fail with "Cannot find module" errors because of incorrect import paths. Vitest has specific requirements:
1. Test files must be in a specific directory (`tests/` not `src/`)
2. Import paths to TypeScript source files must use `.js` suffix

## Solution

### Directory structure
```
project/
├── tests/              ← Test files go HERE (not src/)
│   └── providerRegistry.test.ts
├── src/                ← Source code
│   └── templates/
│       └── providerRegistry.ts
└── vitest.config.ts
```

### Import syntax
```typescript
// WRONG - will fail
import { ProviderRegistry } from '../src/templates/providerRegistry.ts';

// CORRECT - use .js suffix even for .ts files
import { ProviderRegistry } from '../src/templates/providerRegistry.js';
```

### vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],  // Tests must be in tests/
  },
});
```

## When to Use
- Creating new test files in a TypeScript + vitest project
- Getting "Cannot find module" errors for test imports
- Setting up vitest configuration for the first time in a project

## Related Gotchas
- Singleton instances (like `providerRegistry`) need fresh instances in `beforeEach` to avoid test pollution
- Run `npm run build` after modifying `src/` since the CLI reads from `dist/`
