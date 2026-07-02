import { EnvConfig } from '../types/index.js';
import { EditableField, EditProfileInput, CommandResult } from '../types/command.js';
import type { CommandContext } from './context.js';
import { runCommand } from './runner.js';

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

export async function editCommandInteractive(ctx: CommandContext): Promise<CommandResult> {
  const profiles = ctx.profiles.listProfiles();
  if (profiles.length === 0) {
    return { success: false, error: '没有可编辑的配置。请先使用 create 命令创建配置。' };
  }

  const currentProfile = ctx.profiles.getCurrentProfile();
  const selectedName = await ctx.prompts.selectProfileFromList(profiles, currentProfile);

  if (!selectedName) {
    return { success: false, error: '已取消编辑。', wasCancelled: true };
  }

  const profile = ctx.profiles.getProfile(selectedName);
  const field = await ctx.prompts.selectEditField(profile);

  if (!field) {
    return { success: false, error: '已取消编辑。', wasCancelled: true };
  }

  const env = profile.env;
  let value: string;
  switch (field) {
    case 'token':
      value = await ctx.prompts.inputApiToken();
      break;
    case 'baseUrl':
      value = await ctx.prompts.inputBaseUrl(env.ANTHROPIC_BASE_URL);
      break;
    case 'sonnetModel':
      value = await ctx.prompts.inputSonnetModel(env.ANTHROPIC_DEFAULT_SONNET_MODEL || env.ANTHROPIC_MODEL);
      break;
    case 'opusModel':
      value = await ctx.prompts.inputOpusModel(env.ANTHROPIC_DEFAULT_OPUS_MODEL);
      break;
    case 'haikuModel':
      value = await ctx.prompts.inputHaikuModel(env.ANTHROPIC_DEFAULT_HAIKU_MODEL);
      break;
  }

  return editCommand(ctx, {
    profileName: selectedName,
    field,
    value,
  });
}
