# Backend (CLI Commands & Services)

<!-- Generated: 2026-05-24 | Files scanned: 44 | Token estimate: ~600 -->

## Command Routing

```
CLI args → bin/claude-profile.js → commands/*.ts → ProfileService → ConfigStore
```

| Command | Handler | Output |
|---------|---------|--------|
| `create` | `createCommandInteractive()` | Profile creation form |
| `switch [name]` | `switchCommand()` / `switchCommandInteractive()` | Shell eval script |
| `list` | `listCommand()` | ANSI table of profiles |
| `edit` | `editCommandInteractive()` | Profile edit form |
| `delete [name]` | `deleteCommand()` / `deleteCommandInteractive()` | Confirmation + delete |
| `rename` | `renameCommand()` / `renameCommandInteractive()` | Rename profile |
| `duplicate` | `duplicateCommand()` / `duplicateCommandInteractive()` | Copy profile |
| `export` | `exportCommand()` / `exportCurrentCommand()` / `exportFileCommand()` | Shell export statements / JSON / YAML file |
| `import` | `importFileCommand()` / `importFileCommandInteractive()` | Import from JSON / YAML |
| `backup` | `backupCommand()` | tar.gz archive of all profiles |
| `restore` | `restoreCommand()` / `restoreCommandInteractive()` | Restore from backup archive |
| `init` | `initCommand()` | Shell hook eval script |
| `validate` | `validateCommand()` | Config integrity check |
| `completion` | `completionCommand()` | bash/zsh/fish completion script |

## Key Files

| File | Lines | Responsibility |
|------|-------|----------------|
| `commands/runner.ts` | ~20 | Error wrapping for command results |
| `services/profileService.ts` | ~160 | Profile CRUD, current/previous tracking |
| `config/fileSystemConfigStore.ts` | ~100 | File I/O for `~/.config/claude-profile/` |
| `config/configStore.ts` | ~13 | ConfigStore interface |
| `config/claudeSettingsStore.ts` | ~50 | Read/write `~/.claude/settings.json` |
| `engine/settingsSync.ts` | ~32 | Compute env diff for settings.json |
| `engine/activation.ts` | ~30 | Shell activation script generation |
| `presenters/envPresenter.ts` | ~175 | ANSI table rendering, success/error formatting |
| `templates/providerRegistry.ts` | ~77 | Dynamic provider registration / override |
| `plugins/manager.ts` | ~80 | Plugin lifecycle (register/unregister/hooks) |
| `templates/envTemplate/engine.ts` | ~60 | Variable interpolation for env templates |

## ConfigStore Interface

```typescript
interface ConfigStore {
  listProfiles(): Profile[];
  getProfile(name: string): Profile | null;
  saveProfile(profile: Profile): void;
  deleteProfile(name: string): boolean;
  getCurrentProfile(): string | null;
  setCurrentProfile(name: string): void;
  getPreviousProfile(): string | null;
  setPreviousProfile(name: string | null): void;
  getStoreLocation(): string | null;
}
```

## File System Layout

```
~/.config/claude-profile/
├── .current      (active profile name)
├── .current-prev (previous profile name)
├── minimax.json  (profile data)
├── kimi.json
└── ...
```

## Profile Schema

```typescript
interface Profile {
  name: string;
  description: string;
  env: EnvConfig;  // ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, etc.
}
```
