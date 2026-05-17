# C-Link

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

## Architecture

CLI tool for managing multiple AI API configurations (Profiles). Key domains:
- **Profile**: Named API config (base URL, auth token, model)
- **Provider Template**: Built-in provider presets
- **Shell Hook**: Eval Bridge pattern to inject env vars into parent shell
- **Config Store**: `~/.config/env-switcher/`

Source layout: `src/{commands,config,engine,presenters,services,templates,types,ui}`

## Claude Code Settings Sync

- `settingsSyncService` syncs profile env vars to `~/.claude/settings.json`
- Works with both VSCode and Zed Claude Code extensions
- `MANAGED_SETTINGS_KEYS` in `src/engine/settingsSync.ts` defines synced keys:
  - `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`
  - `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_{HAIKU,SONNET,OPUS}_MODEL`
  - `CLAUDE_CODE_SUBAGENT_MODEL`

## Config Locations

- Profiles: `~/.config/env-switcher/`
- Claude Code settings: `~/.claude/settings.json`
