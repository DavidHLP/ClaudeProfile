import { CommandResult } from '../types/command.js';
import { Profile } from '../types/index.js';
import type { CommandContext } from './context.js';

export interface ValidateOptions {
  verbose?: boolean;
}

interface ValidationIssue {
  profile: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

function validateProfile(profile: Profile, _isCurrentProfile: boolean): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check required fields
  if (!profile.env.ANTHROPIC_AUTH_TOKEN || profile.env.ANTHROPIC_AUTH_TOKEN.trim() === '') {
    issues.push({
      profile: profile.name,
      field: 'ANTHROPIC_AUTH_TOKEN',
      message: 'API Token 为空',
      severity: 'error',
    });
  }

  if (!profile.env.ANTHROPIC_BASE_URL || profile.env.ANTHROPIC_BASE_URL.trim() === '') {
    issues.push({
      profile: profile.name,
      field: 'ANTHROPIC_BASE_URL',
      message: 'Base URL 为空',
      severity: 'error',
    });
  } else {
    // Validate URL format
    try {
      const url = new URL(profile.env.ANTHROPIC_BASE_URL);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        issues.push({
          profile: profile.name,
          field: 'ANTHROPIC_BASE_URL',
          message: 'URL 格式无效（仅支持 http/https）',
          severity: 'error',
        });
      }
    } catch {
      issues.push({
        profile: profile.name,
        field: 'ANTHROPIC_BASE_URL',
        message: 'URL 格式无效',
        severity: 'error',
      });
    }
  }

  // Warnings for recommended fields
  if (!profile.env.ANTHROPIC_MODEL || profile.env.ANTHROPIC_MODEL.trim() === '') {
    issues.push({
      profile: profile.name,
      field: 'ANTHROPIC_MODEL',
      message: '未设置默认模型',
      severity: 'warning',
    });
  }

  if (!profile.env.ANTHROPIC_DEFAULT_SONNET_MODEL || profile.env.ANTHROPIC_DEFAULT_SONNET_MODEL.trim() === '') {
    issues.push({
      profile: profile.name,
      field: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
      message: '未设置 SONNET 模型',
      severity: 'warning',
    });
  }

  if (!profile.env.ANTHROPIC_DEFAULT_OPUS_MODEL || profile.env.ANTHROPIC_DEFAULT_OPUS_MODEL.trim() === '') {
    issues.push({
      profile: profile.name,
      field: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
      message: '未设置 OPUS 模型',
      severity: 'warning',
    });
  }

  if (!profile.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || profile.env.ANTHROPIC_DEFAULT_HAIKU_MODEL.trim() === '') {
    issues.push({
      profile: profile.name,
      field: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
      message: '未设置 HAIKU 模型',
      severity: 'warning',
    });
  }

  return issues;
}

export async function validateCommand(ctx: CommandContext, options: ValidateOptions = {}): Promise<CommandResult> {
  const profiles = ctx.profiles.listProfiles();
  const currentProfile = ctx.profiles.getCurrentProfile();
  const allIssues: ValidationIssue[] = [];

  if (profiles.length === 0) {
    return {
      success: true,
      output: '验证通过：没有配置需要验证',
    };
  }

  for (const profile of profiles) {
    const isCurrent = profile.name === currentProfile;
    const issues = validateProfile(profile, isCurrent);
    allIssues.push(...issues);
  }

  const errors = allIssues.filter(i => i.severity === 'error');
  const warnings = allIssues.filter(i => i.severity === 'warning');

  const lines: string[] = [];

  if (errors.length === 0 && warnings.length === 0) {
    if (options.verbose) {
      // Reuse the shared per-profile detail renderer so list/validate
      // never drift apart.
      const detailBlocks = profiles.map((profile) =>
        ctx.env.formatProfileDetail(profile, profile.name === currentProfile)
      );
      const header = [
        `\n详细信息:`,
        `  配置目录: ${ctx.profiles.getStoreLocation() || '未知'}`,
        `  当前配置: ${currentProfile || '无'}`,
        `  配置数量: ${profiles.length}`,
      ];
      return {
        success: true,
        output: `验证通过：${profiles.length} 个配置检查无误\n${header.join('\n')}\n\n${detailBlocks.join('\n\n')}`,
      };
    }
    return {
      success: true,
      output: `验证通过：${profiles.length} 个配置检查无误`,
    };
  }

  if (errors.length > 0) {
    lines.push(`❌ 发现 ${errors.length} 个错误:`);
    for (const issue of errors) {
      lines.push(`  • [${issue.profile}] ${issue.field}: ${issue.message}`);
    }
  }

  if (warnings.length > 0) {
    lines.push(`⚠️  发现 ${warnings.length} 个警告:`);
    for (const issue of warnings) {
      lines.push(`  • [${issue.profile}] ${issue.field}: ${issue.message}`);
    }
  }

  if (options.verbose) {
    // Even on failure, surface the per-profile detail so users can
    // see what each profile actually contains.
    const detailBlocks = profiles.map((profile) =>
      ctx.env.formatProfileDetail(profile, profile.name === currentProfile)
    );
    lines.push('\n详细信息:');
    lines.push(`  配置目录: ${ctx.profiles.getStoreLocation() || '未知'}`);
    lines.push(`  当前配置: ${currentProfile || '无'}`);
    lines.push(`  配置数量: ${profiles.length}`);
    lines.push('');
    lines.push(...detailBlocks);
  }

  const output = lines.join('\n');
  if (errors.length > 0) {
    return { success: false, error: output };
  }
  return { success: true, output };
}
