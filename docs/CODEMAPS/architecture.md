# Architecture

<!-- Generated: 2026-05-18 | Files scanned: 26 | Token estimate: ~600 -->

## Overview

CLI tool for managing multiple Claude Code API configurations (Profiles).

```
┌─────────────────────────────────────────────────────────────┐
│                     bin/claude-profile.js                  │
│                   (CLI entry point, ~90 lines)             │
└────────────────────────────┬────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  create command │ │  switch command │ │   list command  │
│  edit command   │ │  delete command │ │  export command │
│  init command   │ │  runner.ts      │ │                 │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             ▼
              ┌──────────────────────────┐
              │   ProfileServiceImpl     │
              │   (business logic, ~95 ln)│
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
| **Provider Templates** | `templates/providers.ts` | Built-in provider presets (MiniMax, Kimi, Aliyun, Volcano) |
| **Shell Hook** | `engine/activation.ts`, `commands/init.ts` | Eval Bridge pattern for env injection |
| **Settings Sync** | `engine/settingsSync.ts`, `services/settingsSyncService.ts` | Sync to `~/.claude/settings.json` |
| **UI/Presenter** | `presenters/envPresenter.ts`, `ui/theme.ts` | ANSI table rendering with inquirer |

## Data Flow

1. **CLI invocation** → `bin/claude-profile.js` parses args
2. **Command execution** → `commands/*.ts` (create/switch/list/edit/delete/export/init)
3. **Business logic** → `ProfileServiceImpl` validates and manages profiles
4. **Persistence** → `FileSystemConfigStore` reads/writes `~/.config/claude-profile/`
5. **Shell activation** → `init` command outputs eval-bridge script for parent shell

## Error Handling

Custom error hierarchy in `errors.ts`:
- `AppError` (base)
- `ProfileNotFoundError`, `ProfileAlreadyExistsError`
- `FileOperationError`, `ConfigDirectoryError`, `SettingsFileCorruptError`

## Entry Points

| File | Purpose |
|------|---------|
| `bin/claude-profile.js` | CLI entry point (~90 lines) |
| `src/index.ts` | Library exports (~27 lines) |
| `dist/` | Compiled output (TypeScript → JS) |
