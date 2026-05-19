#!/usr/bin/env node

import { createCommandInteractive } from '../dist/commands/create.js';
import { editCommandInteractive } from '../dist/commands/edit.js';
import { deleteCommand, deleteCommandInteractive } from '../dist/commands/delete.js';
import { listCommand } from '../dist/commands/list.js';
import { switchCommand, switchCommandInteractive } from '../dist/commands/switch.js';
import { exportCommand, exportCurrentCommand, exportFileCommand, exportCurrentFileCommand } from '../dist/commands/export.js';
import { importFileCommand, importFileCommandInteractive } from '../dist/commands/import.js';
import { renameCommand, renameCommandInteractive } from '../dist/commands/rename.js';
import { duplicateCommand, duplicateCommandInteractive } from '../dist/commands/duplicate.js';
import { backupCommand, restoreCommand, restoreCommandInteractive } from '../dist/commands/backup.js';
import { initCommand } from '../dist/commands/init.js';
import { validateCommand } from '../dist/commands/validate.js';
import { completionCommand } from '../dist/commands/completion.js';

let result;
const args = process.argv.slice(2);
const command = args[0] || 'help';

// Global options
const globalOptions = {
  verbose: args.includes('--verbose') || args.includes('-v'),
  yes: args.includes('--yes') || args.includes('-y'),
};

async function main() {
  switch (command) {
    case 'create':
      result = await createCommandInteractive();
      break;

    case 'switch':
      if (args.length === 1) {
        result = await switchCommandInteractive();
      } else {
        const profileName = args[1];
        const syncToSettings = args.includes('--sync');
        result = await switchCommand({ profileName: profileName, syncToSettings });
      }
      break;

    case 'list':
      result = await listCommand({ verbose: globalOptions.verbose });
      break;

    case 'edit':
      result = await editCommandInteractive();
      break;

    case 'delete':
      if (args[1] && !args[1].startsWith('-')) {
        result = await deleteCommand({ profileName: args[1], yes: globalOptions.yes });
      } else {
        result = await deleteCommandInteractive();
      }
      break;

    case 'rename':
      if (args.length >= 3) {
        result = await renameCommand({ oldName: args[1], newName: args[2] });
      } else if (args.length === 2) {
        result = await renameCommandInteractive();
      } else {
        result = { success: false, error: '用法: claude-profile rename <旧名称> <新名称>' };
      }
      break;

    case 'duplicate':
      if (args.length >= 3) {
        result = await duplicateCommand({ sourceName: args[1], newName: args[2] });
      } else if (args.length === 2) {
        result = await duplicateCommandInteractive();
      } else {
        result = { success: false, error: '用法: claude-profile duplicate <源名称> <新名称>' };
      }
      break;

    case 'export':
      if (args.includes('--current') && args.includes('--file')) {
        const format = args.includes('--yaml') ? 'yaml' : 'json';
        const outputPath = getArgValue(args, '--output');
        result = await exportCurrentFileCommand({ format, outputPath });
      } else if (args.includes('--file')) {
        const format = args.includes('--yaml') ? 'yaml' : 'json';
        const outputPath = getArgValue(args, '--output');
        const profileName = args[1];
        result = await exportFileCommand({ profileName, format, outputPath });
      } else if (args.includes('--current')) {
        result = await exportCurrentCommand();
      } else {
        result = await exportCommand({ profileName: args[1] });
      }
      break;

    case 'import':
      if (args[1]) {
        const format = args.includes('--yaml') ? 'yaml' : 'json';
        const profileName = getArgValue(args, '--name');
        result = await importFileCommand({ inputPath: args[1], format, profileName });
      } else {
        result = await importFileCommandInteractive();
      }
      break;

    case 'backup':
      if (args.includes('--restore')) {
        const backupPath = args[args.indexOf('--restore') + 1];
        result = await restoreCommand({ backupPath });
      } else if (args.includes('--restore') && args.length === 2) {
        result = await restoreCommandInteractive();
      } else {
        const outputPath = args[1];
        result = await backupCommand({ outputPath });
      }
      break;

    case 'restore':
      if (args[1]) {
        result = await restoreCommand({ backupPath: args[1] });
      } else {
        result = await restoreCommandInteractive();
      }
      break;

    case 'init':
      result = await initCommand();
      break;

    case 'validate':
      result = await validateCommand({ verbose: globalOptions.verbose });
      break;

    case 'completion':
      result = await completionCommand({ shell: args[1] });
      break;

    case '--help':
    case '-h':
    case 'help':
      console.log(`
claude-profile - Claude Code 配置文件管理器

用法:
  claude-profile <命令> [选项] [配置名]

命令:
  create       创建新配置（交互式）
  switch       切换配置（无参数时进入交互模式）[--sync 同步到 settings.json]
  list         列出所有配置
  edit         编辑配置
  delete       删除配置
  rename       重命名配置: rename <旧名称> <新名称>
  duplicate    复制配置: duplicate <源名称> <新名称>
  export       导出配置 (export [--current] [--file [--yaml] [--output <路径>]])
  import       导入配置: import <文件路径> [--yaml] [--name <配置名>]
  backup       备份配置: backup [--restore [备份路径]]
  restore      恢复配置: restore [备份路径]
  init         输出 shell hook 脚本
  validate     验证所有配置完整性
  completion   生成 shell 自动补全脚本 (bash/zsh/fish)

全局选项:
  -h, --help         显示帮助信息
  -v, --verbose      显示详细输出
  -y, --yes          跳过确认提示（非交互模式）

示例:
  claude-profile list --verbose
  claude-profile delete my-profile --yes
  claude-profile validate -v
  claude-profile completion bash > /etc/bash_completion.d/claude-profile
      `);
      break;

    default:
      console.error(`未知命令: ${command}`);
      console.error(`使用 claude-profile --help 查看帮助`);
      process.exit(1);
  }

  if (result) {
    if (result.output) {
      console.log(result.output);
    }
    if (result.error) {
      console.error(result.error);
      process.exit(1);
    }
    if (result.wasCancelled) {
      process.exit(130);
    }
  }
}

function getArgValue(args, arg) {
  const index = args.indexOf(arg);
  if (index >= 0 && index < args.length - 1) {
    return args[index + 1];
  }
  return undefined;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
