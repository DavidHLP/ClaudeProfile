# Architecture

<!-- Generated: 2026-05-24 | Files scanned: 44 | Token estimate: ~800 -->

## Overview

CLI tool for managing multiple Claude Code API configurations (Profiles).

```
┌─────────────────────────────────────────────────────────────┐
│                     bin/claude-profile.js                  │
│                   (CLI entry point, ~208 lines)            │
└────────────────────────────┬────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ create command  │ │ switch command  │ │   list command  │
│ edit command    │ │ delete command  │ │ export command  │
│ init command    │ │ import command  │ │ backup command  │
│ rename command  │ │ duplicate cmd   │ │ validate command│
│ completion cmd  │ │ runner.ts       │ │                 │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             ▼
              ┌──────────────────────────┐
              │   ProfileServiceImpl     │
              │   (business logic, ~160 ln)│
              └────────────┬─────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ ConfigStore   │  │ FileSystem      │  │ InMemory        │
│ (interface)   │  │ ConfigStore     │  │ ConfigStore     │
└───────────────┘  └─────────────────┘  └─────────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │  ~/.config/claude-profile/│
              │  (profiles + .current)   │
              └──────────────────────────┘
```

## Key Domains

| Domain | Files | Purpose |
|--------|-------|---------|
| **Profile** | `types/index.ts`, `services/profileService.ts` | Named API config management |
| **Provider Templates** | `templates/providers.ts`, `templates/providerRegistry.ts` | Built-in + dynamic provider presets |
| **Env Template** | `templates/envTemplate/` | Variable interpolation engine for provider envs |
| **Shell Hook** | `engine/activation.ts`, `commands/init.ts` | Eval Bridge pattern for env injection |
| **Settings Sync** | `engine/settingsSync.ts`, `services/settingsSyncService.ts`, `config/claudeSettingsStore.ts` | Sync to `~/.claude/settings.json` |
| **Plugin System** | `plugins/` | Lifecycle hooks (activate/deactivate/profile-switch) |
| **UI/Presenter** | `presenters/envPresenter.ts`, `ui/theme.ts`, `ui/prompt.ts` | ANSI table rendering with inquirer |
| **Utilities** | `utils/connectivity.ts`, `utils/validation.ts` | Connectivity checks, input validation |

## Data Flow

1. **CLI invocation** → `bin/claude-profile.js` parses args
2. **Command execution** → `commands/*.ts` (14 command modules)
3. **Business logic** → `ProfileServiceImpl` validates and manages profiles
4. **Persistence** → `FileSystemConfigStore` reads/writes `~/.config/claude-profile/`
5. **Shell activation** → `init` command outputs eval-bridge script for parent shell
6. **Settings sync** → `SettingsSyncService` updates `~/.claude/settings.json` on switch

## Error Handling

Custom error hierarchy in `errors.ts`:
- `AppError` (base)
- `ProfileNotFoundError`, `ProfileAlreadyExistsError`
- `FileOperationError`, `ConfigDirectoryError`, `SettingsFileCorruptError`

## Entry Points

| File | Purpose |
|------|---------|
| `bin/claude-profile.js` | CLI entry point (~208 lines) |
| `src/index.ts` | Library exports (~50 lines) |
| `dist/` | Compiled output (TypeScript → JS) |
