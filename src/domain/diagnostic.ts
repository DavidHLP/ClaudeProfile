/**
 * Diagnostic — the canonical diagnostic-report shape for the CLI.
 *
 * Why this module exists
 * ----------------------
 * Before this module, `commands/doctor.ts` was a 189-line blob: 7
 * hand-rolled `check*` functions, each carrying its own try/catch and
 * its own I/O (fs.statSync, fs.readdirSync, fs.readFileSync, homedir,
 * process.cwd()), all called inline from a single `doctorCommand`
 * that then inlined an 11-line `lines.push(...)` report block.
 *
 * The 7 checks were shallow modules: their interface
 * (`{ name, status, message, suggestion }`) was nearly as wide as
 * their 15-line implementations, and the report shape lived in the
 * command, not in a presenter. Adding a new check meant editing both
 * the check list and the report block. The test surface
 * (`tests/doctor.test.ts`) had 2 cases — every individual check was
 * untested in isolation.
 *
 * After this module:
 *   - The 7 checks live here, as a `CheckResult` type and 7 named
 *     functions, plus a `runDiagnostics(ctx): CheckResult[]` runner
 *     that the command can call in one line.
 *   - The report shape lives in `presenters/envRenderer.ts` as
 *     `formatDiagnosticReport(results)`, mirroring the
 *     `formatVerboseHeader` / `formatValidationIssues` pattern from
 *     ADR-0005.
 *   - `commands/doctor.ts` shrinks to a 10-line shell:
 *     `run → format → map success`.
 *
 * Locality: every "what does a diagnostic look like" decision lives
 * here or in the presenter. The deletion test: if you delete this
 * module, the 7 checks reappear in `doctorCommand` within 20 lines.
 *
 * Dependency category
 * -------------------
 * In-process (per `DEEPENING.md`): no I/O outside of the functions'
 * own use of `fs` and `os`, no DI seam beyond `ctx.profiles`. The 4
 * checks that reach into `ctx.profiles` are testable with
 * `InMemoryConfigStore`; the 3 checks that reach into `fs`/`os` are
 * testable with `vi.mock('fs')` (the pattern already used in
 * `tests/doctor.test.ts`).
 */
import { existsSync, statSync, readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { isValidEnvKey } from '../utils/shellSafety.js';
import type { CommandContext } from '../commands/context.js';

export type CheckStatus = 'ok' | 'warning' | 'error';

export interface CheckResult {
  readonly name: string;
  readonly status: CheckStatus;
  readonly message: string;
  readonly suggestion?: string;
}

const SUGGESTION_CREATE = '运行 claude-profile create 创建第一个配置';
const SUGGESTION_CHMOD_DIR = (path: string) => `chmod 700 ${path}`;
const SUGGESTION_CHMOD_FILES = (path: string) => `chmod 600 ${join(path, '*.json')}`;

/**
 * Check 1 — the config directory exists and has 0700 permissions.
 */
function checkConfigDir(ctx: CommandContext): CheckResult {
  const storeLocation = ctx.profiles.getStoreLocation();
  if (!storeLocation || !existsSync(storeLocation)) {
    return {
      name: '配置目录',
      status: 'error',
      message: '配置目录不存在',
      suggestion: SUGGESTION_CREATE,
    };
  }
  try {
    const stats = statSync(storeLocation);
    const mode = stats.mode & 0o777;
    if (mode !== 0o700) {
      return {
        name: '配置目录权限',
        status: 'warning',
        message: `权限为 0${mode.toString(8)}，建议 0700`,
        suggestion: SUGGESTION_CHMOD_DIR(storeLocation),
      };
    }
  } catch {
    return { name: '配置目录权限', status: 'error', message: '无法读取配置目录权限' };
  }
  return { name: '配置目录', status: 'ok', message: '存在且权限正确' };
}

/**
 * Check 2 — every profile file in the config dir is mode 0600.
 */
function checkProfileFiles(ctx: CommandContext): CheckResult {
  const storeLocation = ctx.profiles.getStoreLocation();
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
      return {
        name: '配置文件权限',
        status: 'warning',
        message: `${bad} 个文件权限不是 0600`,
        suggestion: SUGGESTION_CHMOD_FILES(storeLocation),
      };
    }
    return { name: '配置文件权限', status: 'ok', message: `${files.length} 个文件权限正确` };
  } catch {
    return { name: '配置文件权限', status: 'error', message: '无法检查配置文件权限' };
  }
}

/**
 * Check 3 — every env key in every profile is a valid POSIX env key.
 * Counts the first 5 offending keys for the user-facing message.
 */
