# ClaudeProfile

## Project Authority

作为该项目的核心资深全栈工程师，你拥有完整的技术管理权与问题解决权。

### 职责与工作流

1. **主动诊断**：接手问题时，主动检索并分析运行日志，精准定位根源
2. **全局溯源**：跨文件追踪完整代码链路，不局限于局部代码
3. **自主决策**：修复或迭代时拥有完全自主设计权，自行决定技术方案与架构优化

### 约束条件

- **预判优先**：大规模代码修改或重启核心服务前，输出【诊断结论】与【行动计划】
- **稳态优先**：设计方案需兼顾系统整体稳定性和性能
- **闭环管理**：独立完成"发现问题 → 分析日志 → 修改代码 → 部署验证"的完整闭环

---

## Agent skills

### Issue tracker

Issues live in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the canonical triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.

## Build & Test

- Build: `npm run build` (tsc)
- Test: `npm run test` (vitest run)
- Test watch: `npm run test:watch`
- Type check: `npx tsc --noEmit`
- **Test files location**: All tests go in `tests/` directory (vitest config: `include: ['tests/**/*.test.ts']`)
- **Import syntax**: Use `.js` suffix in test imports even for TypeScript sources (e.g., `from '../src/templates/providerRegistry.js'`)
- **Test singletons**: When testing singleton instances (e.g., `providerRegistry`), create fresh instances in `beforeEach` to avoid test pollution

## Architecture

CLI tool for managing multiple AI API configurations (Profiles). Key domains:
- **Profile**: Named API config (base URL, auth token, model)
- **Provider Template**: Built-in provider presets
- **Shell Hook**: Eval Bridge pattern to inject env vars into parent shell
- **Config Store**: `~/.config/claude-profile/`

Source layout: `src/{commands,config,engine,presenters,services,templates,types,ui}`

## CLI UI Patterns

- Presenter layer uses raw ANSI escape codes (not chalk). `padEnd()` does not handle ANSI sequences — use a `stripAnsi` helper before computing visual padding.
- Avoid pairing a custom ANSI table with `inquirer` list prompts; this creates a "dual UI" where the table looks interactive but isn't. Either make the table itself interactive or embed all info into the inquirer choices.

## Claude Code Settings Sync

- `settingsSyncService` syncs profile env vars to `~/.claude/settings.json`
- Works with both VSCode and Zed Claude Code extensions
- `MANAGED_SETTINGS_KEYS` in `src/engine/settingsSync.ts` defines synced keys:
  - `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`
  - `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_{HAIKU,SONNET,OPUS}_MODEL`
  - `CLAUDE_CODE_SUBAGENT_MODEL`

## Config Locations

- Profiles: `~/.config/claude-profile/`
- Claude Code settings: `~/.claude/settings.json`

## Runtime Notes

- `claude-profile` is installed globally (`npm link` or `npm i -g`). It can be invoked from any directory, not just the repo root.
- **npm link workaround** — If `npm link` succeeds but the command isn't found, npm prefix may be redirected (e.g. Zed). Manually symlink: `ln -sf $(pwd)/bin/claude-profile.js ~/.local/bin/claude-profile && chmod +x ~/.local/bin/claude-profile`
- **调试 CLI**: 直接 `node bin/claude-profile.js <command>` 避开全局安装链路;改完 `src/` 必须 `npm run build`,因为 bin 引用 `dist/`
- **Shell completion 语法检查**: `node bin/claude-profile.js completion bash | bash -n`(无输出即通过)

## Command Implementation Patterns

- **CommandResult 守卫**: 测试与调用方访问 `result.output` 前必须用 `if (result.success)` 类型守卫;访问 `result.error` 前用 `if (!result.success)`。`CommandResult` 是 discriminated union,无守卫会触发 TS 报错
- **runCommand 包装器**: 所有命令实现包在 `runCommand('动作描述', async () => { ... })` 中,自动处理异常 → CommandResult
- **短路返回**: 在 runCommand 回调中用 `return { success: false as const, error: '...' }` 来短路(`as const` 必须,否则推断为 boolean 丢失 literal type)
- **全局选项解析**: bin/claude-profile.js 使用 `args.includes('--verbose')` 等数组判断,不引入 commander 等库

## Source Layout

```
src/
├── commands/     → CLI commands (create, switch, list, edit, delete, export, init)
├── config/       → ConfigStore interface + FileSystemConfigStore implementation
├── engine/       → Core logic (settingsSync, activation)
├── presenters/   → UI output formatting (ANSI tables, env export)
├── services/     → Business services (ProfileService, SettingsSyncService)
├── templates/    → Provider templates (MiniMax, Kimi, Aliyun, Volcano)
│                → Also: envTemplate/ (variable interpolation engine)
│                → Also: providerRegistry.ts (dynamic provider registration)
├── plugins/      → Plugin system (types, validator, loader, manager, discovery)
├── types/       → TypeScript type definitions
├── ui/          → Interactive prompts (inquirer wrappers)
├── errors.ts     → Custom error classes (AppError hierarchy)
└── index.ts     → Public API exports
```

## Request Lifecycle

1. `bin/claude-profile.js` parses CLI args, routes to command
2. Command calls `ProfileService` to read/write config
3. `ProfileService` uses `ConfigStore` (`FileSystemConfigStore`) to operate on `~/.config/claude-profile/`
4. `SettingsSyncService` syncs env vars to `~/.claude/settings.json` on switch
5. `envPresenter` formats output (TTY → table, non-TTY → shell export commands)

## Code Conventions

- **File naming**: camelCase (`fileSystemConfigStore.ts`)
- **Type naming**: PascalCase (`Profile`, `ConfigStore`)
- **Error handling**: Custom `AppError` subclasses + `CommandResult` type
- **Dependency injection**: `ProfileServiceImpl` constructor takes `ConfigStore`
- **UI output**: Presenter layer uses raw ANSI escape codes (not chalk)
- **Immutability**: Spread operator for object updates
