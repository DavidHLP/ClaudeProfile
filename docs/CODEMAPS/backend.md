# Backend (CLI Commands & Services)

<!-- Generated: 2026-05-18 | Files scanned: 26 | Token estimate: ~500 -->

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
| `export [name] --current` | `exportCommand()` / `exportCurrentCommand()` | Shell export statements |
| `init` | `initCommand()` | Shell hook eval script |

## Key Files

| File | Lines | Responsibility |
|------|-------|----------------|
| `commands/runner.ts` | ~20 | Error wrapping for command results |
| `services/profileService.ts` | ~95 | Profile CRUD, current/previous tracking |
| `config/fileSystemConfigStore.ts` | ~100 | File I/O for `~/.config/claude-profile/` |
| `config/configStore.ts` | ~13 | ConfigStore interface |
| `engine/settingsSync.ts` | ~32 | Compute env diff for settings.json |
| `presenters/envPresenter.ts` | ~175 | ANSI table rendering, success/error formatting |

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
