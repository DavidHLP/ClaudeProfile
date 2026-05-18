import { CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';

export interface CompletionOptions {
  shell?: string;
}

const COMMANDS = [
  'create',
  'switch',
  'list',
  'edit',
  'delete',
  'rename',
  'duplicate',
  'export',
  'import',
  'backup',
  'restore',
  'init',
  'validate',
  'completion',
  'help',
];

const COMMANDS_WITH_PROFILE: ReadonlySet<string> = new Set([
  'switch',
  'delete',
  'edit',
  'rename',
  'duplicate',
  'export',
]);

export async function completionCommand(options: CompletionOptions): Promise<CommandResult> {
  return runCommand('生成补全脚本', async () => {
    const rawShell = options.shell;
    if (!rawShell) {
      return {
        success: false as const,
        error: '请指定 shell 类型: bash | zsh | fish\n用法: claude-profile completion <shell>',
      };
    }

    const shell = rawShell.toLowerCase();

    switch (shell) {
      case 'bash':
        return { success: true as const, output: generateBashCompletion() };
      case 'zsh':
        return { success: true as const, output: generateZshCompletion() };
      case 'fish':
        return { success: true as const, output: generateFishCompletion() };
      default:
        return {
          success: false as const,
          error: `不支持的 shell: ${rawShell}\n支持的 shell: bash | zsh | fish`,
        };
    }
  });
}

function generateBashCompletion(): string {
  const commands = COMMANDS.join(' ');
  const profileCommands = Array.from(COMMANDS_WITH_PROFILE).join('|');
  return `# claude-profile bash 补全脚本
# 安装方法 (任选其一)：
#   1) 临时启用: source <(claude-profile completion bash)
#   2) 永久启用: claude-profile completion bash | sudo tee /etc/bash_completion.d/claude-profile

_claude_profile_completion() {
    local cur prev commands
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    commands="${commands}"

    if [ \${COMP_CWORD} -eq 1 ]; then
        COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
        return 0
    fi

    case "\${prev}" in
        ${profileCommands})
            # 配置名补全：从 ~/.config/claude-profile/ 读取
            local profiles=""
            if [ -d "\${HOME}/.config/claude-profile" ]; then
                profiles=$(ls -1 "\${HOME}/.config/claude-profile" 2>/dev/null | grep -v '^\\.' | sed 's/\\.json$//')
            fi
            COMPREPLY=( $(compgen -W "\${profiles}" -- "\${cur}") )
            return 0
            ;;
        completion)
            COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
            return 0
            ;;
        export|import)
            COMPREPLY=( $(compgen -W "--current --file --yaml --output --name" -- "\${cur}") )
            return 0
            ;;
        backup|restore)
            COMPREPLY=( $(compgen -W "--restore" -- "\${cur}") )
            return 0
            ;;
    esac

    # 默认补全全局选项
    COMPREPLY=( $(compgen -W "--help --verbose --yes -h -v -y" -- "\${cur}") )
}

complete -F _claude_profile_completion claude-profile
`;
}

function generateZshCompletion(): string {
  const commandDescriptions = [
    'create:创建新配置（交互式）',
    'switch:切换配置',
    'list:列出所有配置',
    'edit:编辑配置',
    'delete:删除配置',
    'rename:重命名配置',
    'duplicate:复制配置',
    'export:导出配置',
    'import:导入配置',
    'backup:备份配置',
    'restore:恢复配置',
    'init:输出 shell hook 脚本',
    'validate:验证所有配置完整性',
    'completion:生成 shell 自动补全脚本',
    'help:显示帮助信息',
  ].map((cmd) => `        '${cmd}'`).join('\n');

  return `#compdef claude-profile
# claude-profile zsh 补全脚本
# 安装方法 (任选其一)：
#   1) 临时启用: source <(claude-profile completion zsh)
#   2) 永久启用: claude-profile completion zsh > "\${fpath[1]}/_claude-profile"

_claude_profile() {
    local -a commands
    local -a profiles
    local context state line

    commands=(
${commandDescriptions}
    )

    _arguments -C \\
        '1: :->command' \\
        '*:: :->args' \\
        '(-h --help)'{-h,--help}'[显示帮助信息]' \\
        '(-v --verbose)'{-v,--verbose}'[显示详细输出]' \\
        '(-y --yes)'{-y,--yes}'[跳过确认提示]'

    case $state in
        command)
            _describe -t commands 'claude-profile 命令' commands
            ;;
        args)
            case $words[1] in
                switch|delete|edit|rename|duplicate|export)
                    if [ -d "\${HOME}/.config/claude-profile" ]; then
                        profiles=(\${(f)"$(ls -1 \${HOME}/.config/claude-profile 2>/dev/null | grep -v '^\\.' | sed 's/\\.json$//')"})
                        _describe -t profiles '配置名' profiles
                    fi
                    ;;
                completion)
                    local -a shells
                    shells=('bash:Bash shell' 'zsh:Zsh shell' 'fish:Fish shell')
                    _describe -t shells 'shell' shells
                    ;;
            esac
            ;;
    esac
}

_claude_profile "$@"
`;
}

function generateFishCompletion(): string {
  const commandLines = [
    "complete -c claude-profile -n '__fish_use_subcommand' -a 'create' -d '创建新配置（交互式）'",
    "complete -c claude-profile -n '__fish_use_subcommand' -a 'switch' -d '切换配置'",
    "complete -c claude-profile -n '__fish_use_subcommand' -a 'list' -d '列出所有配置'",
    "complete -c claude-profile -n '__fish_use_subcommand' -a 'edit' -d '编辑配置'",
    "complete -c claude-profile -n '__fish_use_subcommand' -a 'delete' -d '删除配置'",
    "complete -c claude-profile -n '__fish_use_subcommand' -a 'rename' -d '重命名配置'",
    "complete -c claude-profile -n '__fish_use_subcommand' -a 'duplicate' -d '复制配置'",
    "complete -c claude-profile -n '__fish_use_subcommand' -a 'export' -d '导出配置'",
    "complete -c claude-profile -n '__fish_use_subcommand' -a 'import' -d '导入配置'",
    "complete -c claude-profile -n '__fish_use_subcommand' -a 'backup' -d '备份配置'",
    "complete -c claude-profile -n '__fish_use_subcommand' -a 'restore' -d '恢复配置'",
    "complete -c claude-profile -n '__fish_use_subcommand' -a 'init' -d '输出 shell hook 脚本'",
    "complete -c claude-profile -n '__fish_use_subcommand' -a 'validate' -d '验证所有配置完整性'",
    "complete -c claude-profile -n '__fish_use_subcommand' -a 'completion' -d '生成 shell 自动补全脚本'",
    "complete -c claude-profile -n '__fish_use_subcommand' -a 'help' -d '显示帮助信息'",
  ].join('\n');

  return `# claude-profile fish 补全脚本
# 安装方法 (任选其一)：
#   1) 临时启用: claude-profile completion fish | source
#   2) 永久启用: claude-profile completion fish > ~/.config/fish/completions/claude-profile.fish

# 禁用文件路径补全
complete -c claude-profile -f

# 命令补全
${commandLines}

# 全局选项
complete -c claude-profile -s h -l help -d '显示帮助信息'
complete -c claude-profile -s v -l verbose -d '显示详细输出'
complete -c claude-profile -s y -l yes -d '跳过确认提示'

# 子命令选项
complete -c claude-profile -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish' -d 'Shell 类型'
complete -c claude-profile -n '__fish_seen_subcommand_from export' -l current -d '导出当前配置'
complete -c claude-profile -n '__fish_seen_subcommand_from export' -l file -d '导出为文件'
complete -c claude-profile -n '__fish_seen_subcommand_from export' -l yaml -d 'YAML 格式'
complete -c claude-profile -n '__fish_seen_subcommand_from export' -l output -d '输出路径'
complete -c claude-profile -n '__fish_seen_subcommand_from import' -l yaml -d 'YAML 格式'
complete -c claude-profile -n '__fish_seen_subcommand_from import' -l name -d '配置名'
complete -c claude-profile -n '__fish_seen_subcommand_from backup' -l restore -d '恢复模式'

# 配置名补全（动态读取）
function __claude_profile_list_profiles
    if test -d "$HOME/.config/claude-profile"
        ls -1 "$HOME/.config/claude-profile" 2>/dev/null | grep -v '^\\.' | sed 's/\\.json$//'
    end
end

complete -c claude-profile -n '__fish_seen_subcommand_from switch delete edit rename duplicate export' -a '(__claude_profile_list_profiles)' -d '配置名'
`;
}
