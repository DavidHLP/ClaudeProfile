import { EnvConfig } from '../types/index.js';
import { EditableField, EditProfileInput, CommandResult } from '../types/command.js';
import type { CommandContext } from './context.js';
import { runCommand } from './runner.js';
import { runProfileAction, CancelledError } from './interactiveSession.js';

const FIELD_TO_ENV_KEYS: Record<EditableField, readonly (keyof EnvConfig)[]> = {
  token: ['ANTHROPIC_AUTH_TOKEN'],
  baseUrl: ['ANTHROPIC_BASE_URL'],
  sonnetModel: ['ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL'],
  opusModel: ['ANTHROPIC_DEFAULT_OPUS_MODEL'],
  haikuModel: ['ANTHROPIC_DEFAULT_HAIKU_MODEL'],
};

export async function editCommand(ctx: CommandContext, input: EditProfileInput): Promise<CommandResult> {
  return runCommand('编辑配置', async () => {
    const profile = ctx.profiles.getProfile(input.profileName);

    const nextEnv: EnvConfig = { ...profile.env };
    for (const key of FIELD_TO_ENV_KEYS[input.field]) {
      nextEnv[key] = input.value;
    }

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
async function promptForEditableField(
  ctx: CommandContext,
  profile: { env: EnvConfig },
  field: EditableField
): Promise<string> {
  const env = profile.env;
  switch (field) {
    case 'token':
      return ctx.prompts.inputApiToken();
    case 'baseUrl':
      return ctx.prompts.inputBaseUrl(env.ANTHROPIC_BASE_URL);
    case 'sonnetModel':
      return ctx.prompts.inputSonnetModel(env.ANTHROPIC_DEFAULT_SONNET_MODEL || env.ANTHROPIC_MODEL);
    case 'opusModel':
      return ctx.prompts.inputOpusModel(env.ANTHROPIC_DEFAULT_OPUS_MODEL);
    case 'haikuModel':
      return ctx.prompts.inputHaikuModel(env.ANTHROPIC_DEFAULT_HAIKU_MODEL);
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
