import { EnvConfig } from '../types/index.js';
import { profileService } from '../services/profileService.js';
import { envPresenter } from '../presenters/envPresenter.js';
import { EditableField, EditProfileInput, CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';

const FIELD_TO_ENV_KEYS: Record<EditableField, readonly (keyof EnvConfig)[]> = {
  token: ['ANTHROPIC_AUTH_TOKEN'],
  baseUrl: ['ANTHROPIC_BASE_URL'],
  sonnetModel: ['ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL'],
  opusModel: ['ANTHROPIC_DEFAULT_OPUS_MODEL'],
  haikuModel: ['ANTHROPIC_DEFAULT_HAIKU_MODEL'],
};

export async function editCommand(input: EditProfileInput): Promise<CommandResult> {
  return runCommand('编辑配置', async () => {
    const profile = profileService.getProfile(input.profileName);

    const nextEnv: EnvConfig = { ...profile.env };
    for (const key of FIELD_TO_ENV_KEYS[input.field]) {
      nextEnv[key] = input.value;
    }

    profileService.saveProfile({ ...profile, env: nextEnv });

    return {
      success: true,
      output: envPresenter.formatEditSuccess(input.profileName, input.field),
    };
  });
}

export async function editCommandInteractive(): Promise<CommandResult> {
  const {
    selectProfileFromList,
    selectEditField,
    inputApiToken,
    inputBaseUrl,
    inputSonnetModel,
    inputOpusModel,
    inputHaikuModel,
  } = await import('../ui/prompt.js');

  const profiles = profileService.listProfiles();
  if (profiles.length === 0) {
    return { success: false, error: '没有可编辑的配置。请先使用 create 命令创建配置。' };
  }

  const currentProfile = profileService.getCurrentProfile();
  const selectedName = await selectProfileFromList(profiles, currentProfile);

  if (!selectedName) {
    return { success: false, error: '已取消编辑。', wasCancelled: true };
  }

  const profile = profileService.getProfile(selectedName);
  const field = await selectEditField(profile);

  if (!field) {
    return { success: false, error: '已取消编辑。', wasCancelled: true };
  }

  const env = profile.env;
  let value: string;
  switch (field) {
    case 'token':
      value = await inputApiToken();
      break;
    case 'baseUrl':
      value = await inputBaseUrl(env.ANTHROPIC_BASE_URL);
      break;
    case 'sonnetModel':
      value = await inputSonnetModel(env.ANTHROPIC_DEFAULT_SONNET_MODEL || env.ANTHROPIC_MODEL);
      break;
    case 'opusModel':
      value = await inputOpusModel(env.ANTHROPIC_DEFAULT_OPUS_MODEL);
      break;
    case 'haikuModel':
      value = await inputHaikuModel(env.ANTHROPIC_DEFAULT_HAIKU_MODEL);
      break;
  }

  return editCommand({
    profileName: selectedName,
    field,
    value,
  });
}
