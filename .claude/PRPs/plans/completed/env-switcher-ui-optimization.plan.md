# Plan: env-switcher 交互界面优化

## Summary
优化 env-switcher CLI 的交互界面设计，简化输出、提高用户体验、统一交互风格。

## User Story
作为用户，我希望 env-switcher 的输出简洁、信息清晰、交互友好，无需不必要的视觉噪音。

## Problem → Solution
当前界面输出冗余、ANSI颜色代码过多、交互提示不够友好 → 精简输出、移除不必要的装饰、统一错误和成功消息格式

## Metadata
- **Complexity**: Medium
- **Source PRD**: N/A
- **PRD Phase**: N/A
- **Estimated Files**: 4 files, 6 tasks

---

## UX Design

### Before
```
=== Claude Code 环境配置 ===

  (无配置文件)

使用 env-switcher create 创建新配置
```

### After
```
配置列表 (共 0 个)

  使用 env-switcher create 创建新配置
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| list输出 | 冗长ANSI标题 | 简洁标题 | 移除"Claude Code 环境配置" |
| 错误消息 | 红色"错误:"前缀 | 简洁消息 | 减少视觉噪音 |
| 创建成功 | 显示文件路径 | 简化确认 | 减少信息量 |
| 删除确认 | 显示路径信息 | 精简提示 | 更友好的警告 |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `src/presenters/envPresenter.ts` | all | 核心输出格式化逻辑 |
| P0 | `src/ui/prompt.ts` | all | 交互提示函数 |
| P1 | `src/commands/list.ts` | all | 列表命令 |
| P1 | `src/commands/delete.ts` | all | 删除交互流程 |
| P2 | `tests/envPresenter.test.ts` | all | 测试参考 |

---

## Patterns to Mirror

### PRESENTER_PATTERN
// SOURCE: src/presenters/envPresenter.ts:1-22
输出格式化函数模式：
- `buildExportCommands` / `buildSwitchCommands` - 纯函数，无副作用
- `format*` 方法返回字符串
- 使用 \x1b[] ANSI颜色代码

### ERROR_HANDLING
// SOURCE: src/types/command.ts:28-30
CommandResult 类型定义：
```typescript
export type CommandResult =
  | { success: true; output: string }
  | { success: false; error: string; wasCancelled?: boolean };
```

### PROMPT_PATTERN
// SOURCE: src/ui/prompt.ts:1-17
Inquirer prompt 封装：
- 使用 `name: 'value'` 获取输入
- validate 函数返回 true 或错误字符串

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `src/presenters/envPresenter.ts` | UPDATE | 优化输出格式 |
| `src/ui/prompt.ts` | UPDATE | 优化交互提示 |
| `src/commands/delete.ts` | UPDATE | 优化确认信息 |
| `tests/envPresenter.test.ts` | UPDATE | 更新测试断言 |

---

## NOT Building
- 不修改命令的核心逻辑
- 不修改 Profile 数据结构
- 不修改 settings sync 功能

---

## Step-by-Step Tasks

### Task 1: 简化 envPresenter 输出格式
- **ACTION**: 优化 `formatProfileList` 和其他 format* 方法
- **IMPLEMENT**:
  ```typescript
  formatProfileList(profiles: Profile[], currentProfile: string | null): string {
    const lines: string[] = [];
    lines.push(`配置列表 (共 ${profiles.length} 个)`);
    lines.push('');

    if (profiles.length === 0) {
      lines.push('  使用 env-switcher create 创建新配置');
      return lines.join('\n');
    }

    // ... 简洁的列表格式
  }
  ```
- **MIRROR**: PRESENTER_PATTERN
- **GOTCHA**: 保持与测试断言一致
- **VALIDATE**: 运行测试确认输出格式

### Task 2: 优化错误消息格式
- **ACTION**: 简化 `formatError` 方法
- **IMPLEMENT**:
  ```typescript
  formatError(message: string): string {
    return `错误: ${message}`;
  }
  ```
- **MIRROR**: PRESENTER_PATTERN
- **VALIDATE**: 测试错误输出

### Task 3: 优化创建成功消息
- **ACTION**: 简化 `formatCreateSuccess`
- **IMPLEMENT**:
  ```typescript
  formatCreateSuccess(profileName: string, profilePath: string): string {
    return `✓ 配置 '${profileName}' 已创建`;
  }
  ```
- **MIRROR**: PRESENTER_PATTERN
- **VALIDATE**: 测试创建输出

### Task 4: 优化删除确认消息
- **ACTION**: 简化 `formatDeleteSuccess` 和交互确认
- **IMPLEMENT**:
  ```typescript
  formatDeleteSuccess(profileName: string, wasActive: boolean): string {
    if (wasActive) {
      return `✓ 配置 '${profileName}' 已删除 (当前激活)`;
    }
    return `✓ 配置 '${profileName}' 已删除`;
  }
  ```
- **MIRROR**: PRESENTER_PATTERN
- **VALIDATE**: 测试删除输出

### Task 5: 优化交互提示
- **ACTION**: 简化 prompt.ts 中的消息
- **IMPLEMENT**: 缩短 inquirer 的 message 文本
- **VALIDATE**: 手动测试交互流程

### Task 6: 更新测试断言
- **ACTION**: 同步更新测试文件
- **IMPLEMENT**: 修改 envPresenter.test.ts 中的断言
- **VALIDATE**: 运行测试确认通过

---

## Testing Strategy

### Unit Tests
| Test | Input | Expected Output |
|---|---|---|
| formatProfileList | 空列表 | "配置列表 (共 0 个)" |
| formatDeleteSuccess | 活跃配置 | 包含"(当前激活)" |
| formatCreateSuccess | 新建profile | 简洁确认消息 |

### Validation Commands
```bash
npm run test
```
EXPECT: All tests pass

```bash
npm run build
```
EXPECT: Zero type errors

---

## Acceptance Criteria
- [ ] list 输出更简洁
- [ ] 错误消息格式统一
- [ ] 成功消息精简
- [ ] 交互提示更友好
- [ ] 所有测试通过
