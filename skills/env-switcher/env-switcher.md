# Claude Code 环境切换器 (env-switcher)

通过 Linux 会话级别的环境变量切换不同的 Claude Code 配置。

## 功能

- 快速切换不同的 API 配置（如 MiniMax 和 Anthropic 官方）
- 支持创建、编辑、删除配置文件
- 会话级别环境变量注入，无需修改 `settings.json`

## 命令

### env-switch

切换到指定的环境配置。

```bash
env-switch <profile-name>
```

**示例:**
```bash
env-switch minimax    # 切换到 MiniMax 配置
env-switch anthropic  # 切换到 Anthropic 官方配置
```

### env-status

查看当前环境配置状态。

```bash
env-status
```

显示:
- 当前激活的配置名称
- 当前会话的环境变量值
- 所有可用的配置文件列表

### env-profile

管理环境配置文件。

```bash
env-profile <command> [args]
```

**子命令:**

| 命令 | 说明 |
|------|------|
| `list` | 列出所有可用配置 |
| `create <name>` | 创建新配置 |
| `delete <name>` | 删除配置 |
| `edit <name>` | 编辑配置 |
| `show <name>` | 显示配置详情 |

**示例:**
```bash
env-profile list                    # 列出所有配置
env-profile create myconfig         # 创建名为 myconfig 的配置
env-profile edit myconfig           # 编辑配置
env-profile delete myconfig         # 删除配置
```

## 配置文件格式

配置文件存储在 `~/project/C-Link/env-profiles/` 目录，使用 JSON 格式:

```json
{
  "name": "minimax",
  "description": "MiniMax API 配置",
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.minimaxi.com/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-token-here",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "MiniMax-M2.7-highspeed",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "MiniMax-M2.7-highspeed",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "MiniMax-M2.7-highspeed"
  }
}
```

## 工作原理

1. 配置文件存储在 `~/project/C-Link/env-profiles/*.json`
2. `env-switch` 读取目标配置文件的 `env` 字段
3. 使用 `export` 命令设置会话级环境变量
4. Claude Code 读取当前会话的环境变量

## 注意事项

- 配置变更仅在当前会话有效
- 不会修改 `~/.claude/settings.json`
- Token 以明文存储，请注意文件权限
- 新建配置后需要使用 `env-switch` 激活

## 目录结构

```
~/.claude/
├── env-profiles/
│   ├── .current          # 当前配置名称
│   ├── minimax.json      # MiniMax 配置
│   └── anthropic.json    # Anthropic 配置
└── skills/
    └── env-switcher/
        ├── manifest.json
        ├── env-switcher.md
        └── bin/
            ├── env-switch
            ├── env-status
            └── env-profile
```
