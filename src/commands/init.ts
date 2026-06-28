import { CommandResult } from '../types/command.js';
import { baseEnvTemplate } from '../templates/baseEnvTemplate.js';
import { shellQuote, validateEnvKeyOrThrow } from '../utils/shellSafety.js';

const SHELL_HOOK_CORE = [
  '_claude_profile_bin() {',
  '  if [ -n "$CLAUDE_PROFILE_BIN" ]; then',
  '    echo "$CLAUDE_PROFILE_BIN"',
  '    return',
  '  fi',
  '  local cmd',
  '  cmd="$( (unset -f claude-profile 2>/dev/null; type -p claude-profile) 2>/dev/null)"',
  '  if [ -n "$cmd" ] && [ -x "$cmd" ]; then',
  '    echo "$cmd"',
  '    return',
  '  fi',
  '  cmd="$( (unset -f claude-profile 2>/dev/null; command -v claude-profile) 2>/dev/null)"',
  '  if [ -n "$cmd" ] && [ -x "$cmd" ]; then',
  '    echo "$cmd"',
  '    return',
  '  fi',
  '    echo ""',
  '}',
  '',
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
'',
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
  '',
  'claude-profile() {',
  '  local bin',
  '  if [ -n "$CLAUDE_PROFILE_BIN" ]; then',
  '    bin="$CLAUDE_PROFILE_BIN"',
  '  else',
  '    bin="$(_claude_profile_bin)"',
  '  fi',
  '  if [ -z "$bin" ] || [ ! -x "$bin" ]; then',
  '    echo "error: claude-profile not installed or not in PATH" >&2',
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
].join('\n');

/**
 * 从 baseEnvTemplate 渲染"默认 env 基线注入"段。
 *
 * 在 shell hook 注册时（eval "$(claude-profile init)"）就把跨 provider 通用的高性能配置
 * 注入当前 shell，让未配置任何 profile 的用户也能开箱即用。这些键与 provider 业务无关
 * （BUG 规避 / 超时窗口 / 关闭非必要流量），不属于 model/api/key，适合作为默认基线。
 *
 * 守卫语义：[ -z "${VAR+set}" ] 仅当变量完全未赋值时才设默认，尊重用户已设值（含空值/0）。
 * 总开关：CLAUDE_PROFILE_DEFAULT_ENV=0 可完全关闭默认注入。
 */
function buildDefaultEnvBlock(): string {
  const lines: string[] = [
    '',
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

export async function initCommand(): Promise<CommandResult> {
  return {
    success: true,
    output: SHELL_HOOK_CORE + buildDefaultEnvBlock(),
  };
}