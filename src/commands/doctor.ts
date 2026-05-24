import { existsSync, statSync, readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { profileService } from '../services/profileService.js';
import { CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';
import { isValidEnvKey } from '../utils/shellSafety.js';
import { icon } from '../ui/theme.js';

interface CheckResult {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  suggestion?: string;
}

function checkConfigDir(): CheckResult {
  const storeLocation = profileService.getStoreLocation();
  if (!storeLocation || !existsSync(storeLocation)) {
    return { name: '配置目录', status: 'error', message: '配置目录不存在', suggestion: '运行 claude-profile create 创建第一个配置' };
  }
  try {
    const stats = statSync(storeLocation);
    const mode = stats.mode & 0o777;
    if (mode !== 0o700) {
      return { name: '配置目录权限', status: 'warning', message: `权限为 0${mode.toString(8)}，建议 0700`, suggestion: `chmod 700 ${storeLocation}` };
    }
  } catch {
    return { name: '配置目录权限', status: 'error', message: '无法读取配置目录权限' };
  }
  return { name: '配置目录', status: 'ok', message: '存在且权限正确' };
}

function checkProfileFiles(): CheckResult {
  const storeLocation = profileService.getStoreLocation();
  if (!storeLocation || !existsSync(storeLocation)) {
    return { name: '配置文件权限', status: 'ok', message: '无配置文件' };
  }
  try {
    const files = readdirSync(storeLocation).filter((f: string) => f.endsWith('.json'));
    let bad = 0;
    for (const file of files) {
      const stats = statSync(join(storeLocation, file));
      const mode = stats.mode & 0o777;
      if (mode !== 0o600) bad++;
    }
    if (bad > 0) {
      return { name: '配置文件权限', status: 'warning', message: `${bad} 个文件权限不是 0600`, suggestion: `chmod 600 ${join(storeLocation, '*.json')}` };
    }
    return { name: '配置文件权限', status: 'ok', message: `${files.length} 个文件权限正确` };
  } catch {
    return { name: '配置文件权限', status: 'error', message: '无法检查配置文件权限' };
  }
}

function checkProfiles(): CheckResult {
  const profiles = profileService.listProfiles();
  if (profiles.length === 0) {
    return { name: '配置数量', status: 'warning', message: '没有配置', suggestion: '运行 claude-profile create 创建配置' };
  }
  const badKeys: string[] = [];
  let issues = 0;
  for (const profile of profiles) {
    for (const key of Object.keys(profile.env)) {
      if (!isValidEnvKey(key)) {
        issues++;
        if (badKeys.length < 5) badKeys.push(`${profile.name}:${key}`);
      }
    }
  }
  if (issues > 0) {
    const keyList = badKeys.join(', ') + (issues > badKeys.length ? ', ...' : '');
    return { name: '配置安全', status: 'error', message: `发现 ${issues} 个非法环境变量键 (${keyList})`, suggestion: '编辑配置，移除非法键' };
  }
  return { name: '配置安全', status: 'ok', message: `${profiles.length} 个配置通过检查` };
}

function checkCurrentProfile(): CheckResult {
  const current = profileService.getCurrentProfile();
  if (!current) {
    return { name: '当前配置', status: 'warning', message: '未设置当前配置', suggestion: '运行 claude-profile switch <name> 激活配置' };
  }
  const profile = profileService.getProfile(current);
  if (!profile) {
    return { name: '当前配置', status: 'error', message: `当前配置 '${current}' 不存在`, suggestion: '切换到一个有效的配置' };
  }
  return { name: '当前配置', status: 'ok', message: `已激活: ${current}` };
}

function checkHook(): CheckResult {
  const rcFiles = ['.bashrc', '.zshrc'].map(f => join(homedir(), f));
  let loaded = false;
  for (const rc of rcFiles) {
    if (existsSync(rc)) {
      try {
        const content = readFileSync(rc, 'utf-8');
        if (content.includes('claude-profile')) loaded = true;
      } catch { /* ignore */ }
    }
  }
  if (!loaded) {
    return { name: 'Shell Hook', status: 'warning', message: '未在 .bashrc/.zshrc 中发现 hook', suggestion: '将 eval "$(claude-profile init)" 加入 shell 配置文件' };
  }
  return { name: 'Shell Hook', status: 'ok', message: '已加载' };
}

function checkSettingsSync(): CheckResult {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  if (!existsSync(settingsPath)) {
    return { name: 'Settings Sync', status: 'warning', message: 'settings.json 不存在', suggestion: '切换配置会自动创建' };
  }
  try {
    const content = readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(content);
    const envKeys = Object.keys(parsed.env || {});
    return { name: 'Settings Sync', status: 'ok', message: `settings.json 存在，包含 ${envKeys.length} 个环境变量` };
  } catch {
    return { name: 'Settings Sync', status: 'error', message: 'settings.json 损坏', suggestion: '删除后重新同步' };
  }
}

function checkGitRepo(): CheckResult {
  try {
    const gitDir = join(process.cwd(), '.git');
    if (existsSync(gitDir)) {
      return { name: 'Git 仓库', status: 'ok', message: '当前目录是 Git 仓库' };
    }
    return { name: 'Git 仓库', status: 'warning', message: '当前目录不是 Git 仓库', suggestion: '在项目根目录运行以使用 project scope' };
  } catch {
    return { name: 'Git 仓库', status: 'ok', message: '无法检测' };
  }
}

function checkEnvConsistency(): CheckResult {
  const current = profileService.getCurrentProfile();
  if (!current) {
    return { name: '环境一致性', status: 'ok', message: '无当前配置' };
  }
  const profile = profileService.getProfile(current);
  if (!profile) {
    return { name: '环境一致性', status: 'ok', message: '当前配置不存在' };
  }
  const mismatches: string[] = [];
  for (const [key, value] of Object.entries(profile.env)) {
    if (process.env[key] !== value) {
      mismatches.push(key);
    }
  }
  if (mismatches.length > 0) {
    return { name: '环境一致性', status: 'warning', message: `${mismatches.length} 个变量与当前 shell 不一致`, suggestion: '重新加载 shell hook 或切换配置' };
  }
  return { name: '环境一致性', status: 'ok', message: '所有变量与当前 shell 一致' };
}

export async function doctorCommand(): Promise<CommandResult> {
  return runCommand('诊断检查', async () => {
    const checks = [
      checkConfigDir(),
      checkProfileFiles(),
      checkProfiles(),
      checkCurrentProfile(),
      checkHook(),
      checkSettingsSync(),
      checkGitRepo(),
      checkEnvConsistency(),
    ];

    const errors = checks.filter(c => c.status === 'error');
    const warnings = checks.filter(c => c.status === 'warning');
    const ok = checks.filter(c => c.status === 'ok');

    const lines: string[] = [];
    lines.push('');
    lines.push('  诊断报告');
    lines.push('');

    for (const check of checks) {
      const iconChar = check.status === 'ok' ? icon.success : check.status === 'warning' ? icon.warning : icon.error;
      lines.push(`  ${iconChar} ${check.name}: ${check.message}`);
      if (check.suggestion) {
        lines.push(`      → ${check.suggestion}`);
      }
    }

    lines.push('');
    lines.push(`  总结: ${ok.length} 通过, ${warnings.length} 警告, ${errors.length} 错误`);
    lines.push('');

    const output = lines.join('\n');
    if (errors.length > 0) {
      return { success: false, error: output };
    }
    return { success: true, output };
  });
}
