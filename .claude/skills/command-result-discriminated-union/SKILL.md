---
name: command-result-discriminated-union
description: "CommandResult 是 discriminated union — 测试和调用方访问 .output 前必须用 if (result.success) 类型守卫,实现端 return 短路用 as const"
user-invocable: false
origin: auto-extracted
---

# CommandResult Discriminated Union Guard Pattern

**Extracted:** 2026-05-18
**Context:** Vitest 测试中访问命令返回值出现 TS 报错;在 runCommand 回调中返回失败值时 literal type 丢失

## Problem

`CommandResult` 类型定义为 discriminated union:

```typescript
type CommandResult =
  | { success: true; output: string }
  | { success: false; error: string; wasCancelled?: boolean };
```

两个常见踩坑点:

1. **测试端**: 直接 `expect(result.output).toContain(...)` 会报 "Property 'output' does not exist on type '{ success: false; ... }'"
2. **实现端**: 在 `runCommand` 回调中 `return { success: false, error: '...' }` 会让 success 推断为 `boolean`(而非 literal `false`),破坏 discriminated union 的窄化能力,导致回调返回类型与外层声明不匹配

## Solution

### 测试端: 用类型守卫收窄

```typescript
// ✓ 成功分支
const result = await myCommand({ shell: 'bash' });
expect(result.success).toBe(true);
if (result.success) {
  expect(result.output).toContain('expected');  // TS 知道这里是 success 分支
}

// ✓ 失败分支
const result = await myCommand({ shell: 'unknown' });
expect(result.success).toBe(false);
if (!result.success) {
  expect(result.error).toMatch(/unsupported/);
}
```

### 实现端: 用 `as const` 保留 literal type

```typescript
// ✗ success 被推断为 boolean,破坏 union
return { success: false, error: '...' };

// ✓ success 保持 literal false
return { success: false as const, error: '...' };
return { success: true as const, output: '...' };
```

## When to Use

- 给 ClaudeProfile 加新的命令测试,看到 "Property 'output' does not exist" 类报错
- 在 `runCommand` 回调中需要中途短路返回失败/成功值
- 设计任何 discriminated union 返回类型的 service/command 层

## Related

- 项目所有命令都遵循该模式,参考 `src/commands/completion.ts`、`src/commands/validate.ts` 的用法
