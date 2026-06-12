---
name: cli-shell-completion-generation
description: "TS/JS CLI 生成 bash/zsh/fish 补全脚本:用 \\${var} 转义 shell 变量,bash -n 验证语法,toContain 测试模式"
user-invocable: false
origin: auto-extracted
---

# CLI Shell Completion 脚本生成模式

**Extracted:** 2026-05-18
**Context:** 给 TypeScript/JavaScript CLI 添加 bash/zsh/fish 自动补全,通过 `mycli completion <shell>` 输出到 stdout,由用户 source 或安装到补全目录

## Problem

实现 `mycli completion <shell>` 时,需要在 JS 字符串中嵌入完整的 shell 脚本。核心难点:

1. **变量插值冲突**: 模板字符串中的 `${COMP_WORDS}` 会被 JS 当成插值表达式,导致 bash 变量在生成时被替换为 `undefined`
2. **三种 shell 语法完全不通用**: bash 的 `complete -F`、zsh 的 `_describe`、fish 的 `complete -c -n` 互不兼容
3. **动态补全**: profile 名、文件列表等数据必须在脚本运行时读取,不能在生成时硬编码
4. **测试不能真正执行 shell**: 在 vitest 等环境中无法依赖 bash/zsh 可用

## Solution

### 1. 变量逃逸规则(最易踩坑)

在 JS 模板字符串中:

```typescript
// ✓ JS 端要插入的值:不转义
const commands = COMMANDS.join(' ');
return `commands="${commands}"`;     // → commands="cmd1 cmd2"

// ✓ Shell 自己的运行时变量:用 \${var} 防 JS 插值
return `
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
`;
```

记忆法: **`${...}` 给 JS,`\${...}` 给 shell**。任何写在反引号字符串里、希望保留到运行时的 `$VAR` 都必须 `\$VAR`。

### 2. 三种 shell 的最小骨架

**Bash** — `complete -F func cmd`:

```typescript
function generateBashCompletion(commands: string): string {
  return `_mycli_completion() {
    local cur="\${COMP_WORDS[COMP_CWORD]}"
    COMPREPLY=( $(compgen -W "${commands}" -- "\${cur}") )
}
complete -F _mycli_completion mycli`;
}
```

**Zsh** — 必须以 `#compdef` 开头(并非真正注释,是补全系统的指令):

```typescript
function generateZshCompletion(items: {name: string; desc: string}[]): string {
  const desc = items.map(c => `        '${c.name}:${c.desc}'`).join('\n');
  return `#compdef mycli
_mycli() {
  local -a commands
  commands=(
${desc}
  )
  _describe -t commands 'mycli commands' commands
}
_mycli "$@"`;
}
```

**Fish** — 每个命令一行 `complete -c`:

```typescript
function generateFishCompletion(items: {name: string; desc: string}[]): string {
  return items
    .map(c => `complete -c mycli -n '__fish_use_subcommand' -a '${c.name}' -d '${c.desc}'`)
    .join('\n');
}
```

### 3. 动态补全(运行时读取)

把 shell 命令嵌入生成的脚本中,让 shell 自己执行:

```bash
# Bash 片段(在 JS 中写作)
local profiles=$(ls -1 "\${HOME}/.config/mycli" 2>/dev/null | sed 's/\\.json$//')
COMPREPLY=( $(compgen -W "\${profiles}" -- "\${cur}") )
```

注意 `\${HOME}`、`\\.json` 的双层转义:JS 转一层,bash 再转一层。

### 4. 测试与验证

**单元测试:用 `toContain` 检查关键模式,不实际执行 shell**:

```typescript
it('should generate bash completion', async () => {
  const result = await completionCommand({ shell: 'bash' });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.output).toContain('_mycli_completion');
    expect(result.output).toContain('complete -F');
  }
});
```

**命令行:`bash -n` 验证语法,无输出即通过**:

```bash
node bin/mycli.js completion bash | bash -n   # 静默 = OK
node bin/mycli.js completion zsh  | zsh -n    # 同理
# fish 无 -n,只能用 fish -c "source -"
```

### 5. 安装文档嵌入

每个脚本顶部嵌入安装说明,让用户一眼能用:

```bash
# 临时启用: source <(mycli completion bash)
# 永久启用: mycli completion bash | sudo tee /etc/bash_completion.d/mycli
```

## When to Use

- 给 TS/JS CLI 加 shell completion
- 看到生成的 bash 脚本中变量被替换成 `undefined`(忘了 `\${...}`)
- 看到 zsh 报 `command not found: #compdef`(忘了首行,或 zsh 配置 fpath 未生效)
- 需要在补全中读取动态数据(配置名、文件名、远端列表)
- 想给 completion 写测试但不想依赖宿主 shell

## Related

- 参考实现: ClaudeProfile `src/commands/completion.ts`
- bash: `man complete`, `man compgen`
- zsh: `man zshcompsys`(_describe / _arguments 等)
- fish: <https://fishshell.com/docs/current/completions.html>
