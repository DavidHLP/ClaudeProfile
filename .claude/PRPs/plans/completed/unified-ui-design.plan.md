# Plan: 统一 CLI UI 设计

## Summary
统一 env-switcher 所有命令的 UI 体验：消除中英文混用、inquirer 提示信息不一致、ANSI 样式散落各处、Profile 选择方式不统一等问题，建立一套集中的主题系统和一致的交互模式。

## User Story
As a env-switcher 用户, 我希望所有命令的 UI 风格统一、语言一致、交互模式可预测, 以便快速识别信息并高效操作。

## Problem → Solution
**当前**: 中英文混杂、ANSI 硬编码散落多个文件、`selectExistingProfile` vs `selectProfileFromList` 两套选择逻辑、banner 与表格风格割裂、错误/成功消息格式不统一
**目标**: 统一中文 UI、集中式主题系统、唯一 Profile 选择器、一致的视觉语言

## Metadata
- **Complexity**: Medium
- **Source PRD**: N/A
- **PRD Phase**: N/A
- **Estimated Files**: 6

---

## UX Design

### Before
```
create:  ? 请选择 API Provider: (英文 inquirer 默认样式)
list:    ENV-SWITCHER WORKSPACE CONFIGURATION (英文标题 + 英文 STATUS)
switch:  +----------------------------------+  (box-drawing banner)
         |       ENV-SWITCHER               |
         +----------------------------------+
edit:    ? Select profile: (英文!)
delete:  ? Select profile: (英文!)
         \x1b[33m警告: ...\x1b[0m (硬编码 ANSI)
```

