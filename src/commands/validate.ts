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
      // never drift apart. The verbose header and the issue block are
      // both owned by EnvPresenter (ADR-0005); this command only
      // supplies the data and the surrounding spacing.
      const detailBlocks = profiles.map((profile) =>
        ctx.env.formatProfileDetail(profile, profile.name === currentProfile)
      );
      const header = ctx.env.formatVerboseHeader({
        storeLocation: ctx.profiles.getStoreLocation(),
        currentProfile,
        profileCount: profiles.length,
      });
      return {
        success: true,
        output: `验证通过：${profiles.length} 个配置检查无误\n\n${header}\n\n${detailBlocks.join('\n\n')}`,
      };
    }
    return {
      success: true,
      output: `验证通过：${profiles.length} 个配置检查无误`,
    };
  }

  // Issue block (errors + warnings) is owned by EnvPresenter (ADR-0005).
  // The empty-string elements between blocks preserve the original
  // blank-line spacing (one blank line between sections).
  lines.push(ctx.env.formatValidationIssues(allIssues));

  if (options.verbose) {
    // Even on failure, surface the per-profile detail so users can
    // see what each profile actually contains.
    const detailBlocks = profiles.map((profile) =>
      ctx.env.formatProfileDetail(profile, profile.name === currentProfile)
    );
    lines.push('');
    lines.push(ctx.env.formatVerboseHeader({
      storeLocation: ctx.profiles.getStoreLocation(),
      currentProfile,
      profileCount: profiles.length,
    }));
    lines.push('');
    lines.push(...detailBlocks);
  }

  const output = lines.join('\n');
  if (errors.length > 0) {
    return { success: false, error: output };
  }
  return { success: true, output };
}
