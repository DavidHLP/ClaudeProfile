# ClaudeProfile

Claude Code 配置文件管理器 - 交互式管理多 API 配置

## 功能

- 交互式创建、编辑、删除 API 配置
- 支持多个 Provider: MiniMax、Kimi (Moonshot)、阿里云百炼、火山引擎、讯飞星辰等
- 密码式 Token 输入，安全可靠
- 无缝切换环境变量，一条命令完成配置
- **自动同步到 Claude Code settings.json**（支持 VSCode 和 Zed 扩展）

## 安装

### 从 npm 安装（全局）

```bash
npm install -g @claude-code/claude-profile
```

### 本地开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 运行测试
npm test

# 链接到全局（开发时）
npm link
```

## 快速开始

### 1. 初始化 Shell Hook（只需一次）

```bash
echo 'source <(claude-profile init)' >> ~/.bashrc
source ~/.bashrc
```

### 2. 创建配置

```bash
claude-profile create
```

交互式引导：
1. 选择 API Provider
2. 输入配置名称
3. 输入 API Token（密码隐藏）
4. 确认/修改 API URL
5. 确认/修改默认模型

### 3. 切换配置

```bash
# 交互式选择（需要终端环境）
claude-profile switch

# 直接指定配置
claude-profile switch minimax
```

两种方式都会自动应用环境变量并同步到 Claude Code settings！

## 使用方法

### 创建新配置

```bash
claude-profile create
```

### 切换配置

```bash
# 交互式选择（仅在终端中可用）
claude-profile switch

# 直接指定配置
claude-profile switch minimax
```

### 列出所有配置

```bash
claude-profile list
```

### 编辑配置

```bash
claude-profile edit
```

### 删除配置

```bash
claude-profile delete
```

### 导出配置

```bash
# 导出指定配置
claude-profile export minimax

# 导出当前配置
claude-profile export --current

# 导出到文件（JSON/YAML）
claude-profile export minimax --file --yaml --output ./minimax.yaml
```

### 导入配置

```bash
# 从文件导入
claude-profile import ./profile.json

# 指定名称导入 YAML
claude-profile import ./profile.yaml --name my-profile
```

### 重命名配置

```bash
claude-profile rename old-name new-name
```

### 复制配置

```bash
claude-profile duplicate source-name new-name
```

### 备份与恢复

```bash
# 备份所有配置
claude-profile backup ./backup.tar.gz

# 恢复配置
claude-profile restore ./backup.tar.gz
```

### 验证配置

```bash
# 验证所有配置完整性
claude-profile validate

# 显示详细信息
claude-profile validate --verbose
```

### Shell 自动补全

```bash
# Bash
claude-profile completion bash > /etc/bash_completion.d/claude-profile

# Zsh
claude-profile completion zsh > /usr/local/share/zsh/site-functions/_claude-profile

# Fish
claude-profile completion fish > ~/.config/fish/completions/claude-profile.fish
```

## Claude Code 集成

切换配置时会自动同步以下环境变量到 `~/.claude/settings.json`：

| 环境变量 | 说明 |
|---------|------|
| `ANTHROPIC_BASE_URL` | API 基础地址 |
| `ANTHROPIC_AUTH_TOKEN` | API 认证 Token |
| `ANTHROPIC_MODEL` | 默认模型 |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Sonnet 模型 |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Opus 模型 |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Haiku 模型 |
| `CLAUDE_CODE_SUBAGENT_MODEL` | 子代理模型 |

这使得 claude-profile 可以同时管理：
- **Shell 环境变量**：用于 CLI 中的 API 调用
- **Claude Code 设置**：用于 VSCode/Zed 中的 Claude Code 扩展

## 工作原理

Shell hook 会在你的 shell 中创建一个 `claude-profile` 函数，拦截 `switch` 命令并自动 `eval` 导出的环境变量。

- `claude-profile switch <profile>` - 直接切换，自动应用环境变量
- `claude-profile switch` - 交互式选择（仅在终端环境中可用）

## 配置文件

### 存储位置

- **Profiles**: `~/.config/claude-profile/`
- **Claude Code settings**: `~/.claude/settings.json`

### 配置文件格式

```json
{
  "name": "minimax",
  "description": "MiniMax",
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.minimaxi.com/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-token",
    "ANTHROPIC_MODEL": "MiniMax-M2.7",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "MiniMax-M2.7",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "MiniMax-M2.7",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "MiniMax-M2.7",
    "CLAUDE_CODE_SUBAGENT_MODEL": "MiniMax-M2.7"
  }
}
```

## 更新 Shell Hook

如果更新了 claude-profile 后遇到问题，重新加载 shell hook：

```bash
source <(claude-profile init)
```
