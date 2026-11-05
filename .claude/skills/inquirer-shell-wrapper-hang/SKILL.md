---
name: inquirer-shell-wrapper-hang
description: "Inquirer.js interactive prompts hang when CLI is invoked through a shell function wrapper; fix with TTY check + eval bridge"
user-invocable: false
origin: auto-extracted
---

# Inquirer.js Hangs in Shell Function Wrapper

**Extracted:** 2026-05-16
**Context:** Building a CLI tool (env-switcher) that uses inquirer.js for interactive selection, wrapped in a shell function so it can `eval` environment variable exports into the parent shell.

## Problem
When a Node.js CLI using inquirer.js is invoked through a bash/zsh function wrapper, interactive prompts (list, checkbox) hang or freeze. The user sees the prompt UI but cannot interact — arrow keys and Enter are swallowed.

Root cause: The shell function redirects stdin/stdout in ways that break inquirer's raw-mode TTY detection. When `$bin switch` runs inside a function, inquirer may not get a proper TTY handle.

## Solution
1. **TTY guard** — In the shell function, check `[ -t 0 ]` before invoking interactive mode:
   ```bash
   if [ -t 0 ]; then
     $bin switch  # runs inquirer interactive
     # After selection, fetch and apply env vars
     export_output="$($bin export --current 2>&1)"
     eval "$export_output"
   else
     echo "错误: 交互式切换需要在终端中运行" >&2
     return 1
   fi
   ```

2. **Eval bridge pattern** — The CLI itself cannot modify the parent shell's environment. Instead:
   - CLI outputs `export KEY=VALUE` strings (via a dedicated `export` subcommand)
   - Shell function captures the output with `$(...)` and runs `eval "$output"`
   - This separates interactive selection (inquirer) from env application (eval)

3. **Two-phase design** — Split the command into:
   - Interactive phase: `switch` (uses inquirer, writes current profile to config file)
   - Export phase: `export --current` (reads config, outputs shell export statements)

## When to Use
- Building CLI tools with inquirer.js that need to modify parent shell env vars
- When a shell function wrapper is needed to `eval` CLI output into the calling shell
- Any time interactive prompts freeze when called from inside a bash/zsh function
