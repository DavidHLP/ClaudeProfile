/**
 * Shell-hook template renderers.
 *
 * The `init` command emits a bash script that the user `eval`s to wire up
 * the `claude-profile` shell function and the env-eval bridge. This module
 * owns the generation of that script.
 *
 * Before this module, the entire script was a single 100+ line array literal
 * inside `commands/init.ts`. Three concerns were fused behind one seam:
 *   1. Bin discovery (`_claude_profile_bin`) — which `claude-profile`
 *      executable to invoke at shell-function-call time
 *   2. The safe-eval bridge (`_claude_profile_safe_eval` /
 *      `_claude_profile_eval_json`) — the security boundary that gates what
 *      actually gets `eval`'d in the user's shell
 *   3. The dispatch function (`claude-profile`) — routing user input
 *      to the right CLI subcommand and feeding the result through the bridge
 *
 * Each is now a named, individually testable, individually substitutable
 * function. `renderShellHook` composes them.
 *
 * Implementation note: each renderer is built using array-of-lines +
 * `join('\n')` rather than template literals. This matches the original
 * `init.ts` shape exactly and avoids the JS-template-literal backslash
 * doubling that produced subtly-different bash strings during the
 * refactor's first attempt.
 *
 * Security note: the eval-bridge regex in `renderSafeEvalBridge` is the
 * most security-critical code in the project. Any loosening of it is an
 * attack-surface expansion. The snapshot test in `tests/shellHook.test.ts`
 * pins the current shape so reviewers can audit future diffs.
 */
import { baseEnvTemplate } from '../templates/baseEnvTemplate.js';
import { shellQuote, validateEnvKeyOrThrow } from '../utils/shellSafety.js';

/**
 * Render the `_claude_profile_bin` helper. Resolves the path to the
 * `claude-profile` executable with explicit precedence:
 *   1. `$CLAUDE_PROFILE_BIN` (explicit override)
 *   2. `type -p` (Bash builtin, preferred)
 *   3. `command -v` (POSIX, fallback)
 * Returns empty string if no binary is found.
 */
export function renderBinDiscovery(binName: string): string {
  const lines: string[] = [
    '_claude_profile_bin() {',
    '  if [ -n "$CLAUDE_PROFILE_BIN" ]; then',
    '    echo "$CLAUDE_PROFILE_BIN"',
    '    return',
    '  fi',
    '  local cmd',
    `  cmd="$( (unset -f ${binName} 2>/dev/null; type -p ${binName}) 2>/dev/null)"`,
    '  if [ -n "$cmd" ] && [ -x "$cmd" ]; then',
    '    echo "$cmd"',
    '    return',
    '  fi',
    `  cmd="$( (unset -f ${binName} 2>/dev/null; command -v ${binName}) 2>/dev/null)"`,
    '  if [ -n "$cmd" ] && [ -x "$cmd" ]; then',
    '    echo "$cmd"',
    '    return',
    '  fi',
    '    echo ""',
    '}',
  ];
  return lines.join('\n');
}

/**
 * Render the plain-text safe-eval bridge.
 *
 * Reads `export KEY='value';` and `unset KEY;` lines from stdin; the `case`
 * is the security boundary — anything that doesn't match one of the two
 * patterns is dropped with a warning to stderr. Eval the surviving lines.
 *
 * DO NOT loosen these patterns without an explicit security review.
 */
export function renderSafeEvalBridge(): string {
  const lines: string[] = [
    '_claude_profile_safe_eval() {',
    '  local line ok_lines=""',
    '  while IFS= read -r line; do',
    '    case "$line" in',
    '      "export "[A-Za-z_]*"="*"\'"*"\'"*) ok_lines="${ok_lines}${line%;};" ;;',
    '      "unset "[A-Za-z_]*) ok_lines="${ok_lines}${line%;};" ;;',
    '      *) echo "warning: skipping unsafe line: $line" >&2 ;;',
    '    esac',
    '  done',
    '  eval "$ok_lines"',
    '}',
  ];
  return lines.join('\n');
}

/**
 * Render the JSON-shape eval bridge. Consumes the `EnvJsonOutput` shape
 * produced by `engine/envDiff.ts#buildExportJson` / `buildSwitchJson`:
 *   { "set": { "KEY": "value" }, "unset": ["KEY2"] }
 *
 * Tries `jq` first, then `node` as a fallback. Returns non-zero exit if
 * neither is available — the caller is expected to surface that to the
 * user.
 */
export function renderJsonEvalBridge(): string {
  const lines: string[] = [
    '_claude_profile_eval_json() {',
    '  local json="$1"',
    '  if command -v jq >/dev/null 2>&1; then',
    '    local key val quoted',
    '    while IFS= read -r key; do',
    '      val="$(echo "$json" | jq -r ".set[\\"$key\\"]" 2>/dev/null)"',
    '      if [ "$val" != "null" ]; then',
    '        quoted="$(printf \'%s\\n\' "$val" | sed "s/\'/\'\\\\\'\'/g")"',
    '        export "$key=\'$quoted\'"',
    '      fi',
    '    done < <(echo "$json" | jq -r ".set | keys[]" 2>/dev/null)',
    '    while IFS= read -r key; do',
    '      if [ -n "$key" ] && [ "$key" != "null" ]; then',
    '        unset "$key"',
    '      fi',
    '    done < <(echo "$json" | jq -r ".unset[]" 2>/dev/null)',
    '  elif command -v node >/dev/null 2>&1; then',
    '    local line key val quoted',
    '    while IFS=$\'\\x01\' read -r key val; do',
    '      quoted="$(printf \'%s\\n\' "$val" | sed "s/\'/\'\\\\\'\'/g")"',
    '      export "$key=\'$quoted\'"',
    '    done < <(node -e "const d=JSON.parse(process.argv[1]);const sep=String.fromCharCode(1);for(const[k,v]of Object.entries(d.set||{}))console.log(k+sep+String(v));" "$json")',
    '    while IFS= read -r key; do',
    '      if [ -n "$key" ]; then',
    '        unset "$key"',
    '      fi',
    '    done < <(node -e "const d=JSON.parse(process.argv[1]);for(const k of(d.unset||[]))console.log(k);" "$json")',
    '  else',
    '    return 1',
    '  fi',
    '}',
  ];
  return lines.join('\n');
}

