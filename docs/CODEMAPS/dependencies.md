# Dependencies & Integrations

<!-- Generated: 2026-05-18 | Files scanned: 26 | Token estimate: ~300 -->

## External Services

| Service | Config Location | Purpose |
|---------|-----------------|---------|
| Claude Code settings | `~/.claude/settings.json` | API credentials, model selection |
| Profile configs | `~/.config/claude-profile/` | Named profile storage |

## Third-Party Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `inquirer` | ^9.2.0 | Interactive CLI prompts |

## Dev Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | Type checking and compilation |
| `vitest` | Unit testing framework |
| `@types/inquirer` | TypeScript types for inquirer |
| `@types/node` | Node.js type definitions |

## Managed Settings Keys

These env vars are synced between profile and Claude Code settings:

```
ANTHROPIC_BASE_URL
ANTHROPIC_AUTH_TOKEN
ANTHROPIC_DEFAULT_HAIKU_MODEL
ANTHROPIC_DEFAULT_SONNET_MODEL
ANTHROPIC_DEFAULT_OPUS_MODEL
ANTHROPIC_MODEL
CLAUDE_CODE_SUBAGENT_MODEL
```

## Provider Templates

| ID | Name | Default Base URL |
|----|------|------------------|
| `minimax` | MiniMax | `https://api.minimaxi.com/anthropic` |
| `kimi` | Kimi (Moonshot) | `https://api.kimi.com/coding/` |
| `aliyun` | 阿里云百炼 | `https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic` |
| `volcano` | 火山引擎 | `https://ark.cn-beijing.volces.com/api/coding` |
| `custom` | 自定义 | (empty) |