function checkProfiles(ctx: CommandContext): CheckResult {
  const profiles = ctx.profiles.listProfiles();
  if (profiles.length === 0) {
    return {
      name: '配置数量',
      status: 'warning',
      message: '没有配置',
      suggestion: '运行 claude-profile create 创建配置',
    };
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
    return {
      name: '配置安全',
      status: 'error',
      message: `发现 ${issues} 个非法环境变量键 (${keyList})`,
      suggestion: '编辑配置，移除非法键',
    };
  }
  return { name: '配置安全', status: 'ok', message: `${profiles.length} 个配置通过检查` };
}

/**
 * Check 4 — the current-profile marker points at a profile that exists.
 */
function checkCurrentProfile(ctx: CommandContext): CheckResult {
  const current = ctx.profiles.getCurrentProfile();
  if (!current) {
    return {
      name: '当前配置',
      status: 'warning',
      message: '未设置当前配置',
      suggestion: '运行 claude-profile switch <name> 激活配置',
    };
  }
  const profile = ctx.profiles.getProfile(current);
  if (!profile) {
    return {
      name: '当前配置',
      status: 'error',
      message: `当前配置 '${current}' 不存在`,
      suggestion: '切换到一个有效的配置',
    };
  }
  return { name: '当前配置', status: 'ok', message: `已激活: ${current}` };
}

/**
 * Check 5 — the shell hook is loaded in at least one rc file.
 *
 * Reads `$HOME/.bashrc` and `$HOME/.zshrc`; considers the hook loaded
 * if the file contains the string `claude-profile`. This is the same
 * heuristic the original check used.
 */
function checkHook(): CheckResult {
  const rcFiles = ['.bashrc', '.zshrc'].map((f) => join(homedir(), f));
  let loaded = false;
  for (const rc of rcFiles) {
    if (existsSync(rc)) {
      try {
        const content = readFileSync(rc, 'utf-8');
        if (content.includes('claude-profile')) loaded = true;
      } catch {
        /* ignore unreadable rc files */
      }
    }
  }
  if (!loaded) {
    return {
      name: 'Shell Hook',
      status: 'warning',
      message: '未在 .bashrc/.zshrc 中发现 hook',
      suggestion: '将 eval "$(claude-profile init)" 加入 shell 配置文件',
    };
  }
  return { name: 'Shell Hook', status: 'ok', message: '已加载' };
}

/**
 * Check 6 — the current working directory is a Git repository.
 * "Current directory" matters for project-scope behavior in some
 * downstream tools; the original check is preserved as-is.
 */
function checkGitRepo(): CheckResult {
  try {
    const gitDir = join(process.cwd(), '.git');
    if (existsSync(gitDir)) {
      return { name: 'Git 仓库', status: 'ok', message: '当前目录是 Git 仓库' };
    }
    return {
      name: 'Git 仓库',
      status: 'warning',
      message: '当前目录不是 Git 仓库',
      suggestion: '在项目根目录运行以使用 project scope',
    };
  } catch {
    return { name: 'Git 仓库', status: 'ok', message: '无法检测' };
  }
}

/**
 * Check 7 — every env key in the current profile matches the value
 * already in `process.env` (i.e. the shell is in sync with the
 * config on disk). If a profile is not active, the check is a no-op.
 */
function checkEnvConsistency(ctx: CommandContext): CheckResult {
  const current = ctx.profiles.getCurrentProfile();
  if (!current) {
    return { name: '环境一致性', status: 'ok', message: '无当前配置' };
  }
  const profile = ctx.profiles.getProfile(current);
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
    return {
      name: '环境一致性',
      status: 'warning',
      message: `${mismatches.length} 个变量与当前 shell 不一致`,
      suggestion: '重新加载 shell hook 或切换配置',
    };
  }
  return { name: '环境一致性', status: 'ok', message: '所有变量与当前 shell 一致' };
}

/**
 * The ordered list of checks. The order is preserved in the report.
 * To add a check: implement a `Check` function, add it here.
 * To remove a check: remove it from this list (and delete the function
 * if it's not used anywhere else).
 */
const CHECKS: ReadonlyArray<(ctx: CommandContext) => CheckResult> = [
  checkConfigDir,
  checkProfileFiles,
  checkProfiles,
  checkCurrentProfile,
  checkHook,
  checkGitRepo,
  checkEnvConsistency,
];

/**
 * Run every diagnostic check and return the results in canonical
 * order. This is the single entry point the command layer uses; the
 * individual `check*` functions are not exported (they are
 * implementation detail — the public surface is the runner).
 */
export function runDiagnostics(ctx: CommandContext): CheckResult[] {
  return CHECKS.map((check) => check(ctx));
}
