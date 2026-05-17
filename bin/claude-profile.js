#!/usr/bin/env node

import { createCommandInteractive } from '../dist/commands/create.js';
import { editCommandInteractive } from '../dist/commands/edit.js';
import { deleteCommand, deleteCommandInteractive } from '../dist/commands/delete.js';
import { listCommand } from '../dist/commands/list.js';
import { switchCommand, switchCommandInteractive } from '../dist/commands/switch.js';
import { exportCommand, exportCurrentCommand } from '../dist/commands/export.js';
import { initCommand } from '../dist/commands/init.js';

let result;
const args = process.argv.slice(2);
const command = args[0] || 'help';

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
        result = await switchCommand({ profileName: profileName });
      }
      break;

    case 'list':
      result = await listCommand();
      break;

    case 'edit':
      result = await editCommandInteractive();
      break;

    case 'delete':
      if (args[1]) {
        result = await deleteCommand({ profileName: args[1] });
      } else {
        result = await deleteCommandInteractive();
      }
      break;

    case 'export':
      if (args.includes('--current')) {
        result = await exportCurrentCommand();
      } else {
        result = await exportCommand({ profileName: args[1] });
      }
      break;

    case 'init':
      result = await initCommand();
      break;

    case '--help':
    case '-h':
    case 'help':
      console.log(`
claude-profile - Claude Code 配置文件管理器

用法:
  claude-profile <命令> [配置名]

命令:
  create       创建新配置（交互式）
  switch       切换配置（无参数时进入交互模式）
  list         列出所有配置
  edit         编辑配置
  delete       删除配置
  export       导出配置
  init         输出 shell hook 脚本

选项:
  -h, --help         显示帮助信息
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
