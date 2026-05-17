# Plan: env-switcher UI Enrichment

## Summary
为 env-switcher 的交互界面添加视觉层次、ASCII 字符装饰和格式化输出，提升用户感官体验。改进 `switch` 命令的选择界面、切换成功反馈，以及整体输出格式。

## User Story
作为用户，我希望 env-switcher 的交互界面更加美观和易读，这样我可以更愉快地管理和切换 API 配置。

## Problem → Solution
当前简陋的文字界面（`switched to: minimax`）→ 带有视觉层次、ASCII 边框和彩色输出的精美界面

## Metadata
- **Complexity**: Medium
- **Source PRD**: N/A
- **PRD Phase**: N/A (standalone feature request)
- **Estimated Files**: 3 files, ~200 lines

---

## UX Design

### Before
```
? 选择配置: minimax (当前)
switched to: minimax
```

### After
```
+----------------------------------+
|       ENV-SWITCHER               |
+----------------------------------+

  Profile: (3 available)

    [*] minimax  (current)
    [ ] openai
    [ ] claude-api

  Select profile:

  >> switched to: minimax

  (environment variables synced)
```

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `src/ui/prompt.ts` | 1-132 | 核心 prompt 实现，需在其上扩展 |
| P0 | `src/presenters/envPresenter.ts` | 1-116 | 输出格式化，需扩展样式 |
| P1 | `src/commands/switch.ts` | 1-58 | switch 命令入口 |

---

## Patterns to Mirror

### INQUIRER_STYLING
// SOURCE: `src/ui/prompt.ts:19-32`
使用 inquirer 原生的 `choices` 格式，添加 `name` 和 `value` 分离的选项格式。

### ANSI_ESCAPE_CODES
// SOURCE: `src/presenters/envPresenter.ts:103-108`
使用 `\x1b[` + 数字 + `m` 格式的 ANSI 转义码：
- `\x1b[31m` 红色
- `\x1b[36m` 青色
- `\x1b[32m` 绿色
- `\x1b[33m` 黄色
- `\x1b[1m` 粗体
- `\x1b[0m` 重置

### PRESENTER_PATTERN
// SOURCE: `src/presenters/envPresenter.ts:58-115`
`EnvPresenterImpl` 类实现 `EnvPresenter` 接口，所有格式化方法集中在 presenter 中。

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `src/ui/prompt.ts` | UPDATE | 增强 `selectExistingProfile` 的视觉呈现，添加头部边框 |
| `src/presenters/envPresenter.ts` | UPDATE | 扩展 `formatSwitchSuccess` 使用更多样式，添加新方法 |
| `src/commands/switch.ts` | UPDATE | 交互模式输出添加更多上下文信息 |

---

## NOT Building
- 不修改非 TTY 模式的输出格式（脚本使用场景需保持简洁）
- 不添加动画效果（inquirer 不支持，添加会导致兼容性问题）
- 不使用外部颜色库（如 chalk），保持零依赖
- 不使用 emoji 图标系统（用户要求）

---

## Step-by-Step Tasks

### Task 1: Enhance ANSI Style Utilities in Presenter
- **ACTION**: 在 `envPresenter.ts` 中添加样式工具函数
- **IMPLEMENT**:
  ```typescript
  // 样式常量
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
    bgBlue: '\x1b[44m',
  };

  // 辅助函数
  const s = (style: string, text: string) => `${style}${text}${styles.reset}`;
  const bold = (text: string) => s(styles.bold, text);
  const green = (text: string) => s(styles.green, text);
  const cyan = (text: string) => s(styles.cyan, text);
  const dim = (text: string) => s(styles.dim, text);
  ```
- **MIRROR**: ANSI_ESCAPE_CODES 模式
- **VALIDATE**: 编译通过，测试通过

### Task 2: Add Banner/Header Rendering
- **ACTION**: 在 `envPresenter.ts` 中添加 `formatBanner()` 方法
- **IMPLEMENT**:
  ```typescript
  formatBanner(): string {
    return `+----------------------------------+
|       ENV-SWITCHER               |
+----------------------------------+`;
  }
  ```
- **MIRROR**: 现有格式化模式
- **VALIDATE**: 返回非空字符串，格式正确

### Task 3: Enhance formatSwitchSuccess
- **ACTION**: 扩展 `formatSwitchSuccess` 显示更丰富的信息
- **IMPLEMENT**:
  ```typescript
  formatSwitchSuccess(profileName: string, _env: EnvConfig): string {
    return `
  >> switched to: ${bold(green(profileName))}

  (environment variables synced)
`;
  }
  ```
- **MIRROR**: 现有格式化模式
- **VALIDATE**: 输出包含 >> 符号和颜色

