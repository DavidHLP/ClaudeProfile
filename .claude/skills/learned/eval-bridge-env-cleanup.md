---
name: eval-bridge-env-cleanup
description: "When switching named configs via eval bridge, diff old/new env and output unset for residual keys before export"
user-invocable: false
origin: auto-extracted
---

# Eval Bridge Env Cleanup on Config Switch

**Extracted:** 2026-05-16
**Context:** Building a CLI tool that switches between named configurations (profiles) via eval bridge, where each config has a different set of environment variables.

## Problem
When a child process (Node.js CLI) uses the eval bridge pattern to set shell environment variables, switching from Config A to Config B only outputs `export KEY='VALUE'` for Config B's vars. Any key that was set by Config A but absent from Config B lingers in the shell. This is especially problematic for optional fields (timeouts, feature flags) that differ between configs.

## Solution
Diff the old and new env mappings. Output `unset KEY;` for keys present in the old config but absent in the new one, BEFORE the `export` lines:

```typescript
function buildSwitchCommands(oldEnv: EnvConfig | null, newEnv: EnvConfig): string {
  const oldKeys = new Set(Object.entries(oldEnv ?? {}).filter(([,v]) => v).map(([k]) => k));
  const newKeys = new Set(Object.entries(newEnv).filter(([,v]) => v).map(([k]) => k));

  const lines: string[] = [];
  // Unset residual keys first
  for (const key of oldKeys) {
    if (!newKeys.has(key)) lines.push(`unset ${key};`);
  }
  // Then export new keys
  for (const [key, value] of Object.entries(newEnv)) {
    if (value) lines.push(`export ${key}='${value}';`);
  }
  return lines.join('\n');
}
```

Key rules:
- `unset` lines MUST come before `export` lines (a key unset then re-exported works correctly; `unset` on non-existent var is a no-op)
- Skip `unset` for keys with falsy values in old env (they were never exported)
- When `oldEnv` is null (first switch), only output export lines

## When to Use
- Building any CLI tool that manages shell env vars via eval bridge
- When configs/profiles have different optional fields
- Tools like env-switchers, cloud profile managers, container context switchers
