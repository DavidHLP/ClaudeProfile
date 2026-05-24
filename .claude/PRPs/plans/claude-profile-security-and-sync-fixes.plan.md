# Plan: ClaudeProfile Security & Sync Fixes

## Summary
基于 `docs/roadmap/claude-code-session-env-switching-gap-analysis-2026-05-24.md` 与 `docs/roadmap/claude-profile-gap-deep-analysis-2026-05-24.md` 两份代码审计报告，系统修复 ClaudeProfile CLI 中的 Critical 级别安全缺陷（Shell 注入、明文 Token 权限、Tar 命令注入）、High 级别功能缺失（Settings 同步语义偏差、Scope 支持、交互式 Switch 不同步）以及架构层面的 IPC 设计缺陷（eval 依赖）。

## User Story
As a ClaudeProfile user, I want the tool to safely manage my API tokens and reliably sync configurations to Claude Code settings, so that I can switch profiles without risking command injection or configuration loss.

## Problem → Solution
Current code uses string-interpolation + eval for shell IPC, stores tokens with world-readable permissions, silently overwrites profiles on import, and has mismatched sync semantics between README and implementation. Solution: introduce POSIX-safe shell quoting, structured JSON IPC, config file permission hardening, unified validation layer, corrected switch semantics, and settings scope support.

## Metadata
- **Complexity**: Large
- **Source PRD**: `docs/roadmap/claude-profile-gap-deep-analysis-2026-05-24.md`
- **PRD Phase**: P0 Hotfix + P1 Core Fixes
- **Estimated Files**: 18+

---

## UX Design

### Before
```
$ claude-profile switch minimax
# No settings sync unless --sync is passed
# eval executes unquoted shell strings
# Profile files created with 0644 permissions
# Import silently overwrites existing profiles
```

