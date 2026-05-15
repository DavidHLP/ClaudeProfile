# Plan: Claude Code 环境切换器 (env-switcher)

## Summary

创建一个 Claude Code 技能，允许用户通过 Linux 会话级别的环境变量自由切换不同的 Claude Code 配置（如 API endpoint、认证令牌、默认模型等）。

## User Story

作为 Claude Code 用户，我希望能够快速切换不同的环境配置（如在 MiniMax API 和 Anthropic 官方 API 之间切换），以便根据需求选择不同的后端服务。

## Problem → Solution

**当前状态**：环境变量硬编码在 `~/.claude/settings.json` 中，切换需要手动编辑文件。

**期望状态**：通过简单的命令（如 `/env-switch minimax` 或 `/env-switch anthropic`）在会话级别切换环境配置。

---

## Metadata

- **Complexity**: Small
- **Source PRD**: N/A (free-form feature request)
- **Estimated Files**: 5 files
- **Language**: 中文

---

## UX Design

### Before

```
用户需要:
1. 打开 ~/.claude/settings.json
2. 手动修改 env 中的配置
3. 重启 Claude Code 才能生效
```

### After

```
用户只需:
1. 输入 /env-switch minimax  (切换到 MiniMax 配置)
2. 输入 /env-switch anthropic (切换到 Anthropic 官方配置)
3. 环境变量立即在当前会话生效
```

### Interaction Changes

| Touchpoint | Before | After |
|---|---|---|
| 切换 API endpoint | 编辑 settings.json | `/env-switch <profile>` |
| 切换 API token | 编辑 settings.json | `/env-switch <profile>` |
| 切换默认模型 | 编辑 settings.json | `/env-switch <profile>` |
| 查看当前配置 | 手动检查 | `/env-status` |
| 创建新配置 | 手动编辑 JSON | `/env-profile create <name>` |

---

## Architecture

### 目录结构

```
~/.claude/env-profiles/
├── .current                    # 当前激活的配置名称
├── minimax.json               # MiniMax 配置
├── anthropic.json             # Anthropic 官方配置
└── custom.json                # 用户自定义配置

~/.claude/skills/env-switcher/  # 技能目录
├── manifest.json              # 技能元数据
├── env-switcher.md           # 技能说明文档
└── bin/
    ├── env-switch            # 主切换脚本
    ├── env-status            # 状态查看脚本
    ├── env-profile           # 配置管理脚本
    └── env-activate          # 激活配置的脚本
```

### Profile JSON 结构

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

### Linux Session 级别注入原理

1. 使用 `export` 命令在当前 shell 会话中设置环境变量
2. Claude Code 读取当前会话的环境变量
3. 配置变更立即生效，无需重启

---

## Files to Create

| File | Action | Justification |
|---|---|---|
| `~/.claude/env-profiles/minimax.json` | CREATE | 默认 MiniMax 配置 |
| `~/.claude/env-profiles/anthropic.json` | CREATE | 默认 Anthropic 官方配置 |
| `~/.claude/env-profiles/.current` | CREATE | 跟踪当前配置 |
| `~/.claude/skills/env-switcher/manifest.json` | CREATE | 技能元数据 |
| `~/.claude/skills/env-switcher/env-switcher.md` | CREATE | 技能使用文档 |
| `~/.claude/skills/env-switcher/bin/env-switch` | CREATE | 主切换脚本 |
| `~/.claude/skills/env-switcher/bin/env-status` | CREATE | 状态查看脚本 |
| `~/.claude/skills/env-switcher/bin/env-profile` | CREATE | 配置管理脚本 |

---

## NOT Building

- 不实现永久写入 `settings.json`（只做会话级别切换）
- 不实现多设备同步功能
- 不实现配置加密（token 明文存储）

---

## Step-by-Step Tasks

### Task 1: 创建目录结构

- **ACTION**: 创建必要的目录和初始文件
- **IMPLEMENT**:
  ```bash
  mkdir -p ~/.claude/env-profiles
  mkdir -p ~/.claude/skills/env-switcher/bin
  ```
- **VALIDATE**: 目录创建成功

### Task 2: 创建环境配置示例

- **ACTION**: 创建 `minimax.json` 和 `anthropic.json` 示例配置
- **IMPLEMENT**: 从当前 settings.json 的 env 字段提取
- **MIRROR**: settings.json 的 env 结构
- **VALIDATE**: JSON 格式正确

### Task 3: 创建 manifest.json

- **ACTION**: 定义技能元数据
- **IMPLEMENT**: 包含 name, description, commands, version
- **MIRROR**: 其他 Claude Code 技能的 manifest 格式

### Task 4: 创建 env-switch 脚本

- **ACTION**: 实现环境切换的核心逻辑
- **IMPLEMENT**:
  1. 读取目标 profile JSON
  2. 使用 `export` 设置环境变量
  3. 更新 `~/.claude/env-profiles/.current`
- **VALIDATE**: 切换后 `env | grep ANTHROPIC` 显示新值

### Task 5: 创建 env-status 脚本

- **ACTION**: 显示当前配置状态
- **IMPLEMENT**: 读取 .current 并显示对应配置文件内容
- **VALIDATE**: 显示当前激活的配置名称和关键变量

### Task 6: 创建 env-profile 脚本

- **ACTION**: 提供配置管理功能
- **IMPLEMENT**:
  - `list`: 列出所有可用配置
  - `create`: 创建新配置
  - `delete`: 删除配置
  - `edit`: 编辑现有配置
- **VALIDATE**: 各子命令正常工作

### Task 7: 创建技能文档

- **ACTION**: 编写 `env-switcher.md` 使用说明
- **IMPLEMENT**: 包含所有命令的使用示例
- **VALIDATE**: 文档完整清晰

---

## Testing Strategy

### Manual Tests

| Test | Command | Expected Result |
|---|---|---|
| 查看状态 | `/env-status` | 显示当前配置名称 |
| 切换配置 | `/env-switch anthropic` | 环境变量更新 |
| 验证切换 | `echo $ANTHROPIC_BASE_URL` | 显示新 URL |
| 列出配置 | `/env-profile list` | 显示所有可用配置 |

### Edge Cases Checklist

- [ ] 切换到不存在的配置时报错
- [ ] 当前配置被删除时的处理
- [ ] 无配置时的默认行为

---

## Validation Commands

```bash
# 验证环境变量已设置
env | grep ANTHROPIC

# 验证当前配置
cat ~/.claude/env-profiles/.current

# 验证配置列表
ls -la ~/.claude/env-profiles/*.json
```

---

## Acceptance Criteria

- [ ] 可以通过 `/env-switch <profile>` 切换配置
- [ ] 切换后环境变量立即生效
- [ ] 可以通过 `/env-status` 查看当前配置
- [ ] 可以通过 `/env-profile list` 列出所有配置
- [ ] 可以通过 `/env-profile create` 创建新配置
- [ ] 错误处理完善（配置不存在等）
- [ ] 文档清晰完整

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Token 明文存储 | Low | High | 提醒用户注意文件权限 |
| 配置损坏导致 Claude Code 无法启动 | Low | High | 提供恢复默认配置的方法 |

---

## Notes

- 当前 session 中的环境变量通过 Claude Code 启动时加载
- 切换配置只在当前 session 有效，不会持久化到 settings.json
- 建议配合 shell alias 使用以便快速切换