/**
 * Render the user-facing `claude-profile` shell function. Dispatches to the
 * discovered binary, with two notable sub-routings:
 *   - `switch <name>`   → calls `bin switch <name>`, feeds output through safe-eval
 *   - `switch` (no arg) → interactive mode; requires a TTY
 *   - `export --current` → emits env for the currently active profile
 *
 * Bin name is parameterized so the same renderer can produce fixtures for
 * other bin names (tests, future forks).
 */
export function renderDispatch(binName: string): string {
  const lines: string[] = [
    `${binName}() {`,
    '  local bin',
    '  if [ -n "$CLAUDE_PROFILE_BIN" ]; then',
    '    bin="$CLAUDE_PROFILE_BIN"',
    '  else',
    '    bin="$(_claude_profile_bin)"',
    '  fi',
    '  if [ -z "$bin" ] || [ ! -x "$bin" ]; then',
    `    echo "error: ${binName} not installed or not in PATH" >&2`,
    '    return 1',
    '  fi',
    '  if [ "$1" = "switch" ]; then',
    '    local profile="${2:-}"',
    '    if [ -n "$profile" ]; then',
    '      # specified profile name, direct switch',
    '      shift 2',
    '      local export_output',
    '      export_output="$($bin switch "$profile" "$@" 2>&1)"',
    '      if [ $? -ne 0 ]; then',
    '        echo "error: $export_output" >&2',
    '        return 1',
    '      fi',
    '      _claude_profile_safe_eval <<< "$export_output"',
    '      echo "switched to: $profile"',
    '    else',
    '      # no arguments, interactive mode',
    '      if [ -t 0 ]; then',
    '        $bin switch',
    '        if [ $? -ne 0 ]; then',
    '          return 1',
    '        fi',
    '        local export_output',
    '        export_output="$($bin export --current 2>&1)"',
    '        if [ $? -ne 0 ]; then',
    '          echo "error: $export_output" >&2',
    '          return 1',
    '        fi',
    '        _claude_profile_safe_eval <<< "$export_output"',
    '      else',
    '        echo "error: interactive switch requires a terminal" >&2',
    '        return 1',
    '      fi',
    '    fi',
    '  elif [ "$1" = "--pick-current" ]; then',
    '    $bin export --current',
    '  elif [ "$1" = "export" ] && [ "$2" = "--current" ]; then',
    '    $bin export --current',
    '  elif [ "$1" = "export" ]; then',
    '    shift',
    '    $bin export "$@"',
    '  else',
    '    $bin "$@"',
    '  fi',
    '}',
  ];
  return lines.join('\n');
}

/**
 * Render the "default env baseline" block. Injects cross-provider, business-
 * neutral defaults at shell-hook registration time, so users without any
 * configured profile still get sane Claude Code behavior out of the box.
 *
 * Guard semantics: `[ -z "${VAR+set}" ]` only sets a default when the
 * variable is *completely unset*, respecting user-provided values (including
 * empty strings or 0).
 *
 * Master switch: `CLAUDE_PROFILE_DEFAULT_ENV=0` disables the block entirely.
 */
export function renderDefaultEnvBlock(): string {
  // No leading blank line — `renderShellHook` composes the spacing between
  // the dispatch function and this block. The original `buildDefaultEnvBlock`
  // started with '' too, but that '' was effectively a no-op because the
  // caller used string concatenation, not `join`.
  const lines: string[] = [
    '# 默认注入通用高性能 env 基线（不覆盖用户已设值；CLAUDE_PROFILE_DEFAULT_ENV=0 可关闭）',
    'if [ "${CLAUDE_PROFILE_DEFAULT_ENV:-1}" != "0" ]; then',
  ];
  for (const [key, value] of Object.entries(baseEnvTemplate)) {
    if (!value) continue;
    validateEnvKeyOrThrow(key);
    lines.push(`  [ -z "\${${key}+set}" ] && export ${key}=${shellQuote(value)}`);
  }
  lines.push('fi');
  return lines.join('\n');
}

export interface ShellHookOptions {
  binName?: string;
}

/**
 * Compose the full shell hook script. Order is load-bearing:
 *   1. Bin discovery (called by the dispatch function)
 *   2. Eval bridges (called by the dispatch function)
 *   3. Default env block (executed at eval-time, before the function defs)
 *   4. Dispatch function (calls 1, 2 at runtime)
 *
 * The four pieces are joined with blank lines, matching the original array
 * layout (where `''` elements separated function blocks).
 */
export function renderShellHook(options: ShellHookOptions = {}): string {
  const binName = options.binName ?? 'claude-profile';
  return [
    renderBinDiscovery(binName),
    '',
    renderSafeEvalBridge(),
    '',
    renderJsonEvalBridge(),
    '',
    renderDispatch(binName),
    renderDefaultEnvBlock(),
  ].join('\n');
}
