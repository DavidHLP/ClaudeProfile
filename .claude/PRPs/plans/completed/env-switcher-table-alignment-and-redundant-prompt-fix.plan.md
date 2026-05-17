# Plan: env-switcher Table Alignment and Redundant Prompt Fix

## Summary
修复 `env-switcher switch` 命令的交互式 UI 中的两个问题：
1. 表格列（PROFILE / PROVIDER / STATUS / API KEY）因 `padEnd()` 无法正确处理 ANSI 转义码而视觉错位、挤在一起。
2. `formatProfileList()` 输出的 `[Up/Down] Navigate` 提示与下方 `inquirer` 列表选择器重复，造成冗余和误导。

## User Story
作为 env-switcher 用户，
我希望在运行 `env-switcher switch` 时看到一个对齐整齐、没有重复提示的交互式配置列表，
以便快速准确地选择目标配置。

## Problem → Solution
[表格列因 ANSI 转义码导致 padEnd 计算错误而错位，且存在多余的导航提示] → [使用视觉宽度感知的填充函数并动态计算列宽，同时移除与实际交互控件冲突的导航提示]

## Metadata
- **Complexity**: Small
- **Source PRD**: N/A
- **PRD Phase**: N/A
- **Estimated Files**: 2 (1 源码 + 1 测试)

---

## UX Design

### Before
```
+----------------------------------+
|       ENV-SWITCHER               |
+----------------------------------+
  ENV-SWITCHER WORKSPACE CONFIGURATION

  PROFILEPROVIDERSTATUSAPI KEY
  ────────────  ────────────  ──────────  ────────────
    kimi      Kimi (Moonshot)Standby[ ***** ]
  > minimaxMiniMax       ACTIVE[ ***** ]
    volcano   火山引擎          Standby[ ***** ]
  ────────────  ────────────  ──────────  ────────────
  [Up/Down] Navigate   [Enter] Select   [Esc] Cancel
? Select profile: (Use arrow keys)
  kimi
❯ minimax
  volcano
```

### After
```
+----------------------------------+
|       ENV-SWITCHER               |
+----------------------------------+
  ENV-SWITCHER WORKSPACE CONFIGURATION

  PROFILE    PROVIDER          STATUS   API KEY
  ─────────  ───────────────  ───────  ─────────
    kimi     Kimi (Moonshot)  Standby  [ ***** ]
  > minimax  MiniMax          ACTIVE   [ ***** ]
    volcano  火山引擎          Standby  [ ***** ]
  ─────────  ───────────────  ───────  ─────────
? Select profile: (Use arrow keys)
  kimi
❯ minimax
  volcano
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| 表格底部 | 包含 `[Up/Down] Navigate   [Enter] Select   [Esc] Cancel` | 不再包含该提示 | 实际交互由 inquirer 处理，此提示造成误导和视觉冗余 |
| 表头间距 | `PROFILEPROVIDERSTATUSAPI KEY` 挤在一起 | `PROFILE    PROVIDER          STATUS   API KEY` 等宽对齐 | 使用视觉宽度计算，正确处理 ANSI 颜色码 |
| 数据行 | `> minimaxMiniMax       ACTIVE[ ***** ]` 错位 | `> minimax  MiniMax          ACTIVE   [ ***** ]` 对齐 | 动态列宽 + 视觉宽度填充 |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 (critical) | `src/presenters/envPresenter.ts` | 1-157 | 包含 `formatProfileList` 和 ANSI 样式辅助函数，是修复核心 |
| P0 (critical) | `src/commands/switch.ts` | 25-62 | `switchCommandInteractive` 调用 presenter 和 inquirer，确认交互流程 |
| P1 (important) | `src/ui/prompt.ts` | 113-134 | `selectExistingProfile` 使用 inquirer `list` 类型，确认实际选择器 |
| P1 (important) | `tests/envPresenter.test.ts` | 128-201 | `formatProfileList` 现有测试，确认测试覆盖范围 |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| ANSI escape sequences | ECMA-262 / Node.js | `\x1b[` 开头的控制序列在终端中不占显示宽度，但计入 `String.prototype.length` |

---

## Patterns to Mirror

### NAMING_CONVENTION
// SOURCE: src/presenters/envPresenter.ts:1-21
```typescript
const styles = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  // ...
};
const s = (style: string, text: string): string => `${style}${text}${styles.reset}`;
const bold = (text: string): string => s(styles.bold, text);
```

### ERROR_HANDLING
// SOURCE: src/presenters/envPresenter.ts:85-92
```typescript
if (profiles.length === 0) {
  lines.push('');
  lines.push(`  ${dim('(no profiles available, use env-switcher create to add one)')}`);
  return lines.join('\n');
}
```

### TEST_STRUCTURE
// SOURCE: tests/envPresenter.test.ts:179-201
```typescript
describe('formatProfileList', () => {
  it('should show profile details in table format', () => {
    const result = envPresenter.formatProfileList(profiles, null);
    expect(result).toContain('minimax');
    expect(result).toContain('MiniMax API');
    expect(result).toContain('PROFILE');
    expect(result).toContain('PROVIDER');
    expect(result).toContain('STATUS');
    expect(result).toContain('API KEY');
  });
});
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `src/presenters/envPresenter.ts` | UPDATE | 修复表格对齐逻辑，添加视觉宽度辅助函数，移除冗余导航提示 |
| `tests/envPresenter.test.ts` | UPDATE | 可选：添加测试验证表格不再包含导航提示，或验证对齐函数正确性 |