### After
```
$ claude-profile switch minimax
# Automatically syncs to settings.json by default
# --no-sync to opt out
# Shell output is safely quoted
# Profile files created with 0600 permissions
# Import requires --force to overwrite
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| `switch <profile>` | Only syncs with `--sync` | Syncs by default, `--no-sync` to opt out | Breaking change for scripts relying on no-sync |
| `switch` (interactive) | Never syncs | Syncs by default | Fixes README inconsistency |
| `import <file>` | Silently overwrites if name matches file | Requires `--force` to overwrite | Safer default |
| `export --current` | Outputs raw shell strings | Outputs safely quoted strings | `--json` available for machine parsing |
| `backup` | Uses system `tar` command | Uses `node-tar` library | No shell exec, path validation |
| `init` | Bash-only eval hook | Bash hook with `--json` support | Fish/PowerShell out of scope for this plan |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `src/presenters/envPresenter.ts` | 1-67 | Core IPC output functions with injection flaws |
| P0 | `src/commands/init.ts` | 1-83 | Shell hook with eval dependency |
| P0 | `src/commands/import.ts` | 1-103 | Import logic with reversed overwrite condition |
| P0 | `src/config/fileSystemConfigStore.ts` | 1-100 | File storage without permission hardening |
| P0 | `src/commands/switch.ts` | 1-61 | Switch command missing sync in interactive mode |
| P1 | `src/engine/settingsSync.ts` | 1-32 | computeSettingsEnv with aggressive delete semantics |
| P1 | `src/config/claudeSettingsStore.ts` | 1-60 | Fixed path to user settings, no scope support |
| P1 | `src/commands/backup.ts` | 1-152 | execSync tar with injection and traversal risks |
| P1 | `src/services/settingsSyncService.ts` | 1-49 | Sync orchestration layer |
| P2 | `bin/claude-profile.js` | 1-208 | CLI argument routing, --sync detection |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| node-tar API | npm `tar` package | Use `tar.create()` and `tar.extract()` with `filter` option for path validation |
| POSIX env var naming | IEEE Std 1003.1 | Env keys must match `^[A-Za-z_][A-Za-z0-9_]*$` |

---

## Patterns to Mirror

### NAMING_CONVENTION
```typescript
// SOURCE: src/services/profileService.ts:19-21
export class ProfileServiceImpl implements ProfileService {
  constructor(private readonly store: ConfigStore) {}
```
Services use PascalCase class names with `Impl` suffix, constructor DI pattern.

### ERROR_HANDLING
```typescript
// SOURCE: src/commands/runner.ts (implied by usage in all commands)
export async function runCommand(description: string, fn: () => Promise<CommandResult>): Promise<CommandResult> {
  try {
    return await fn();
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}
```
All command implementations wrap in `runCommand()` and return `CommandResult` discriminated union.

### TYPE_GUARD
```typescript
// SOURCE: bin/claude-profile.js:183-192
if (result.output) {
  console.log(result.output);
}
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
```
Always check `result.success` before accessing `output` or `error`.

### TEST_STRUCTURE
```typescript
// SOURCE: tests/envPresenter.test.ts:1-4
import { describe, it, expect, beforeEach } from 'vitest';
import { envPresenter, buildExportCommands, buildSwitchCommands } from '../src/presenters/envPresenter.js';
```
Tests use vitest, import from `.js` suffix for TS sources, test file location: `tests/**/*.test.ts`.

### IMMUTABILITY
```typescript
// SOURCE: src/config/claudeSettingsStore.ts:53
const updated = { ...settings, env };
```
Use spread operator for object updates, never mutate existing objects.

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `src/utils/shellSafety.ts` | CREATE | New shell-safe validation and quoting utilities |
| `src/presenters/envPresenter.ts` | UPDATE | Inject shell-safe quoting into buildExportCommands/buildSwitchCommands |
| `src/commands/init.ts` | UPDATE | Add --json hook path, deprecate pure eval |
| `src/utils/validation.ts` | UPDATE | Add validateProfileName, validateEnvKey, validateEnvValue |
| `src/commands/import.ts` | UPDATE | Fix overwrite logic, add --force, use validation layer |
| `src/config/fileSystemConfigStore.ts` | UPDATE | Add mode 0o700/0o600 to mkdirSync/writeFileSync |
| `src/commands/validate.ts` | UPDATE | Add permission checks, shell-safety checks |
| `src/commands/switch.ts` | UPDATE | Default syncToSettings=true, pass sync in interactive mode |
| `bin/claude-profile.js` | UPDATE | Parse --no-sync, --force, --scope, --dry-run, --json flags |
| `src/engine/settingsSync.ts` | UPDATE | Fix aggressive delete semantics |
| `src/config/claudeSettingsStore.ts` | UPDATE | Support dynamic file paths for scope |
| `src/commands/sync.ts` | CREATE | New dedicated sync command |
| `src/commands/doctor.ts` | CREATE | New doctor diagnostic command |
| `src/commands/status.ts` | CREATE | New status command |
| `src/commands/backup.ts` | UPDATE | Replace execSync with node-tar, add entry validation |
| `src/commands/run.ts` | CREATE | New run/exec command |
| `tests/` | UPDATE | Add security-focused tests for shell injection, permissions, tar traversal |
| `README.md` | UPDATE | Correct sync behavior documentation |

## NOT Building

- Fish / PowerShell init hook native generation (P3 scope, requires separate shell syntax implementation)
- Keychain / 1Password secret reference support (P3 scope, requires external integration)
- Provider online validation / ping (P2 scope, requires network layer)
- Provider external template registry (P2 scope, requires template versioning system)
- direnv / mise integration (P3 scope)
- 加密备份 (加密算法选型、密钥管理超出当前 scope)
- Windows-specific path handling (当前阶段仍假设 Unix-like 环境)

---

## Step-by-Step Tasks (WBS)

### FEAT-001: Shell 安全基础设施

---

**[任务编号与名称]**
TASK-001: [安全] 实现 shell-safe 校验工具函数与 presenter 重构

**[任务描述]**
实现 `isValidEnvKey(key: string): boolean` 与 `shellQuote(value: string): string` 两个工具函数，分别用于校验环境变量 key 是否符合 POSIX 标准（`^[A-Za-z_][A-Za-z0-9_]*$`）以及对 value 中的单引号进行安全转义（`'\''` 替换）。随后重构 `src/presenters/envPresenter.ts` 中的 `buildExportCommands()` 和 `buildSwitchCommands()`，强制在拼接 export/unset 字符串前调用上述工具函数。若 key 不合法，则抛出 `AppError`。同时补充 `src/utils/validation.ts` 中的相关校验函数，供 create/edit/import 命令复用。

**[前置依赖]**
无

**[参考文档]**
- `docs/roadmap/claude-profile-gap-deep-analysis-2026-05-24.md` §2.1, §2.5
- `src/presenters/envPresenter.ts`
- `src/utils/validation.ts`

**[交付物标准]**
1. 新建 `src/utils/shellSafety.ts`，导出 `isValidEnvKey` 和 `shellQuote`，并附带完整单元测试（覆盖单引号、反引号、`$()`、换行符等恶意输入）
2. 更新 `src/presenters/envPresenter.ts`，`buildExportCommands` 和 `buildSwitchCommands` 强制调用上述函数
3. 更新 `src/utils/validation.ts`，增加 `validateProfileName`、`validateEnvKey`、`validateEnvValue`
4. `tests/envPresenter.test.ts` 新增恶意 token/value 的测试用例
5. `npm run build` 与 `npm test` 全部通过

---

# Workflow & DoD (Definition of Done)
为了确保代码质量，本任务必须严格遵循以下质量内循环，直至代码审查（CR）完全通过：

1. 🧪 【初步自测】
   - 开发者完成编码后，必须针对「交付物标准」进行本地功能自测或编写单元测试。

2. 🔍 【提交代码审查 (CR)】
   - 发起 Pull Request (PR) / Merge Request (MR)，邀请核心团队成员进行代码评审，并完整记录 CR 反馈意见。

3. 🛠️ 【修复 CR 意见 (Fix CR)】
   - 针对评审中发现的性能、安全、规范等问题逐项修复，禁止遗漏任何一条 blocking 意见。

4. 🔄 【回归测试】
   - 对修复后的代码再次进行本地回归测试，确保没有引入新的破坏性变更（Regression Bug）。

5. 🏁 【流程终止与提交条件】
   - **准出条件（DoD）**：只有当所有 CR 意见全部闭环、Reviewer 给出 Approved 状态，且回归测试 100% 通过时，方可执行最后一步。
   - **最终操作**：将代码正式 Commit 并合并至主分支，更新任务状态为“已完成”。

---

**[任务编号与名称]**
TASK-002: [安全] 实现 --json 机器可读输出模式与 shell hook 重构

**[任务描述]**
在 `export`、`switch` 命令中新增 `--json` 全局选项。当指定 `--json` 时，`buildExportCommands`/`buildSwitchCommands` 不再返回 shell 字符串，而是返回 JSON 对象（如 `{"set":{"KEY":"value"},"unset":["OLD_KEY"]}`）。同时重构 `src/commands/init.ts` 中的 shell hook：在 bash hook 中，当调用 `export --current` 时优先使用 `--json` 输出，并通过 `node -e` 或 `python -c` 等可信解析器将 JSON 转换为 export 命令，而非直接 eval 原始字符串。保留字符串模式作为向后兼容的降级路径。

**[前置依赖]**
TASK-001

**[参考文档]**
- `docs/roadmap/claude-profile-gap-deep-analysis-2026-05-24.md` §2.1
- `src/commands/init.ts`
- `bin/claude-profile.js`

**[交付物标准]**
1. `envPresenter.ts` 新增 `buildExportJson(env)` 和 `buildSwitchJson(oldEnv, newEnv)` 函数
2. `exportCommand` 和 `switchCommand` 支持 `--json` 参数透传
3. `init.ts` 的 hook 重构：新增 `claude-profile export --current --json` 解析路径
4. hook 中使用可信方式解析 JSON（如 `node -e "..."` 或 `jq` 检测）
5. `tests/` 中新增 hook JSON 路径的测试
6. `npm run build` 与 `npm test` 全部通过

---

# Workflow & DoD (Definition of Done)
为了确保代码质量，本任务必须严格遵循以下质量内循环，直至代码审查（CR）完全通过：

1. 🧪 【初步自测】
   - 开发者完成编码后，必须针对「交付物标准」进行本地功能自测或编写单元测试。

2. 🔍 【提交代码审查 (CR)】
   - 发起 Pull Request (PR) / Merge Request (MR)，邀请核心团队成员进行代码评审，并完整记录 CR 反馈意见。

3. 🛠️ 【修复 CR 意见 (Fix CR)】
   - 针对评审中发现的性能、安全、规范等问题逐项修复，禁止遗漏任何一条 blocking 意见。

4. 🔄 【回归测试】
   - 对修复后的代码再次进行本地回归测试，确保没有引入新的破坏性变更（Regression Bug）。

5. 🏁 【流程终止与提交条件】
   - **准出条件（DoD）**：只有当所有 CR 意见全部闭环、Reviewer 给出 Approved 状态，且回归测试 100% 通过时，方可执行最后一步。
   - **最终操作**：将代码正式 Commit 并合并至主分支，更新任务状态为“已完成”。

---

### FEAT-002: Profile 校验与导入修复

---

**[任务编号与名称]**
TASK-003: [校验] 实现统一 profile/env 校验层与 import 覆盖逻辑修复

**[任务描述]**
在 `src/utils/validation.ts` 中实现统一的 profile 校验层：`validateProfileName(name)` 使用 `^[a-zA-Z0-9-_]+$` 正则（与交互式创建保持一致）；`validateEnvKey(key)` 复用 TASK-001 的 `isValidEnvKey`；`validateEnvValue(value)` 检查类型为 string 且不含 null 字节。在 `src/commands/import.ts` 中修复覆盖逻辑：将现有条件 `profileService.profileExists(profileName) && profileName !== parsed.name` 改为 `profileService.profileExists(profileName) && !input.force`，确保任何同名导入都需要 `--force` 才能覆盖。在 `createCommand`、`editCommand`、`importFileCommand` 的入口统一调用该校验层，拒绝非法 key/value 进入 profile。

**[前置依赖]**
TASK-001

**[参考文档]**
- `docs/roadmap/claude-profile-gap-deep-analysis-2026-05-24.md` §2.3
- `src/commands/import.ts`
- `src/ui/prompt.ts` (inputProfileName 校验规则)

**[交付物标准]**
1. `src/utils/validation.ts` 新增 `validateProfileName`、`validateEnvKey`、`validateEnvValue`、`validateProfile(profile, mode)`
2. `src/commands/import.ts` 覆盖逻辑修复，新增 `--force` 参数解析
3. `src/commands/create.ts` 和 `src/commands/edit.ts` 在保存前调用 `validateProfile`
4. `tests/validation.test.ts` 新增恶意 key、非法字符、空值测试
5. `tests/` 中新增 import 覆盖逻辑的测试（带/不带 `--force`）
6. `npm run build` 与 `npm test` 全部通过

---

# Workflow & DoD (Definition of Done)
为了确保代码质量，本任务必须严格遵循以下质量内循环，直至代码审查（CR）完全通过：

1. 🧪 【初步自测】
   - 开发者完成编码后，必须针对「交付物标准」进行本地功能自测或编写单元测试。

2. 🔍 【提交代码审查 (CR)】
   - 发起 Pull Request (PR) / Merge Request (MR)，邀请核心团队成员进行代码评审，并完整记录 CR 反馈意见。

3. 🛠️ 【修复 CR 意见 (Fix CR)】
   - 针对评审中发现的性能、安全、规范等问题逐项修复，禁止遗漏任何一条 blocking 意见。

4. 🔄 【回归测试】
   - 对修复后的代码再次进行本地回归测试，确保没有引入新的破坏性变更（Regression Bug）。

5. 🏁 【流程终止与提交条件】
   - **准出条件（DoD）**：只有当所有 CR 意见全部闭环、Reviewer 给出 Approved 状态，且回归测试 100% 通过时，方可执行最后一步。
   - **最终操作**：将代码正式 Commit 并合并至主分支，更新任务状态为“已完成”。

---

### FEAT-003: Config 安全加固

---

**[任务编号与名称]**
TASK-004: [安全] 配置文件目录/文件权限加固与 validate 扩展

**[任务描述]**
修改 `src/config/fileSystemConfigStore.ts`：在 `ensureConfigDir()` 的 `mkdirSync` 调用中增加 `mode: 0o700` 参数；在 `saveProfile()` 的 `writeFileSync` 调用中使用 `{ encoding: 'utf-8', mode: 0o600 }` 选项。同时修改 `src/commands/validate.ts`：新增对 profile 文件权限的检查逻辑，扫描 `~/.config/claude-profile/` 下所有 `.json` 文件，若发现权限不是 `0o600` 或目录权限不是 `0o700`，输出 warning；新增 shell-safety 检查，遍历每个 profile 的 env key/value，若存在非法 key 或未转义风险字符，输出 error。

**[前置依赖]**
TASK-001

**[参考文档]**
- `docs/roadmap/claude-profile-gap-deep-analysis-2026-05-24.md` §2.4
- `src/config/fileSystemConfigStore.ts`
- `src/commands/validate.ts`

**[交付物标准]**
1. `fileSystemConfigStore.ts` 中 `mkdirSync` 和 `writeFileSync` 增加 mode 参数
2. `validate.ts` 新增权限检查函数和 shell-safety 检查函数
3. `validate.ts` 的输出格式支持展示权限和 safety issue
4. `tests/` 中新增权限相关测试（mock fs.statSync）
5. `npm run build` 与 `npm test` 全部通过

---

# Workflow & DoD (Definition of Done)
为了确保代码质量，本任务必须严格遵循以下质量内循环，直至代码审查（CR）完全通过：

1. 🧪 【初步自测】
   - 开发者完成编码后，必须针对「交付物标准」进行本地功能自测或编写单元测试。

2. 🔍 【提交代码审查 (CR)】
   - 发起 Pull Request (PR) / Merge Request (MR)，邀请核心团队成员进行代码评审，并完整记录 CR 反馈意见。

3. 🛠️ 【修复 CR 意见 (Fix CR)】
   - 针对评审中发现的性能、安全、规范等问题逐项修复，禁止遗漏任何一条 blocking 意见。

4. 🔄 【回归测试】
   - 对修复后的代码再次进行本地回归测试，确保没有引入新的破坏性变更（Regression Bug）。

5. 🏁 【流程终止与提交条件】
   - **准出条件（DoD）**：只有当所有 CR 意见全部闭环、Reviewer 给出 Approved 状态，且回归测试 100% 通过时，方可执行最后一步。
   - **最终操作**：将代码正式 Commit 并合并至主分支，更新任务状态为“已完成”。

---

### FEAT-004: Switch 语义与同步修复

---

**[任务编号与名称]**
TASK-005: [修复] 统一 switch 同步语义、交互式同步修复与 README 修正

**[任务描述]**
修改 `bin/claude-profile.js` 中 switch 命令的参数解析逻辑：将默认行为改为 `syncToSettings = !args.includes('--no-sync')`（即默认同步）。修改 `src/commands/switch.ts`：在 `switchCommandInteractive` 中始终传递 `syncToSettings: true`（或通过顶层参数透传）。修改 `switchCommand` 的默认参数，使 `syncToSettings` 默认为 `true`。同步更新 `README.md`：将 "两种方式都会自动应用环境变量并同步到 Claude Code settings" 的表述下方增加 `--no-sync` 的说明，确保文档与实际代码行为一致。

**[前置依赖]**
无

**[参考文档]**
- `docs/roadmap/claude-profile-gap-deep-analysis-2026-05-24.md` §2.2
- `bin/claude-profile.js`
- `src/commands/switch.ts`
- `README.md`

**[交付物标准]**
1. `bin/claude-profile.js` 中 switch 命令默认 sync，支持 `--no-sync`
2. `src/commands/switch.ts` 中 `switchCommandInteractive` 传递 `syncToSettings: true`
3. `README.md` 更新 switch 命令说明，明确默认同步行为与 `--no-sync` 选项
4. `tests/commands.test.ts` 或新建 `tests/switch.test.ts` 验证默认 sync 和 `--no-sync` 行为
5. `npm run build` 与 `npm test` 全部通过

---

# Workflow & DoD (Definition of Done)
为了确保代码质量，本任务必须严格遵循以下质量内循环，直至代码审查（CR）完全通过：

1. 🧪 【初步自测】
   - 开发者完成编码后，必须针对「交付物标准」进行本地功能自测或编写单元测试。

2. 🔍 【提交代码审查 (CR)】
   - 发起 Pull Request (PR) / Merge Request (MR)，邀请核心团队成员进行代码评审，并完整记录 CR 反馈意见。

3. 🛠️ 【修复 CR 意见 (Fix CR)】
   - 针对评审中发现的性能、安全、规范等问题逐项修复，禁止遗漏任何一条 blocking 意见。

4. 🔄 【回归测试】
   - 对修复后的代码再次进行本地回归测试，确保没有引入新的破坏性变更（Regression Bug）。

5. 🏁 【流程终止与提交条件】
   - **准出条件（DoD）**：只有当所有 CR 意见全部闭环、Reviewer 给出 Approved 状态，且回归测试 100% 通过时，方可执行最后一步。
   - **最终操作**：将代码正式 Commit 并合并至主分支，更新任务状态为“已完成”。

---

### FEAT-005: Settings 同步增强

---

**[任务编号与名称]**
TASK-006: [功能] 实现 settings scope 支持与 ClaudeSettingsStore 路径动态化

**[任务描述]**
重构 `src/config/claudeSettingsStore.ts`：将 `ClaudeSettingsStoreImpl` 的 filePath 从固定 `~/.claude/settings.json` 改为通过 scope 参数动态解析。实现 `resolveSettingsPath(scope)` 函数：`'user'` 映射到 `~/.claude/settings.json`，`'project'` 映射到 `<cwd>/.claude/settings.json`，`'local'` 映射到 `<cwd>/.claude/settings.local.json`。修改 `bin/claude-profile.js` 在 switch/sync 命令中解析 `--scope` 参数并透传。确保 `writeEnv` 在写入前不覆盖已有的非 env 字段（现有行为已满足，需验证）。

**[前置依赖]**
TASK-005

**[参考文档]**
- `docs/roadmap/claude-code-session-env-switching-gap-analysis-2026-05-24.md` §3.4
- `src/config/claudeSettingsStore.ts`
- `src/services/settingsSyncService.ts`

**[交付物标准]**
1. `claudeSettingsStore.ts` 支持通过 scope 或 filePath 构造函数参数
2. 新增 `resolveSettingsPath(scope, cwd?)` 工具函数
3. `settingsSyncService.ts` 的 `syncOnSwitch` 支持 `scope` 选项
4. `bin/claude-profile.js` 解析 `--scope user|project|local` 并透传
5. `tests/claudeSettingsStore.test.ts` 新增 scope 路径解析测试
6. `npm run build` 与 `npm test` 全部通过

---

# Workflow & DoD (Definition of Done)
为了确保代码质量，本任务必须严格遵循以下质量内循环，直至代码审查（CR）完全通过：

1. 🧪 【初步自测】
   - 开发者完成编码后，必须针对「交付物标准」进行本地功能自测或编写单元测试。

2. 🔍 【提交代码审查 (CR)】
   - 发起 Pull Request (PR) / Merge Request (MR)，邀请核心团队成员进行代码评审，并完整记录 CR 反馈意见。

3. 🛠️ 【修复 CR 意见 (Fix CR)】
   - 针对评审中发现的性能、安全、规范等问题逐项修复，禁止遗漏任何一条 blocking 意见。

4. 🔄 【回归测试】
   - 对修复后的代码再次进行本地回归测试，确保没有引入新的破坏性变更（Regression Bug）。

5. 🏁 【流程终止与提交条件】
   - **准出条件（DoD）**：只有当所有 CR 意见全部闭环、Reviewer 给出 Approved 状态，且回归测试 100% 通过时，方可执行最后一步。
   - **最终操作**：将代码正式 Commit 并合并至主分支，更新任务状态为“已完成”。

---

**[任务编号与名称]**
TASK-007: [功能] 实现 doctor / status / sync 独立命令

**[任务描述]**
实现三个新命令：
1. `status`：显示当前 shell 中的 `ANTHROPIC_*` 环境变量、当前激活的 profile、`.current` 文件指向、settings.json（各 scope）中的 env 摘要。
2. `doctor`：深度诊断，检查 shell env 与 profile 是否一致、settings 是否过期、hook 是否加载、文件权限是否安全、当前目录是否 git repo、关键路径是否存在。输出带建议的诊疗报告。
3. `sync`：独立的 `claude-profile sync <profile> [--scope]` 命令，允许不显式 switch 而仅将指定 profile 的 env 写入 settings。

**[前置依赖]**
TASK-006

**[参考文档]**
- `docs/roadmap/claude-code-session-env-switching-gap-analysis-2026-05-24.md` §5.1, §5.2
- `src/commands/validate.ts`（参考诊断输出格式）
- `src/services/settingsSyncService.ts`

**[交付物标准]**
1. 新建 `src/commands/status.ts`，实现 `statusCommand()`
2. 新建 `src/commands/doctor.ts`，实现 `doctorCommand()`，包含至少 8 项检查
3. 新建 `src/commands/sync.ts`，实现 `syncCommand()`
4. `bin/claude-profile.js` 注册 `status`、`doctor`、`sync` 命令及参数解析
5. `tests/` 中为三个命令编写单元测试
6. `npm run build` 与 `npm test` 全部通过

---

# Workflow & DoD (Definition of Done)
为了确保代码质量，本任务必须严格遵循以下质量内循环，直至代码审查（CR）完全通过：

1. 🧪 【初步自测】
   - 开发者完成编码后，必须针对「交付物标准」进行本地功能自测或编写单元测试。

2. 🔍 【提交代码审查 (CR)】
   - 发起 Pull Request (PR) / Merge Request (MR)，邀请核心团队成员进行代码评审，并完整记录 CR 反馈意见。

3. 🛠️ 【修复 CR 意见 (Fix CR)】
   - 针对评审中发现的性能、安全、规范等问题逐项修复，禁止遗漏任何一条 blocking 意见。

4. 🔄 【回归测试】
   - 对修复后的代码再次进行本地回归测试，确保没有引入新的破坏性变更（Regression Bug）。

5. 🏁 【流程终止与提交条件】
   - **准出条件（DoD）**：只有当所有 CR 意见全部闭环、Reviewer 给出 Approved 状态，且回归测试 100% 通过时，方可执行最后一步。
   - **最终操作**：将代码正式 Commit 并合并至主分支，更新任务状态为“已完成”。

---

**[任务编号与名称]**
TASK-008: [功能] 实现 --dry-run 与 diff preview，修正 computeSettingsEnv 删除语义

**[任务描述]**
在 `switch`、`sync`、`import`、`restore` 命令中支持 `--dry-run` 参数：当启用时，执行完整逻辑但不执行实际的文件写入（settings.json、profile 保存、restore 解压）。实现 diff preview 功能：在写入 settings.json 前，计算新旧 env 的差异（新增、修改、删除的 key），以表格或结构化格式输出预览。同时修正 `src/engine/settingsSync.ts` 中的 `computeSettingsEnv`：将 "oldValue 存在且 newValue 不存在则 delete" 的激进语义改为 "仅覆盖 newEnv 中显式设置的 key，未设置的 managed key 保持 settings.json 中现有值"。

**[前置依赖]**
TASK-006

**[参考文档]**
- `docs/roadmap/claude-profile-gap-deep-analysis-2026-05-24.md` §2.6
- `src/engine/settingsSync.ts`
- `src/services/settingsSyncService.ts`

**[交付物标准]**
1. `switchCommand`、`syncCommand`、`importFileCommand`、`restoreCommand` 支持 `dryRun` 选项
2. `settingsSyncService.ts` 的 `syncOnSwitch` 支持 `dryRun`，并返回 diff 对象
3. `computeSettingsEnv` 修正删除语义，不再主动 delete 未设置的 managed key
4. 新增 diff preview presenter 函数，展示增删改
5. `tests/settingsSync.test.ts` 更新测试用例验证新语义
6. `npm run build` 与 `npm test` 全部通过

---

# Workflow & DoD (Definition of Done)
为了确保代码质量，本任务必须严格遵循以下质量内循环，直至代码审查（CR）完全通过：

1. 🧪 【初步自测】
   - 开发者完成编码后，必须针对「交付物标准」进行本地功能自测或编写单元测试。

2. 🔍 【提交代码审查 (CR)】
   - 发起 Pull Request (PR) / Merge Request (MR)，邀请核心团队成员进行代码评审，并完整记录 CR 反馈意见。

3. 🛠️ 【修复 CR 意见 (Fix CR)】
   - 针对评审中发现的性能、安全、规范等问题逐项修复，禁止遗漏任何一条 blocking 意见。

4. 🔄 【回归测试】
   - 对修复后的代码再次进行本地回归测试，确保没有引入新的破坏性变更（Regression Bug）。

5. 🏁 【流程终止与提交条件】
   - **准出条件（DoD）**：只有当所有 CR 意见全部闭环、Reviewer 给出 Approved 状态，且回归测试 100% 通过时，方可执行最后一步。
   - **最终操作**：将代码正式 Commit 并合并至主分支，更新任务状态为“已完成”。

---

### FEAT-006: Backup/Restore 安全重构

---

**[任务编号与名称]**
TASK-009: [安全] 迁移 backup/restore 到 node-tar 并增加 tar entry 路径校验

**[任务描述]**
移除 `src/commands/backup.ts` 中对系统 `tar` 命令的 `execSync` 调用，引入 `node-tar`（`tar` npm 包）作为依赖。使用 `tar.create()` 替代 `execSync('tar -czf ...')`，使用 `tar.extract()` 替代 `execSync('tar -xzf ...')`。在 extract 时通过 `filter` 选项校验每个 entry：禁止绝对路径（以 `/` 开头）、禁止路径穿越（包含 `..`）、禁止 symlink 和 hardlink（`entry.type` 检查）。确保备份和恢复的测试覆盖上述安全场景。

**[前置依赖]**
无

**[参考文档]**
- `docs/roadmap/claude-profile-gap-deep-analysis-2026-05-24.md` §2.5
- `src/commands/backup.ts`
- npm `tar` package documentation

**[交付物标准]**
1. `package.json` 新增 `tar` 依赖（检查是否已存在）
2. `backup.ts` 中 `createTarGz` 和 `extractTarGz` 替换为 `tar` 库 API
3. extract 时实现 `validateTarEntry(entry): boolean` 校验函数
4. `tests/` 中新增 tar 路径穿越测试（`../evil.json`、`/etc/passwd`、symlink）
5. `npm run build` 与 `npm test` 全部通过

---

# Workflow & DoD (Definition of Done)
为了确保代码质量，本任务必须严格遵循以下质量内循环，直至代码审查（CR）完全通过：

1. 🧪 【初步自测】
   - 开发者完成编码后，必须针对「交付物标准」进行本地功能自测或编写单元测试。

2. 🔍 【提交代码审查 (CR)】
   - 发起 Pull Request (PR) / Merge Request (MR)，邀请核心团队成员进行代码评审，并完整记录 CR 反馈意见。

3. 🛠️ 【修复 CR 意见 (Fix CR)】
   - 针对评审中发现的性能、安全、规范等问题逐项修复，禁止遗漏任何一条 blocking 意见。

4. 🔄 【回归测试】
   - 对修复后的代码再次进行本地回归测试，确保没有引入新的破坏性变更（Regression Bug）。

5. 🏁 【流程终止与提交条件】
   - **准出条件（DoD）**：只有当所有 CR 意见全部闭环、Reviewer 给出 Approved 状态，且回归测试 100% 通过时，方可执行最后一步。
   - **最终操作**：将代码正式 Commit 并合并至主分支，更新任务状态为“已完成”。

---

### FEAT-007: 子进程运行模式

---

**[任务编号与名称]**
TASK-010: [功能] 实现 run/exec 子进程命令

**[任务描述]**
实现 `claude-profile run <profile> -- <command...>` 命令：读取指定 profile 的 env，使用 `child_process.spawn` 启动子进程，将 profile env 注入到子进程环境变量中。默认继承父进程 env，支持 `--no-inherit-env` 选项（仅注入 profile 变量）。支持 `--print-env` 选项（打印将要注入的 env 而不执行命令）。正确透传子进程的 exit code。实现 `exec` 作为 `run` 的别名（或独立命令，行为一致）。该模式不依赖 shell hook 的 eval，是最安全的单次隔离运行方式。

**[前置依赖]**
TASK-001, TASK-003

**[参考文档]**
- `docs/roadmap/claude-code-session-env-switching-gap-analysis-2026-05-24.md` §3.1
- `src/commands/runner.ts`（参考 runCommand 包装模式）
- Node.js `child_process.spawn` API

**[交付物标准]**
1. 新建 `src/commands/run.ts`，实现 `runCommand(input)` 和 `execCommand(input)`
2. 支持 `--no-inherit-env` 和 `--print-env` 选项
3. 子进程 exit code 正确透传到父进程
4. `bin/claude-profile.js` 注册 `run` 和 `exec` 命令
5. `tests/run.test.ts` 编写单元测试（mock child_process）
6. `npm run build` 与 `npm test` 全部通过

---

# Workflow & DoD (Definition of Done)
为了确保代码质量，本任务必须严格遵循以下质量内循环，直至代码审查（CR）完全通过：

1. 🧪 【初步自测】
   - 开发者完成编码后，必须针对「交付物标准」进行本地功能自测或编写单元测试。

2. 🔍 【提交代码审查 (CR)】
   - 发起 Pull Request (PR) / Merge Request (MR)，邀请核心团队成员进行代码评审，并完整记录 CR 反馈意见。

3. 🛠️ 【修复 CR 意见 (Fix CR)】
   - 针对评审中发现的性能、安全、规范等问题逐项修复，禁止遗漏任何一条 blocking 意见。

4. 🔄 【回归测试】
   - 对修复后的代码再次进行本地回归测试，确保没有引入新的破坏性变更（Regression Bug）。

5. 🏁 【流程终止与提交条件】
   - **准出条件（DoD）**：只有当所有 CR 意见全部闭环、Reviewer 给出 Approved 状态，且回归测试 100% 通过时，方可执行最后一步。
   - **最终操作**：将代码正式 Commit 并合并至主分支，更新任务状态为“已完成”。

---

### FEAT-008: 可观测性与机器消费

---

**[任务编号与名称]**
TASK-011: [功能] 全局 --json / --plain 输出格式支持

**[任务描述]**
在 `list`、`validate`、`doctor`、`status`、`export` 命令中统一支持 `--json` 和 `--plain` 全局选项。`--json` 输出结构化 JSON（适合脚本消费）；`--plain` 输出无 ANSI 转义序列的纯文本（适合日志记录）。重构 presenter 层：将现有的 `envPresenter` 中的格式化逻辑分离为 "数据准备" 和 "渲染" 两个阶段，使 `--json` 模式可以直接返回数据对象而非渲染后的字符串。修改 `bin/claude-profile.js` 在全局选项中解析 `--json` 和 `--plain` 并透传给所有命令。

**[前置依赖]**
TASK-002, TASK-007

**[参考文档]**
- `docs/roadmap/claude-code-session-env-switching-gap-analysis-2026-05-24.md` §8.4
- `src/presenters/envPresenter.ts`
- `bin/claude-profile.js`

**[交付物标准]**
1. `bin/claude-profile.js` 全局解析 `--json` 和 `--plain`，存入 `globalOptions`
2. 各 presenter 方法支持纯数据返回路径
3. `listCommand`、`validateCommand`、`doctorCommand`、`statusCommand`、`exportCommand` 在 `--json` 时返回 JSON 字符串
4. `tests/` 中为 `--json` 模式编写测试
5. `npm run build` 与 `npm test` 全部通过

---

# Workflow & DoD (Definition of Done)
为了确保代码质量，本任务必须严格遵循以下质量内循环，直至代码审查（CR）完全通过：

1. 🧪 【初步自测】
   - 开发者完成编码后，必须针对「交付物标准」进行本地功能自测或编写单元测试。

2. 🔍 【提交代码审查 (CR)】
   - 发起 Pull Request (PR) / Merge Request (MR)，邀请核心团队成员进行代码评审，并完整记录 CR 反馈意见。

3. 🛠️ 【修复 CR 意见 (Fix CR)】
   - 针对评审中发现的性能、安全、规范等问题逐项修复，禁止遗漏任何一条 blocking 意见。

4. 🔄 【回归测试】
   - 对修复后的代码再次进行本地回归测试，确保没有引入新的破坏性变更（Regression Bug）。

5. 🏁 【流程终止与提交条件】
   - **准出条件（DoD）**：只有当所有 CR 意见全部闭环、Reviewer 给出 Approved 状态，且回归测试 100% 通过时，方可执行最后一步。
   - **最终操作**：将代码正式 Commit 并合并至主分支，更新任务状态为“已完成”。

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| `shellQuote` | `value="'; rm -rf /; '"` | `'\''; rm -rf /; '\''` | Yes — injection attempt |
| `isValidEnvKey` | `key="FOO_BAR"` | `true` | No |
| `isValidEnvKey` | `key="FOO-BAR"` | `false` | Yes — hyphen not POSIX |
| `buildExportCommands` | env with malicious value | Safely quoted export lines | Yes |
| `buildSwitchCommands` | oldEnv has key not in newEnv | `unset KEY;` for removed key | No |
| `importFileCommand` | existing profile, no `--force` | `ProfileAlreadyExistsError` | Yes |
| `importFileCommand` | existing profile, with `--force` | Overwrites successfully | Yes |
| `fileSystemConfigStore.saveProfile` | any profile | File created with mode 0o600 | Yes |
| `computeSettingsEnv` | newEnv missing a managed key | Key preserved from settings | Yes — semantic change |
| `doctorCommand` | missing hook | Warning about hook not loaded | No |
| `tar.extract` | entry with `../` | Entry skipped, error thrown | Yes — path traversal |
| `runCommand` | `--print-env` flag | Prints env without spawning | Yes |

### Edge Cases Checklist
- [ ] Empty profile name
- [ ] Profile name with shell metacharacters
- [ ] Env value with single quote, double quote, backtick, `$()`, newline
- [ ] Env key starting with digit
- [ ] Import JSON with missing `env` field
- [ ] Settings.json corrupted (invalid JSON)
- [ ] Concurrent profile writes
- [ ] `--dry-run` on all mutating commands
- [ ] `--scope project` in non-git directory
- [ ] `run` command with non-existent profile

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
EXPECT: All tests pass (existing + new)

### Full Test Suite
```bash
npm run build && npm run test
```
EXPECT: Build succeeds, no regressions

### Shell Completion Syntax Check
```bash
node bin/claude-profile.js completion bash | bash -n
node bin/claude-profile.js completion zsh | zsh -n
node bin/claude-profile.js completion fish | fish -n
```
EXPECT: No syntax errors (for bash/zsh/fish)

### Manual Validation
- [ ] `claude-profile switch minimax` syncs to settings.json by default
- [ ] `claude-profile switch minimax --no-sync` does not sync
- [ ] `claude-profile switch` (interactive) syncs to settings.json
- [ ] `claude-profile import test.json` fails if profile exists without `--force`
- [ ] `claude-profile import test.json --force` overwrites existing
- [ ] `claude-profile export --current --json` outputs valid JSON
- [ ] `claude-profile doctor` reports accurate status
- [ ] `claude-profile run minimax -- printenv ANTHROPIC_BASE_URL` shows correct URL
- [ ] Backup and restore round-trip works
- [ ] `~/.config/claude-profile/*.json` permissions are 0o600

---

## Acceptance Criteria
- [ ] All 11 tasks completed
- [ ] All validation commands pass
- [ ] Security tests written and passing (shell injection, path traversal, permissions)
- [ ] No type errors
- [ ] No lint errors
- [ ] README.md updated to reflect actual behavior
- [ ] `npm audit --omit=dev` still reports 0 vulnerabilities

## Completion Checklist
- [ ] Code follows discovered patterns (camelCase services, PascalCase types, `runCommand` wrapper)
- [ ] Error handling matches codebase style (`AppError` subclasses, `CommandResult` union)
- [ ] Tests follow test patterns (vitest, `.js` imports, `tests/` directory)
- [ ] No hardcoded values (use constants for regex patterns)
- [ ] Documentation updated (README.md, inline comments for non-obvious logic)
- [ ] No unnecessary scope additions (keychain, fish hook, provider registry excluded)
- [ ] Self-contained — no questions needed during implementation

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `--json` hook requires `node` or `jq` in PATH | Medium | High — hook fails on minimal systems | Graceful fallback to string mode with strict quoting |
| Default sync=true breaks scripts relying on no-sync | Medium | Medium — CI scripts may break | Document breaking change in README, mention `--no-sync` |
| `node-tar` dependency increases bundle size | Low | Low | `tar` is widely used, well-maintained, tree-shakeable |
| Settings scope `project` requires git repo detection | Medium | Medium | Use `process.cwd()` if not in git repo, document behavior |
| `computeSettingsEnv` semantic change surprises users | Low | Medium | Document in README that unset keys are now preserved |

## Notes
- The codebase uses `.js` suffix in TypeScript imports (e.g., `from '../types/index.js'`). All new imports must follow this convention.
- `bin/claude-profile.js` imports from `../dist/commands/*.js` — any new command file must be built before the CLI can use it.
- The `runCommand` wrapper in `src/commands/runner.ts` automatically catches exceptions and converts them to `CommandResult`. Use it for all new commands.
- When adding new CLI flags to `bin/claude-profile.js`, remember the argument parsing is manual (no commander/yargs). Use `args.includes('--flag')` or `getArgValue()` helper.
- For tests that involve singletons (e.g., `profileService`), create fresh instances in `beforeEach` to avoid test pollution.
