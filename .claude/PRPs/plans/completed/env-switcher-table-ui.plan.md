# Plan: env-switcher Table UI Redesign

## Summary
将 env-switcher switch 命令的交互 UI 从原始列表样式改为表格样式显示，添加键盘导航提示，与 inquirer 的 list 类型集成。

## User Story
As a user, I want to see all profiles in a clean table format with provider/status/api key columns, so that I can quickly scan and select my desired configuration.

## Problem → Solution
当前使用 `rawlist` 只显示 profile name → 新的表格布局显示 PROFILE/PROVIDER/STATUS/API KEY 四列，支持键盘导航

## Metadata
- **Complexity**: Small
- **Source PRD**: N/A
- **PRD Phase**: standalone
- **Estimated Files**: 2

---

## UX Design

### Before
```
+----------------------------------+
|       ENV-SWITCHER               |
+----------------------------------+

  Profile: (3 available)

    [ ] kimi
        Kimi (Moonshot)
    [*] minimax  [current]
        MiniMax
    [ ] volcano
        火山引擎

? Select profile:
```

### After
```
  ENV-SWITCHER WORKSPACE CONFIGURATION

  PROFILE        PROVIDER       STATUS       API KEY
  ────────────────────────────────────────────────────
  kimi           Moonshot       Standby      [ UNSET ]
> minimax        MiniMax        ACTIVE       [ ***** ]
  volcano        ByteDance      Standby      [ ***** ]

  ────────────────────────────────────────────────────
  [Up/Down] Navigate   [Enter] Select   [Esc] Cancel
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Display format | 原始列表 | 表格 | 四列布局 |
| Markers | `[*]/[ ]` | `>` 箭头 | inquirer list 内置 |
| Current profile | `[current]` 后缀 | `ACTIVE` 状态 + `*` | STATUS 列显示 |
| Provider | description 字段 | 独立 PROVIDER 列 | 从模板推断 |
| API Key | 无 | `UNSET` 或 `*****` | 隐私保护 |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `src/presenters/envPresenter.ts` | 85-107 | formatProfileList 需重写 |
| P0 | `src/ui/prompt.ts` | 113-131 | selectExistingProfile 适配 |
| P1 | `src/services/profileService.ts` | 1-30 | 获取 provider 信息 |

---

## Patterns to Mirror

### PRESENTER_PATTERN
// SOURCE: src/presenters/envPresenter.ts:78-107
EnvPresenter 负责格式化所有输出，保持单一职责

### INQUIRER_LIST_USAGE
// SOURCE: src/ui/prompt.ts:123-128
使用 inquirer prompt 的 list 类型实现键盘导航

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `src/presenters/envPresenter.ts` | UPDATE | 重写 formatProfileList 为表格样式 |
| `src/ui/prompt.ts` | UPDATE | 适配 list 类型，移除手动 marker |
| `tests/envPresenter.test.ts` | UPDATE | 更新测试断言 |

## NOT Building
- 不修改 profile 数据结构
- 不修改 inquirer 交互逻辑（list 类型本身已支持键盘导航）

---

## Step-by-Step Tasks

### Task 1: Rewrite formatProfileList for table layout
- **ACTION**: 重写 envPresenter.formatProfileList 为表格格式
- **IMPLEMENT**: 输出包含 PROFILE/PROVIDER/STATUS/API KEY 四列的表格
- **MIRROR**: PRESENTER_PATTERN
- **IMPORTS**: 使用现有的 Profile 类型和 styles
- **GOTCHA**: 需要从 profile 推断 provider 名称（使用 description 或默认模板名）
- **VALIDATE**: 运行 formatProfileList 单元测试

### Task 2: Simplify selectExistingProfile
- **ACTION**: 简化 prompt.ts 中的 selectExistingProfile
- **IMPLEMENT**: 移除 name 中的 `[current]` 后缀（inquirer list 会高亮当前项）
- **MIRROR**: INQUIRER_LIST_USAGE
- **IMPORTS**: 无新增
- **GOTCHA**: 使用 inquirer 的 `default` 属性指定当前 profile
- **VALIDATE**: 手动测试交互流程

### Task 3: Update test assertions
- **ACTION**: 更新 envPresenter.test.ts 中的断言
- **IMPLEMENT**: 检查表格格式、列标题、STATUS 列值
- **MIRROR**: TEST_STRUCTURE
- **IMPORTS**: 无新增
- **VALIDATE**: 运行完整测试套件

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| formatProfileList shows table headers | profiles, currentProfile | 包含 PROFILE/PROVIDER/STATUS/API KEY | 空列表 |
| formatProfileList shows ACTIVE for current | minimax 作为当前 | STATUS 列显示 ACTIVE | 无当前 profile |
| formatProfileList shows Standby for others | 其他 profile | STATUS 列显示 Standby | 单 profile |
| formatProfileList masks API key | 有 token 的 profile | 显示 `[ ***** ]` | 无 token 显示 `[ UNSET ]` |

### Edge Cases Checklist
- [ ] 空 profiles 列表
- [ ] 单一 profile
- [ ] 当前 profile 为 null
- [ ] profile 没有 description

---

## Validation Commands

### Static Analysis
```bash
npm run typecheck
```
EXPECT: Zero type errors

### Unit Tests
```bash
npm test
```
EXPECT: All tests pass

### Build
```bash
npm run build
```
EXPECT: tsc 编译成功

### Manual Validation
- [ ] env-switcher switch 显示表格
- [ ] 键盘 Up/Down 导航有效
- [ ] Enter 选择有效
- [ ] Esc 取消有效
- [ ] 当前 profile 高亮显示

---

## Acceptance Criteria
- [ ] 表格显示 PROFILE/PROVIDER/STATUS/API KEY 四列
- [ ] 当前 profile 显示 `ACTIVE` 状态
- [ ] 非当前 profile 显示 `Standby` 状态
- [ ] API token 隐藏显示 `[ ***** ]` 或 `[ UNSET ]`
- [ ] inquirer list 支持键盘导航
- [ ] 所有测试通过

---

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| provider 名称推断不准确 | Low | Medium | 使用 description 或默认模板 |
| 表格列宽不整齐 | Medium | Low | 使用固定宽度字符串填充 |

---

## Notes
- 使用 inquirer 的 `list` 类型而非 `rawlist`，因为 list 内置高亮当前项
- 使用 ANSI 转义序列设置表格列宽和对齐
