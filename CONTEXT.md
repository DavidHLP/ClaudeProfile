# ClaudeProfile

Claude Code 的多 API 配置管理工具，通过命名 Profile 在不同 AI 提供商之间快速切换。

## Language

**Profile**:
一个命名的 API 配置集合，包含 base URL、auth token、model 名称等。
_Avoid_: Environment, 配置环境

**Active Profile**:
当前生效的 Profile，决定了 shell 中实际使用的 API 端点和凭证。
_Avoid_: Current environment, 当前环境

**Provider**:
一个 AI API 服务商，如 MiniMax、Kimi、Anthropic。
_Avoid_: 供应商, 服务商（作为领域术语时）

**Provider Template**:
内置的 Provider 预设配置，包含默认 base URL、默认 model 和 env 字段模板。是创建 Profile 的快捷方式。
_Avoid_: Provider preset, 预设配置

**Shell Hook**:
`init` 命令输出的 shell 脚本，注入到 `~/.bashrc` / `~/.zshrc` 中，拦截命令并调用 Eval Bridge。
_Avoid_: Shell wrapper, shell 函数包装器

**Eval Bridge**:
Shell Hook 内部的模式：子进程输出 `export KEY=VALUE` 语句，父 shell 通过 `eval` 执行，从而绕过子进程无法修改父进程环境的限制。
_Avoid_: eval 机制, export 桥接

**Env Mapping**:
Profile 中定义的那组 key-value 对，将被 Eval Bridge 注入到 shell 环境中。
_Avoid_: 环境变量, env 字段, env 配置

**Unactivated**:
尚未 Activate 任何 Profile 的状态，此时 shell 中没有通过本工具注入的 Env Mapping。这是合法的初始状态，不是错误。
_Avoid_: 默认状态, 未初始化

**Config Store**:
持久化存储所有 Profile 和 Active Profile 标记的位置（`~/.config/claude-profile/`）。
_Avoid_: 配置目录, config directory, profileService

## Relationships

- 一个 **Profile** 可基于某个 **Provider Template** 创建，也可完全自定义
- 同一 **Provider** 可对应多个 **Profile**（如不同账号、不同 model 组合）
- 任意时刻有且仅有一个 **Active Profile**
- **Activate** 某个 Profile 后，该 Profile 成为 **Active Profile**
- `switch` 命令是 **Activate** 的用户界面
- **Shell Hook** 使用 **Eval Bridge** 实现 **Activate**
- **Activate** 一个 **Profile** 后，其 **Env Mapping** 被注入当前 shell
- 初始状态为 **Unactivated**，**Activate** 后变为有 Active Profile 的状态
- **Activate** 新 Profile 时，旧 Active Profile 独有的 Env Mapping key 必须被 `unset`，避免残留
- 所有 **Profile** 和 **Active Profile** 标记持久化在 **Config Store** 中

## Example dialogue

> **Dev:** "我从 minimax 切换到 kimi，但 shell 里 `API_TIMEOUT_MS` 还在。"
> **Domain expert:** "那是因为 Activate kimi 时没有 unset 旧 Profile 独有的 Env Mapping key。Activate 新 Profile 必须清理残留。"

> **Dev:** "我能基于 MiniMax 创建两个 Profile 吗？一个用 Haiku 一个用 Opus。"
> **Domain expert:** "可以。同一个 Provider 可以有多个 Profile，它们的 Env Mapping 不同。"

## Flagged ambiguities

- "Environment" 曾被用于同时指代 Profile 和运行时状态 — 已解决：**Profile** 是存储概念，**Active Profile** 是运行时状态。
- "Provider" 曾被混用于指代 Provider 和 Provider Template — 已解决：**Provider** 是现实世界的服务商，**Provider Template** 是工具内置的预设。