## NOT Building

- 不修改 `src/commands/switch.ts` — 交互流程本身是正确的，问题在 presenter 输出
- 不修改 `src/ui/prompt.ts` — inquirer 列表选择器工作正常，无需改动
- 不引入外部依赖（如 `strip-ansi` npm 包）— 用简单的正则表达式即可处理
- 不改变 inquirer 的交互行为 — 只修复 presenter 的输出内容

---

## Step-by-Step Tasks

### Task 1: Add visual-width padding helpers
- **ACTION**: 在 `src/presenters/envPresenter.ts` 的 `styles` 常量之后添加两个纯函数：`stripAnsi` 和 `padVisualEnd`
- **IMPLEMENT**:
  ```typescript
  function stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }

  function padVisualEnd(text: string, targetWidth: number): string {
    const visualLen = stripAnsi(text).length;
    const padding = Math.max(0, targetWidth - visualLen);
    return text + ' '.repeat(padding);
  }
  ```
- **MIRROR**: 保持与现有 `s()` / `bold()` 等辅助函数相同的纯函数风格，放在文件顶部附近
- **IMPORTS**: 无（纯字符串操作，零依赖）
- **GOTCHA**: `stripAnsi` 正则只需覆盖本项目使用的 ANSI 格式码（`\x1b[1m`, `\x1b[2m`, `\x1b[31m` 等），`[0-9;]*m` 足够通用
- **VALIDATE**: 在 REPL 中验证 `padVisualEnd(bold('PROFILE'), 9)` 的 `.length` > 9 但 `stripAnsi(...).length === 9`

### Task 2: Compute dynamic column widths
- **ACTION**: 在 `formatProfileList` 中，用实际数据计算四列的最大视觉宽度，替代硬编码的 `colWidth` 对象
- **IMPLEMENT**:
  ```typescript
  const profileWidth = Math.max(
    'PROFILE'.length,
    ...profiles.map(p => p.name.length + 2) // marker(1) + space(1) + name
  );
  const providerWidth = Math.max(
    'PROVIDER'.length,
    ...profiles.map(p => (p.description || 'Unknown').length)
  );
  const statusWidth = Math.max(
    'STATUS'.length,
    'ACTIVE'.length,
    'Standby'.length
  );
  const apiKeyWidth = Math.max(
    'API KEY'.length,
    '[ ***** ]'.length,
    '[ UNSET ]'.length
  );
  ```
- **MIRROR**: 保持与现有代码相同的局部常量命名风格（camelCase）
- **IMPORTS**: 无
- **GOTCHA**: `p.name.length + 2` 中的 `+2` 是因为数据行格式为 `${marker} ${name}`（marker 占 1 格，中间空格占 1 格）
- **VALIDATE**: 用包含 `Kimi (Moonshot)`（15 字符）的 profiles 测试，确认 `providerWidth` 输出为 15

### Task 3: Rewrite table row construction with visual padding
- **ACTION**: 将表头、分隔线、数据行的拼接逻辑全部替换为 `padVisualEnd` 版本，确保每列严格对齐
- **IMPLEMENT**:
  - 表头行：
    ```typescript
    lines.push(`  ${padVisualEnd(bold('PROFILE'), profileWidth)}  ${padVisualEnd(bold('PROVIDER'), providerWidth)}  ${padVisualEnd(bold('STATUS'), statusWidth)}  ${bold('API KEY')}`);
    ```
  - 分隔线：
    ```typescript
    const divider = '  ' + '─'.repeat(profileWidth) + '  ' + '─'.repeat(providerWidth) + '  ' + '─'.repeat(statusWidth) + '  ' + '─'.repeat(apiKeyWidth);
    ```
  - 数据行：
    ```typescript
    lines.push(`  ${padVisualEnd(`${marker} ${name}`, profileWidth)}  ${padVisualEnd(provider, providerWidth)}  ${padVisualEnd(status, statusWidth)}  ${apiKey}`);
    ```
