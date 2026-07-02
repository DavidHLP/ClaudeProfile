import { EnvConfig } from '../types/index.js';
import { EditableField, EditProfileInput, CommandResult } from '../types/command.js';
import type { CommandContext } from './context.js';
import { runCommand } from './runner.js';
import { runSelectableAction, CancelledError } from './interactiveSession.js';
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
 * using the existing env value (if any) as the default.
 *
 * The `field` dispatch is owned by the schema's `inputProfileField`
 * (via `ctx.prompts`). The schema provides the per-field label and
 * the input-time validator; `getFieldValue` provides the current
 * value as the default. This helper is the single bridge between
 * the edit command and the schema-backed prompt surface.
 */
async function promptForEditableField(
  ctx: CommandContext,
  profile: { env: EnvConfig },
  field: EditableField
): Promise<string> {
  return ctx.prompts.inputProfileField(field, {
    defaultValue: getFieldValue(profile.env, field),
  });
}

export async function editCommandInteractive(ctx: CommandContext): Promise<CommandResult> {
  return runSelectableAction(ctx, {
    verb: '编辑',
    emptyMessage: '没有可编辑的配置。请先使用 create 命令创建配置。',
    list: (c) => c.profiles.listProfiles(),
    currentKey: (c) => c.profiles.getCurrentProfile(),
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

// Re-export the schema's `PROFILE_FIELDS` so the edit command's
// per-field validation policy stays anchored to the canonical
// spec map (and not duplicated here). The export is `void`'d to
// keep the import alive for downstream readers and to silence
// the no-unused-vars lint if the import ever falls out of use.
void PROFILE_FIELDS;
