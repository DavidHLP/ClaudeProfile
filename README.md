# Claude Code Env Switcher

通过 Linux 会话级别的环境变量快速切换 Claude Code 的 API 配置。

## 功能特性

- 支持多套配置快速切换（如 MiniMax API / Anthropic 官方 API）
- 会话级别环境变量注入，无需修改 `~/.claude/settings.json`
- 配置文件采用 JSON 格式，易于编辑和版本控制
- 支持创建、编辑、删除配置

## 目录结构

```
C-Link/
├── env-profiles/              # 配置文件目录
│   ├── minimax.json           # MiniMax API 配置
│   ├── anthropic.json         # Anthropic 官方配置
│   └── .current               # 当前激活的配置名称
├── skills/
│   └── env-switcher/          # 技能包
│       ├── manifest.json      # 技能元数据
│       ├── README.md         # 本文档
│       └── bin/              # 可执行脚本
│           ├── env-switch    # 切换配置
│           ├── env-status    # 查看状态
│           └── env-profile   # 配置管理
└── README.md
```

## 环境要求

- Linux / macOS / WSL
- Bash 4.0+
- Python 3.6+（用于 JSON 解析）
- Claude Code 已安装并配置

## 快速开始

### 1. 初始化符号链接

```bash
# 创建符号链接（一次性操作）
mkdir -p ~/bin
ln -sf ~/project/C-Link/skills/env-switcher/bin/env-switch ~/bin/env-switch
ln -sf ~/project/C-Link/skills/env-switcher/bin/env-status ~/bin/env-status
ln -sf ~/project/C-Link/skills/env-switcher/bin/env-profile ~/bin/env-profile

# 添加到 PATH（添加到 ~/.bashrc 或 ~/.zshrc）
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### 2. 查看当前状态

```bash
env-status
```

输出示例：
```
=== Claude Code 环境配置状态 ===

当前配置: minimax

当前会话环境变量:
  ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic
  ANTHROPIC_AUTH_TOKEN=<已设置>
  ...

可用配置文件:
   * minimax - MiniMax API 配置
     anthropic - Anthropic 官方 API 配置
```

### 3. 切换配置

```bash
# 切换到 minimax 配置
eval $(env-switch minimax)

# 切换到 anthropic 配置
eval $(env-switch anthropic)

# 验证切换结果
echo $ANTHROPIC_BASE_URL
```

**重要**：`env-switch` 必须配合 `eval` 使用，否则环境变量无法在当前会话生效。

### 4. 管理配置

```bash
# 列出所有配置
env-profile list

# 创建新配置
env-profile create myconfig

# 编辑配置
env-profile edit myconfig

# 查看配置详情
env-profile show myconfig

# 删除配置
env-profile delete myconfig
```

## 配置格式

配置文件位于 `env-profiles/` 目录，使用 JSON 格式：

```json
{
  "name": "minimax",
  "description": "MiniMax API 配置",
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.minimaxi.com/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-api-token-here",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "MiniMax-M2.7-highspeed",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "MiniMax-M2.7-highspeed",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "MiniMax-M2.7-highspeed"
  }
}
```

### 可配置的环境变量

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `ANTHROPIC_BASE_URL` | API 端点 | `https://api.anthropic.com` |
| `ANTHROPIC_AUTH_TOKEN` | 认证令牌 | `sk-...` |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | 默认 Sonnet 模型 | `claude-sonnet-4-20250514` |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | 默认 Opus 模型 | `claude-opus-4-20250514` |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | 默认 Haiku 模型 | `claude-haiku-4-20250514` |

## 简化使用

### 选项 1：使用 alias

在 `~/.bashrc` 中添加：

```bash
alias envs='eval $(env-switch)'
alias envs-minimax='eval $(env-switch minimax)'
alias envs-anthropic='eval $(env-switch anthropic)'
```

然后只需运行：
```bash
envs minimax    # 切换到 minimax
envs anthropic  # 切换到 anthropic
```

### 选项 2：创建便捷脚本

```bash
# ~/bin/minimax
#!/bin/bash
eval $(env-switch minimax)

# ~/bin/anthropic
#!/bin/bash
eval $(env-switch anthropic)
```

## 注意事项

1. **会话级别**：配置变更仅在当前终端会话有效，关闭终端后需要重新切换

2. **Token 安全**：API Token 以明文存储在 JSON 文件中，请确保文件权限正确：
   ```bash
   chmod 600 ~/project/C-Link/env-profiles/*.json
   ```

3. **Claude Code 重启**：切换配置后可能需要重启 Claude Code 才能生效

4. **多设备同步**：配置文件可以提交到 Git，适合多设备同步（注意不要提交 Token）

## 故障排除

### 命令未找到

```bash
# 检查 PATH
echo $PATH | grep -q ~/bin && echo "PATH 正确" || echo "PATH 缺失"

# 检查符号链接
ls -la ~/bin/env-switch
```

### 环境变量未生效

```bash
# 确认使用 eval
eval $(env-switch minimax)

# 检查当前值
echo $ANTHROPIC_BASE_URL
```

### Claude Code 仍使用旧配置

Claude Code 在启动时读取 `~/.claude/settings.json` 中的 env 字段。如果需要完全切换，需要在切换配置后**重启 Claude Code**。

## License

MIT