- **MIRROR**: 保持 `lines.push()` 的累积模式，与现有代码一致
- **IMPORTS**: 使用 Task 1 中新增的 `padVisualEnd`
- **GOTCHA**: `marker` 和 `name` 都含有 ANSI 码，`padVisualEnd` 会自动剥离计算，无需额外处理；`apiKey` 本身长度固定且已在 `apiKeyWidth` 中考虑，无需填充
- **VALIDATE**: 运行 `npm run test` 中 `envPresenter` 相关测试，确保所有包含性断言通过

### Task 4: Remove redundant navigation hint
- **ACTION**: 删除 `formatProfileList` 末尾输出 `[Up/Down] Navigate` 的行
- **IMPLEMENT**: 删除第 115 行（或等价行）：
  ```typescript
  lines.push(`  ${dim('[Up/Down] Navigate   [Enter] Select   [Esc] Cancel')}`);
  ```
- **MIRROR**: N/A（删除代码）
- **IMPORTS**: N/A
- **GOTCHA**: 确认 `src/commands/list.ts` 也使用 `formatProfileList`；移除导航提示对纯列表展示命令同样有益（`list` 命令无交互，该提示是误导）
- **VALIDATE**: 确认 `tests/envPresenter.test.ts` 中没有断言包含 `'[Up/Down]'` 或 `'Navigate'` 字符串

### Task 5: Verify all tests pass
- **ACTION**: 运行完整测试套件，确认无回归
- **VALIDATE**: `npm run test` 应全部通过；`npx tsc --noEmit` 应无类型错误

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| `padVisualEnd(bold('PROFILE'), 9)` | bold 后的 ANSI 字符串 | 视觉宽度恰好为 9，右侧补齐空格 | ANSI 码长度干扰 |
| `padVisualEnd(green('>') + ' ' + bold('minimax'), 9)` | 多段 ANSI 字符串拼接 | 视觉宽度恰好为 9，无需补齐 | 多段 ANSI 码 |
| `formatProfileList` with `Kimi (Moonshot)` | provider 描述长度 15 | provider 列宽 ≥ 15，所有行对齐 | 动态列宽 |
| `formatProfileList` result | 任何 profiles 输入 | 结果中不含 `'[Up/Down]'` 子串 | 导航提示已移除 |

### Edge Cases Checklist
- [ ] 空 profiles 数组（早期返回，不进入表格逻辑）
- [ ] 超长 profile name（动态列宽自动扩展）
- [ ] 超长 provider description（动态列宽自动扩展）
- [ ] 当前 profile 为 null（无 ACTIVE 行，所有 marker 为空格）
- [ ] 仅有一个 profile（单列，无错位风险）

---

## Validation Commands

### Static Analysis
```bash
npx tsc --noEmit
```
EXPECT: Zero type errors

### Unit Tests
```bash
npm run test
```
EXPECT: All tests pass (当前测试仅做包含性断言，不会检查对齐，但应无回归)

### Full Test Suite
```bash
npm run test
```
EXPECT: No regressions

### Manual Validation
- [ ] 运行 `env-switcher switch`，确认表格四列对齐
- [ ] 确认表格底部不再显示 `[Up/Down] Navigate`
- [ ] 确认 inquirer 列表选择器仍能正常工作
- [ ] 运行 `env-switcher list`，确认非交互列表也对齐且无导航提示

---

## Acceptance Criteria
- [ ] Task 1-4 全部完成
- [ ] `npx tsc --noEmit` 无类型错误
- [ ] `npm run test` 全部通过
- [ ] 表格视觉对齐，无列挤压
- [ ] 表格输出不再包含 `[Up/Down] Navigate` 等冗余提示
- [ ] 未引入外部依赖

## Completion Checklist
- [ ] 代码遵循现有纯函数风格
- [ ] 错误处理保持原有模式（空数组早期返回）
- [ ] 测试无回归
- [ ] 无硬编码值（列宽动态计算）
- [ ] 自包含 — 无需额外提问即可实现

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 中文字符（如 `火山引擎`）在部分终端中占双倍宽度，导致轻微错位 | Medium | Low | 本项目以英文为主，且 `providerWidth` 由最长英文描述 `Kimi (Moonshot)` 决定，中文行自然有充足填充空间 |
| 移除导航提示后用户不适应 | Low | Low | 保留 inquirer 自身的 `(Use arrow keys)` 提示，交互功能完全不变 |

## Notes
- 本项目已使用 `inquirer` 的 `list` 类型处理键盘导航和选择，因此 `formatProfileList` 中的 `[Up/Down] Navigate` 是纯粹的视觉冗余，而非功能替代。
- 动态列宽会轻微增加每次渲染时的计算量（O(n) 遍历 profiles），但 profiles 数量通常 < 20，性能影响可忽略。