### After
```
create:  ? 请选择 API Provider: (统一主题色)
list:    ┌──────────────────────────────────┐
         │     🔄 环境切换器                  │
         ├──────────────────────────────────┤
         │  配置       提供商      状态      │
         │  ────────  ────────  ────────    │
         │  > kimi    Kimi      ✓ 已激活    │
         │    minimax MiniMax   ○ 待命      │
         └──────────────────────────────────┘
switch:  同上 banner 风格，统一表格
edit:    ? 请选择配置: (中文)
delete:  ? 请选择配置: (中文，使用主题系统样式)
         ⚠ 警告: 这是当前激活的配置！(主题系统)
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| `edit`/`delete` 选择 | `selectExistingProfile`（仅名称） | `selectProfileFromList`（含详情） | 统一用带详情的选择器 |
| 所有 inquirer message | 英文/中文混杂 | 全中文 | `Select profile:` → `请选择配置:` |
| 错误消息 | `\x1b[31m` 硬编码 | `theme.error()` | 集中管理 |
| 警告消息 | `\x1b[33m` 硬编码 | `theme.warning()` | 集中管理 |
| Banner | ASCII box-drawing `+---+` | Unicode box-drawing `┌─┐` | 与表格风格一致 |
| 成功前缀 | `✓` 绿色 | `✓` 主题系统绿色 | 无视觉变化，但走统一通道 |
| list 表头 | 英文 `PROFILE/PROVIDER/STATUS` | 中文 `配置/提供商/状态` | 全中文 |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `src/presenters/envPresenter.ts` | 1-184 | 当前所有格式化逻辑 |
| P0 | `src/ui/prompt.ts` | 1-163 | 当前所有交互提示 |
| P1 | `src/commands/delete.ts` | 36-38 | 硬编码 ANSI 的典型位置 |
| P1 | `src/commands/switch.ts` | 25-58 | banner 使用方式 |
| P2 | `src/templates/providers.ts` | all | Provider 名称和描述 |

## External Documentation

无 — 项目使用原生 ANSI + inquirer，无需外部库文档。

---

## Patterns to Mirror

### NAMING_CONVENTION
// SOURCE: src/presenters/envPresenter.ts:4-14
```typescript
const styles = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};
```

### ERROR_HANDLING
// SOURCE: src/presenters/envPresenter.ts:170-172
```typescript
formatError(message: string): string {
  return `\x1b[31m错误:\x1b[0m ${message}`;
}
```

### SUCCESS_PATTERN
// SOURCE: src/presenters/envPresenter.ts:147-149
```typescript
formatCreateSuccess(profileName: string, _profilePath: string): string {
  return `${green('✓')} 配置 '${profileName}' 已创建`;
}
```

### INQUIRER_LIST_PATTERN
// SOURCE: src/ui/prompt.ts:19-33
```typescript
const { providerId } = await inquirer.prompt({
  type: 'list',
  name: 'providerId',
  message: '请选择 API Provider:',
  choices,
});
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `src/ui/theme.ts` | CREATE | 集中式主题系统，替代散落的 ANSI 硬编码 |
| `src/presenters/envPresenter.ts` | UPDATE | 使用主题系统，统一中文表头，改进 banner/表格 |
| `src/ui/prompt.ts` | UPDATE | 全中文提示，删除 `selectExistingProfile`，统一用 `selectProfileFromList` |
| `src/commands/delete.ts` | UPDATE | 去掉硬编码 ANSI，使用主题系统 |
| `src/commands/edit.ts` | UPDATE | 使用 `selectProfileFromList` 替代 `selectExistingProfile` |
| `src/commands/switch.ts` | UPDATE | 适配新 presenter 接口 |

## NOT Building

- 不引入新的依赖库（chalk、ora 等）
- 不改变命令行参数结构
- 不改变数据存储格式
- 不添加新命令
- 不实现自定义 inquirer 主题（保持 inquirer 默认外观，仅统一 message 文案）

---

## Step-by-Step Tasks

### Task 1: 创建集中式主题系统 `src/ui/theme.ts`
- **ACTION**: 新建主题模块，导出统一的样式函数和常量
- **IMPLEMENT**:
```typescript
// ANSI style constants (单一真相源)
export const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
} as const;

// 语义化样式函数
export const theme = {
  bold: (t: string) => `${ansi.bold}${t}${ansi.reset}`,
  dim: (t: string) => `${ansi.dim}${t}${ansi.reset}`,
  success: (t: string) => `${ansi.green}${t}${ansi.reset}`,
  error: (t: string) => `${ansi.red}${t}${ansi.reset}`,
  warning: (t: string) => `${ansi.yellow}${t}${ansi.reset}`,
  info: (t: string) => `${ansi.cyan}${t}${ansi.reset}`,
  active: (t: string) => `${ansi.green}${ansi.bold}${t}${ansi.reset}`,
  standby: (t: string) => `${ansi.dim}${t}${ansi.reset}`,
};

// 常用组合
export const icon = {
  success: theme.success('✓'),
  warning: theme.warning('⚠'),
  error: theme.error('✗'),
  active: theme.success('●'),
  standby: theme.dim('○'),
  arrow: theme.success('❯'),
};

// 视觉工具
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

export function padVisualEnd(text: string, targetWidth: number): string {
  const visualLen = stripAnsi(text).length;
  const padding = Math.max(0, targetWidth - visualLen);
  return text + ' '.repeat(padding);
}

// Unicode box-drawing
export const box = {
  tl: '┌', tr: '┐', bl: '└', br: '┘',
  h: '─', v: '│',
  lj: '├', rj: '┤', cross: '┼',
};
```
- **MIRROR**: 复用 envPresenter.ts 中已有的 styles 常量模式，但提升为语义化
- **IMPORTS**: 无外部依赖
- **GOTCHA**: `icon.arrow` 的 `❯` 字符在部分终端可能显示为双宽度，需测试
- **VALIDATE**: `npx tsc --noEmit` 无错误

### Task 2: 重构 `src/presenters/envPresenter.ts`
- **ACTION**: 使用 theme.ts 替代内联 ANSI，改进 banner 和表格为 Unicode box-drawing，表头改为中文
- **IMPLEMENT**:
  1. 删除内联的 `styles`、`s()`、`bold()`、`green()`、`dim()` 函数
  2. 删除内联的 `stripAnsi()` 和 `padVisualEnd()`，从 theme.ts 导入
  3. `formatBanner()` 改用 Unicode box-drawing:
```
┌──────────────────────────────────┐
│        🔄 环境切换器               │
└──────────────────────────────────┘
```
  4. `formatProfileList()` 表头改为中文：`配置` / `提供商` / `状态` / `密钥`
  5. 状态改为中文：`ACTIVE` → `已激活`，`Standby` → `待命`
  6. 活跃标记：`>` → `●`，非活跃：` ` → `○`
  7. 表格改用 Unicode box-drawing 边框
  8. `formatError()` 使用 `theme.error()`
  9. `formatNoProfiles()` 使用 `theme.info()`
  10. `formatSwitchSuccess()` 优化布局，保持一致性
  11. 新增 `formatWarning()` 方法（供 delete 等命令使用）
- **MIRROR**: 当前表格式样，但用 box-drawing 替代 `─` 分隔线
- **IMPORTS**: `import { theme, icon, stripAnsi, padVisualEnd, box } from '../ui/theme.js';`
- **GOTCHA**: 中文字符在终端中是双宽度的，`padVisualEnd` 需正确处理 — 但当前代码中 `padVisualEnd` 基于 `stripAnsi(text).length`，对 ASCII 内容足够；如果表头用中文（如 `配置` 是 2 个字符宽），需要确保宽度计算正确。最安全的方案：表格列内容仍以英文为主（配置名、Provider 名都是 ASCII），表头中文用 `padVisualEnd` 也能正确工作，因为 `length` 在 ASCII + 中文混合下对齐需要考虑双宽。**决策**：表头保持英文缩写形式（PROFILE/PROVIDER/STATUS），但增加中文副标签，或者直接用中文但确保 `padVisualEnd` 适配双宽字符。实际上最简洁的方案是：**表头保持英文**（因为数据本身就是英文为主），但所有 inquirer message 和成功/错误消息统一中文。这样避免双宽字符对齐问题。
- **修订**: 重新评估 — 用户截图展示的是中文 Provider（阿里云百炼、火山引擎），所以数据中确实有中文。表头用中文会导致对齐问题。**最终决策**：表头保持英文，但所有交互文本（prompt、success、error）统一中文。STATUS 列改为中文（`已激活`/`待命`），因为这两列的宽度是固定的。
- **VALIDATE**: `npm run build` 成功；手动运行 `env-switcher list` 检查对齐

### Task 3: 重构 `src/ui/prompt.ts`
- **ACTION**: 统一中文提示，删除 `selectExistingProfile`，所有 profile 选择统一使用 `selectProfileFromList`
- **IMPLEMENT**:
  1. 删除 `selectExistingProfile()` 函数
  2. `selectProfileFromList()` 的 message 改为 `请选择配置:`
  3. `selectProfileFromList()` 的 choice 格式优化：使用 `icon.active`/`icon.standby` 替代文字 ACTIVE/Standby
  4. `inputProfileName()` message 保持 `配置名称:`
  5. `inputApiToken()` message 保持 `API Token:`
  6. `inputBaseUrl()` message 保持 `API Base URL:`
  7. `inputSonnetModel()` message 保持 `SONNET 模型:`
  8. `inputOpusModel()` message 保持 `OPUS 模型:`
  9. `inputHaikuModel()` message 保持 `HAIKU 模型:`
  10. `confirmAction()` 已有 message 参数，无需修改
  11. `selectProvider()` message 保持 `请选择 API Provider:`
- **MIRROR**: 现有 inquirer.prompt 模式
- **IMPORTS**: `import { icon } from './theme.js';`
- **GOTCHA**: `selectProfileFromList` 中 choice 的 `name` 字段包含 icon，需要确保 inquirer 正确渲染 ANSI
- **VALIDATE**: `npm run build` 成功

### Task 4: 更新 `src/commands/delete.ts`
- **ACTION**: 移除硬编码 ANSI，使用 presenter 的 `formatWarning()`
- **IMPLEMENT**:
  1. 删除 `\x1b[33m警告:...\x1b[0m` 硬编码
  2. 使用 `envPresenter.formatWarning('这是当前激活的配置！')` 替代
  3. 确认消息改为：`确定要删除配置 '${selectedName}' 吗？` + warning 附加行
- **MIRROR**: 现有 `confirmAction` 模式
- **IMPORTS**: 无新增（envPresenter 已导入）
- **GOTCHA**: 无
- **VALIDATE**: `npm run build` 成功

### Task 5: 更新 `src/commands/edit.ts`
- **ACTION**: 使用 `selectProfileFromList` 替代 `selectExistingProfile`
- **IMPLEMENT**:
  1. 将 `selectExistingProfile(profiles.map(p => p.name), currentProfile)` 改为 `selectProfileFromList(profiles, currentProfile)`
  2. 移除 `selectExistingProfile` 的导入
  3. 添加 `selectProfileFromList` 的导入
- **MIRROR**: switch.ts 中已有的 `selectProfileFromList` 用法
- **IMPORTS**: 从 `../ui/prompt.js` 导入 `selectProfileFromList` 替代 `selectExistingProfile`
- **GOTCHA**: `selectProfileFromList` 返回 `string | null`，与 `selectExistingProfile` 一致，无需修改后续逻辑
- **VALIDATE**: `npm run build` 成功

### Task 6: 更新 `src/commands/switch.ts`
- **ACTION**: 适配新 presenter 接口（banner 格式变更）
- **IMPLEMENT**:
  1. 无需修改代码逻辑 — `envPresenter.formatBanner()` 接口不变，只是返回值变了
  2. 确认 `formatSwitchSuccess` 仍正确使用
- **MIRROR**: 现有模式
- **IMPORTS**: 无变更
- **GOTCHA**: 无
- **VALIDATE**: `npm run build` 成功

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| `formatBanner()` | 无 | 包含 `┌` `┐` `└` `┘` Unicode box-drawing | 否 |
| `formatProfileList()` 0 profiles | [] | 显示 "没有可用的配置" 消息 | 是 |
| `formatProfileList()` 1 active | [profile], current=profile | 表格含 `●` active 标记 | 否 |
| `formatProfileList()` mixed | [active, standby] | 活跃用 `●`，待命用 `○` | 否 |
| `formatError()` | "test" | 包含红色 "错误:" 前缀 | 否 |
| `formatWarning()` | "test" | 包含黄色 "警告:" 前缀 | 否 |
| `theme.success()` | "ok" | `\x1b[32mok\x1b[0m` | 否 |
| `stripAnsi()` | `\x1b[32mok\x1b[0m` | `"ok"` | 否 |
| `padVisualEnd()` | `\x1b[1mhi\x1b[0m`, 10 | 视觉宽度 10 | 否 |
| `selectProfileFromList()` | profiles with Chinese provider | 正确渲染 | 是 |

### Edge Cases Checklist
- [x] 无 profile 时的空状态
- [x] 中文 Provider 名称的表格对齐
- [x] 删除激活中的 profile 的警告

---

## Validation Commands

### Static Analysis
```bash
npx tsc --noEmit
```
EXPECT: Zero type errors

### Build
```bash
npm run build
```
EXPECT: Build succeeds

### Unit Tests
```bash
npm run test
```
EXPECT: All tests pass

### Manual Validation
- [ ] `env-switcher list` — 表格对齐、banner 使用 Unicode box-drawing
- [ ] `env-switcher switch` — profile 选择器显示详情、banner 一致
- [ ] `env-switcher edit` — 使用带详情的选择器
- [ ] `env-switcher delete` — 警告使用主题系统、选择器带详情
- [ ] `env-switcher create` — 提示信息全中文

---

## Acceptance Criteria
- [x] 所有任务完成
- [x] 零硬编码 ANSI 在命令文件中（delete.ts 的 `\x1b[33m` 已移除）
- [x] 所有 inquirer message 统一中文
- [x] `selectExistingProfile` 已删除，统一用 `selectProfileFromList`
- [x] ANSI 样式集中管理在 `theme.ts`
- [x] Banner 使用 Unicode box-drawing
- [x] `npm run build` 通过
- [x] `npm run test` 通过
- [x] 无类型错误

## Completion Checklist
- [x] 代码遵循现有模式
- [x] 错误处理与 presenter 接口一致
- [x] 无硬编码值
- [x] 无不必要的范围扩展

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 中文字符导致表格对齐偏移 | Medium | Low | 表头保持英文，STATUS 列固定宽度 |
| Unicode box-drawing 在旧终端不渲染 | Low | Low | 现代终端均支持，WSL2 无问题 |
| inquirer choice 中 ANSI 代码被截断 | Low | Medium | 测试 `selectProfileFromList` 渲染 |

## Notes
- 不引入外部依赖，保持项目轻量
- `selectExistingProfile` 被删除后，`edit` 和 `delete` 命令都使用 `selectProfileFromList`，用户能看到更多上下文信息
- 表头保持英文是经过权衡的决策：避免双宽字符对齐问题，同时 Profile 名、Provider 名本身是 ASCII/混合文本
