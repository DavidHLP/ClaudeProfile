import { profileService } from '../services/profileService.js';
import { CommandResult } from '../types/command.js';
import { Profile } from '../types/index.js';

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

export async function validateCommand(options: ValidateOptions = {}): Promise<CommandResult> {
  const profiles = profileService.listProfiles();
  const currentProfile = profileService.getCurrentProfile();
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
      const detailLines: string[] = [];
      detailLines.push(`\n详细信息:`);
      detailLines.push(`  配置目录: ${profileService.getStoreLocation() || '未知'}`);
      detailLines.push(`  当前配置: ${currentProfile || '无'}`);
      detailLines.push(`  配置数量: ${profiles.length}`);

      for (const profile of profiles) {
        const isCurrent = profile.name === currentProfile;
        detailLines.push(`\n  ${isCurrent ? '→ ' : '  '}${profile.name} (${profile.description || '无描述'}):`);
        detailLines.push(`    BASE URL: ${profile.env.ANTHROPIC_BASE_URL || '❌ 未设置'}`);
        detailLines.push(`    TOKEN: ${profile.env.ANTHROPIC_AUTH_TOKEN ? '✓ 已设置' : '❌ 未设置'}`);
        detailLines.push(`    MODEL: ${profile.env.ANTHROPIC_MODEL || '⚠️ 未设置'}`);
        detailLines.push(`    SONNET: ${profile.env.ANTHROPIC_DEFAULT_SONNET_MODEL || '⚠️ 未设置'}`);
        detailLines.push(`    OPUS: ${profile.env.ANTHROPIC_DEFAULT_OPUS_MODEL || '⚠️ 未设置'}`);
        detailLines.push(`    HAIKU: ${profile.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '⚠️ 未设置'}`);
      }
      return {
        success: true,
        output: `验证通过：${profiles.length} 个配置检查无误${detailLines.join('\n')}`,
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
    lines.push('\n详细信息:');
    lines.push(`  配置目录: ${profileService.getStoreLocation() || '未知'}`);
    lines.push(`  当前配置: ${currentProfile || '无'}`);
    lines.push(`  配置数量: ${profiles.length}`);

    for (const profile of profiles) {
      const isCurrent = profile.name === currentProfile;
      lines.push(`\n  ${isCurrent ? '→ ' : '  '}${profile.name} (${profile.description || '无描述'}):`);
      lines.push(`    BASE URL: ${profile.env.ANTHROPIC_BASE_URL || '❌ 未设置'}`);
      lines.push(`    TOKEN: ${profile.env.ANTHROPIC_AUTH_TOKEN ? '✓ 已设置' : '❌ 未设置'}`);
      lines.push(`    MODEL: ${profile.env.ANTHROPIC_MODEL || '⚠️ 未设置'}`);
      lines.push(`    SONNET: ${profile.env.ANTHROPIC_DEFAULT_SONNET_MODEL || '⚠️ 未设置'}`);
      lines.push(`    OPUS: ${profile.env.ANTHROPIC_DEFAULT_OPUS_MODEL || '⚠️ 未设置'}`);
      lines.push(`    HAIKU: ${profile.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '⚠️ 未设置'}`);
    }
  }

  const output = lines.join('\n');
  if (errors.length > 0) {
    return { success: false, error: output };
  }
  return { success: true, output };
}
