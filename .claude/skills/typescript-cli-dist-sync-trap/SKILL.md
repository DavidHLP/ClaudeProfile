---
name: typescript-cli-dist-sync-trap
description: "TypeScript CLI projects where bin/entrypoint imports from dist/ — src/ changes require rebuild before global CLI reflects them"
user-invocable: false
origin: auto-extracted
---

# TypeScript CLI dist/ Sync Trap

**Extracted:** 2026-05-17
**Context:** Working on a globally-installed TypeScript CLI tool where the npm `bin` entrypoint imports from `dist/`

## Problem

You modify `src/` files, tests pass, type check passes — but running the globally-installed CLI still shows old behavior. This happens because:

1. The `package.json` `bin` field points to a launcher script (e.g., `bin/cli.js`)
2. That launcher imports from `../dist/commands/*.js` (compiled output)
3. `npm run build` compiles `src/` → `dist/`, but developers often forget this step
4. The globally-linked or `npm i -g` installed binary reads stale `dist/` files

## Solution

After any `src/` modification that should affect runtime behavior:

```bash
npm run build   # or tsc, or the project's build command
```

Then verify by checking the compiled output:
```bash
cat dist/presenters/yourPresenter.js | grep "yourChange"
```

## When to Use

- Trigger: "I changed the code but the CLI still behaves the same"
- Applies to: TypeScript CLI tools with `bin/` → `dist/` architecture, globally installed via `npm link` or `npm i -g`
