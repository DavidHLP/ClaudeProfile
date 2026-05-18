# ClaudeProfile

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
- **Critical:** Global CLI reads from `dist/`. Always run `npm run build` after modifying `src/` or the installed `claude-profile` will execute stale code.

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
- **npm link workaround** — If `npm link` succeeds but the command isn't found, npm prefix may be redirected (e.g. Zed). Manually symlink: `ln -sf /home/david/project/C-Link/bin/claude-profile.js ~/.local/bin/claude-profile && chmod +x ~/.local/bin/claude-profile`

## Source Layout

```
src/
├── commands/     → CLI commands (create, switch, list, edit, delete, export, init)
├── config/       → ConfigStore interface + FileSystemConfigStore implementation
├── engine/       → Core logic (settingsSync, activation)
├── presenters/   → UI output formatting (ANSI tables, env export)
├── services/     → Business services (ProfileService, SettingsSyncService)
├── templates/    → Provider templates (MiniMax, Kimi, Aliyun, Volcano)
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
