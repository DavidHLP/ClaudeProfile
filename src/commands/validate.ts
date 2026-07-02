import { CommandResult } from '../types/command.js';
import { Profile } from '../types/index.js';
import type { CommandContext } from './context.js';
import { validateProfile, ValidationIssue as SchemaIssue } from '../domain/profileSchema.js';

export interface ValidateOptions {
  verbose?: boolean;
}

/**
 * The legacy `ValidationIssue` shape kept the `profile` field attached
 * to each issue (set by the command when iterating profiles). The
 * schema's issue is profile-free by design (it's a pure function over
 * env), so we adapt it here.
 */
interface ValidationIssue extends SchemaIssue {
  profile: string;
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
    const issues = validateProfile(profile.env);
    for (const issue of issues) {
      allIssues.push({ ...issue, profile: profile.name });
    }
  }

  const errors = allIssues.filter((i) => i.severity === 'error');
  const warnings = allIssues.filter((i) => i.severity === 'warning');

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
      lines.push(`  • [${issue.profile}] ${issue.envKey}: ${issue.message}`);
    }
  }

  if (warnings.length > 0) {
    lines.push(`⚠️  发现 ${warnings.length} 个警告:`);
    for (const issue of warnings) {
      lines.push(`  • [${issue.profile}] ${issue.envKey}: ${issue.message}`);
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
