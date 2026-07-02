import { EnvConfig } from '../types/index.js';
import { EditableField, EditProfileInput, CommandResult } from '../types/command.js';
import type { CommandContext } from './context.js';
import { runCommand } from './runner.js';
import { runProfileAction, CancelledError } from './interactiveSession.js';
import { applyField, getFieldValue, PROFILE_FIELDS } from '../domain/profileSchema.js';

export async function editCommand(ctx: CommandContext, input: EditProfileInput): Promise<CommandResult> {
  return runCommand('编辑配置', async () => {
    const profile = ctx.profiles.getProfile(input.profileName);

    // `applyField` writes to every env key the field owns (e.g. SONNET
    // writes to both `ANTHROPIC_DEFAULT_SONNET_MODEL` and the legacy
    // `ANTHROPIC_MODEL`). The schema is the single source of truth for
    // which env keys each field controls; this command no longer
    // duplicates that mapping.
    const nextEnv = applyField(profile.env, input.field, input.value);

    ctx.profiles.saveProfile({ ...profile, env: nextEnv });

    return {
      success: true,
      output: ctx.env.formatEditSuccess(input.profileName, input.field),
    };
  });
}

/**
 * Prompt the user for the new value of a specific editable field,
 * using the existing env value (if any) as the default. Pulled out
 * of the interactive command so the same logic is shared with any
 * future batch-edit / scripted path without touching the run/select
 * flow.
 */
/**
 * Prompt the user for the new value of a specific editable field,
 * using the existing env value (if any) as the default. Reads the
 * field's current value via `getFieldValue` from the schema, so the
 * "which env key is the primary for field X" knowledge lives in
 * exactly one place.
 */
async function promptForEditableField(
  ctx: CommandContext,
  profile: { env: EnvConfig },
  field: EditableField
): Promise<string> {
  const env = profile.env;
  const current = getFieldValue(env, field);
  // The schema still owns the per-field prompt choice. We branch on
  // `field` here because each prompt method enforces a different
  // shape (e.g. `inputApiToken` has no default, the model prompts
  // have string defaults) — collapsing to a single generic would
  // require extending the `Prompts` interface, which is out of
  // scope for this deepening. The point of the schema is to
  // consolidate the *env* shape; the prompt surface stays separate.
  switch (field) {
    case 'token':
      return ctx.prompts.inputApiToken();
    case 'baseUrl':
      return ctx.prompts.inputBaseUrl(current);
    case 'sonnetModel':
      return ctx.prompts.inputSonnetModel(current);
    case 'opusModel':
      return ctx.prompts.inputOpusModel(current);
    case 'haikuModel':
      return ctx.prompts.inputHaikuModel(current);
  }
}

export async function editCommandInteractive(ctx: CommandContext): Promise<CommandResult> {
  return runProfileAction<EditProfileInput>(ctx, {
    verb: '编辑',
    emptyMessage: '没有可编辑的配置。请先使用 create 命令创建配置。',
    // No `confirm` — `edit` is non-destructive; the user already
    // walked through field selection, so the "are you sure" step
    // would just be friction.
    buildInput: async (selected, ctx) => {
      const field = await ctx.prompts.selectEditField(selected);
      if (!field) {
        throw new CancelledError('编辑');
      }
      const value = await promptForEditableField(ctx, selected, field);
      return { profileName: selected.name, field, value };
    },
    execute: editCommand,
  });
}