### Task 4: Enhance selectExistingProfile Prompt
- **ACTION**: 改进 `src/ui/prompt.ts` 中的 `selectExistingProfile` 函数
- **IMPLEMENT**:
  1. 使用 `[*]` 和 `[ ]` 符号代替 `(当前)` 文字标记
  2. 添加 "Select profile" 的视觉引导

  ```typescript
  export async function selectExistingProfile(names: string[], currentProfile: string | null): Promise<string | null> {
    if (names.length === 0) {
      return null;
    }

    const choices = names.map((name) => ({
      name: name === currentProfile ? `[*] ${name}  (current)` : `[ ] ${name}`,
      value: name,
    }));

    const { selected } = await inquirer.prompt({
      type: 'list',
      name: 'selected',
      message: 'Select profile:',
      choices,
      loop: false,
    });

    return selected;
  }
  ```
- **MIRROR**: INQUIRER_STYLING 模式
- **IMPORTS**: 无新依赖
- **VALIDATE**: 交互测试，界面显示正确

### Task 5: Add Profile List Header in switchCommandInteractive
- **ACTION**: 在 `switchCommandInteractive` 中输出 banner
- **IMPLEMENT**:
  在 `switchCommandInteractive` 中先输出 banner：
  ```typescript
  console.log(envPresenter.formatBanner());
  console.log();
  console.log(`  Profile: (${profiles.length} available)`);
  console.log();
  ```
- **MIRROR**: PRESENTER_PATTERN
- **VALIDATE**: 切换时显示 banner

### Task 6: Update formatProfileList for Consistency
- **ACTION**: 更新 `formatProfileList` 使用新的样式
- **IMPLEMENT**:
  ```typescript
  formatProfileList(profiles: Profile[], currentProfile: string | null): string {
    const lines: string[] = [];
    lines.push('');
    lines.push(`  ${bold('Profile:')} (${profiles.length} available)`);
    lines.push('');

    if (profiles.length === 0) {
      lines.push(`  ${dim('(use env-switcher create to add a profile)')}`);
      return lines.join('\n');
    }

    for (const profile of profiles) {
      const isActive = profile.name === currentProfile;
      const marker = isActive ? green('[*]') : dim('[ ]');
      const label = isActive ? bold(profile.name) : profile.name;
      const suffix = isActive ? dim('  (current)') : '';
      lines.push(`    ${marker} ${label}${suffix}`);
      if (profile.description) {
        lines.push(`        ${dim(profile.description)}`);
      }
    }

    return lines.join('\n');
  }
  ```
- **MIRROR**: PRESENTER_PATTERN
- **VALIDATE**: 输出包含 [*]/[ ] 标记和颜色

### Task 7: Add Tests for Enhanced Formatting
- **ACTION**: 在 `tests/envPresenter.test.ts` 中添加新测试
- **IMPLEMENT**:
  ```typescript
  test('formatBanner returns non-empty string', () => {
    const banner = envPresenter.formatBanner();
    expect(banner.length).toBeGreaterThan(0);
    expect(banner).toContain('ENV-SWITCHER');
  });

  test('formatSwitchSuccess includes styling', () => {
    const output = envPresenter.formatSwitchSuccess('test-profile', {});
    expect(output).toContain('>>');
    expect(output).toContain('test-profile');
  });
  ```
- **MIRROR**: TEST_STRUCTURE
- **VALIDATE**: `npm run test` 通过

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| formatBanner | - | 包含 ENV-SWITCHER | 非空验证 |
| formatSwitchSuccess | 'minimax' | 包含 >> 和 minimax | 空 env 对象 |
| selectExistingProfile | ['a','b'], 'a' | 返回 'a' 或 'b' | 用户取消 |

### Edge Cases Checklist
- [x] 空配置列表 - 已有处理
- [x] 只有一个配置 - 已有处理
- [x] 选择当前配置 - 已有处理
- [x] 用户取消选择 - 已有处理

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

### Manual Validation
- [ ] `env-switcher list` 显示带 [*]/[ ] 标记的配置列表
- [ ] `env-switcher switch` 交互式选择显示美化界面
- [ ] 切换成功显示 >> 符号和彩色输出

---

## Acceptance Criteria
- [ ] 所有任务完成
- [ ] 验证命令通过
- [ ] 测试通过
- [ ] 无类型错误
- [ ] UX 设计符合预期

## Completion Checklist
- [ ] 代码遵循 ANSI 转义码模式
- [ ] presenter 模式保持一致
- [ ] inquirer 使用方式正确
- [ ] 无硬编码值
- [ ] 测试覆盖新功能

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ANSI 颜色在某些终端不兼容 | Low | Low | 使用标准 ANSI 代码，Node.js 18+ 普遍支持 |
| 横幅在非 TTY 场景干扰输出 | Low | Low | 仅在 TTY 模式输出 banner |

## Notes
- 保持对 `inquirer` 现有用法的兼容
- 不引入新依赖，保持零依赖原则
- 所有颜色使用标准 ANSI 转义码，确保跨平台兼容
- 使用 ASCII 字符 `+ | -` 代替 emoji 图标
- 使用 `[*]/[ ]` 代替 `●/○` 标记
- 使用 `>>` 代替 `✓` 作为提示符号
