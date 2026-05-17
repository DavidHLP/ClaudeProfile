# Plan: env-switcher UI Redesign

## Summary
重新设计 env-switcher switch 交互界面，消除重复显示、减少视觉噪音、优化选择体验。

## User Story
As a CLI user, I want a clean, non-redundant profile selection interface, So that I can quickly switch configurations without visual confusion.

## Problem → Solution

**当前问题**：
- 当前配置在列表和选择提示中重复显示
- inquirer `list` 类型重新渲染选项时导致标记错乱
- 垂直空格过多（banner 后两行空行）
- `[*]` / `[ ]` 标记与 inquirer 内置选择器混用造成视觉干扰

**解决方案**：
- 切换到 `rawlist` 类型（不重新渲染选项）
- 从列表中移除当前配置（已在 shell 中激活）
- 简化提示信息，避免重复显示已选配置
- 紧凑垂直间距

## Metadata
- **Complexity**: Small
- **Estimated Files**: 2 files, ~50 lines

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
    [*] minimax  (current)
        MiniMax
    [ ] volcano
        火山引擎

? Select profile: [*] minimax  (current)

  >> switched to: minimax
```

### After (Option A — Compact List)
```
  Profile: (3 available)

    kimi       - Kimi (Moonshot)
  > minimax    - MiniMax  [current]
    volcano    - 火山引擎

  Select: (Use arrow keys)
```

### After (Option B — Filter Current)
```
  Profile: (2 available)

    kimi       - Kimi (Moonshot)
    volcano    - 火山引擎

  Select: (Use arrow keys)
```

### After (Option C — Rawlist with Message)
```
  Profile: (3 available)

    [1] kimi       - Kimi (Moonshot)
    [2] minimax    - MiniMax  [*]
    [3] volcano    - 火山引擎

  Select [1-3]:
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `src/ui/prompt.ts` | UPDATE | 改用 rawlist，移除当前配置重复显示 |
| `src/presenters/envPresenter.ts` | UPDATE | 简化 formatProfileList 输出，减少间距 |

## NOT Building
- 不改变其他命令的 UI
- 不添加新依赖

---

## Step-by-Step Tasks

### Task 1: Redesign selectExistingProfile with rawlist
- **ACTION**: 修改 `selectExistingProfile` 使用 `rawlist` 类型
- **IMPLEMENT**:
  ```typescript
  export async function selectExistingProfile(names: string[], currentProfile: string | null): Promise<string | null> {
    if (names.length === 0) {
      return null;
    }

    // 选项显示时标记当前配置，但不在提示中重复
    const choices = names.map((name) => ({
      name: name === currentProfile ? `${name}  [current]` : name,
      value: name,
    }));

    const { selected } = await inquirer.prompt({
      type: 'rawlist',
      name: 'selected',
      message: 'Select profile:',
      choices,
    });

    return selected;
  }
  ```
- **MIRROR**: N/A — 新实现参考现有 inquirer 用法
- **GOTCHA**: `rawlist` 需要用户输入数字而非用箭头选择，但更可控
- **VALIDATE**: `npm run test` 通过，交互测试正常

### Task 2: Simplify formatProfileList spacing
- **ACTION**: 减少 formatProfileList 的垂直空格
- **IMPLEMENT**: 移除多余空行，使用更紧凑的布局
  ```typescript
  formatProfileList(profiles: Profile[], currentProfile: string | null): string {
    const lines: string[] = [];
    lines.push(`  ${bold('Profile:')} (${profiles.length} available)`);
    lines.push('');

    if (profiles.length === 0) {
      lines.push(`  ${dim('(use env-switcher create to add a profile)')}`);
      return lines.join('\n');
    }

    for (const profile of profiles) {
      const isActive = profile.name === currentProfile;
      const marker = isActive ? green('>') : dim(' ');
      const label = isActive ? bold(profile.name) : profile.name;
      const suffix = isActive ? dim('  [current]') : '';
      lines.push(`  ${marker} ${label}${suffix}`);
      if (profile.description) {
        lines.push(`      ${dim(profile.description)}`);
      }
    }

    return lines.join('\n');
  }
  ```
- **MIRROR**: 参考现有 formatProfileList 模式
- **VALIDATE**: 单元测试 `formatProfileList` 通过

### Task 3: Remove redundant console output in switch.ts
- **ACTION**: 清理 switch.ts 中多余的空行输出
- **IMPLEMENT**: 移除 `console.log()` 的多余空行
  ```typescript
  // 当前
  console.log(envPresenter.formatBanner());
  console.log();
  console.log(envPresenter.formatProfileList(profiles, currentProfile));
  console.log();

  // 改为
  console.log(envPresenter.formatBanner());
  console.log(envPresenter.formatProfileList(profiles, currentProfile));
  ```
- **VALIDATE**: 手动测试 `env-switcher switch` 输出格式

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
EXPECT: All tests pass

### Build
```bash
npm run build
```
EXPECT: Build succeeds

### Manual Validation
- [ ] 运行 `env-switcher switch` 检查输出格式
- [ ] 验证当前配置不会在列表中重复显示
- [ ] 验证箭头键选择正常工作

---

## Acceptance Criteria
- [ ] 当前配置不在列表中重复显示
- [ ] rawlist 选择器正常工作
- [ ] 输出格式紧凑，无多余空行
- [ ] 所有测试通过
