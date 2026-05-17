import { profileService } from '../services/profileService.js';
import { envPresenter } from '../presenters/envPresenter.js';
import { EditProfileInput, CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';

export async function editCommand(input: EditProfileInput): Promise<CommandResult> {
  return runCommand('编辑配置', async () => {
    const profile = profileService.getProfile(input.profileName);

    profile.env.ANTHROPIC_AUTH_TOKEN = input.token;
    profile.env.ANTHROPIC_BASE_URL = input.baseUrl;
    profile.env.ANTHROPIC_MODEL = input.sonnetModel;
    profile.env.ANTHROPIC_DEFAULT_SONNET_MODEL = input.sonnetModel;
    profile.env.ANTHROPIC_DEFAULT_OPUS_MODEL = input.opusModel;
    profile.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = input.haikuModel;

    profileService.saveProfile(profile);

    return { success: true, output: envPresenter.formatEditSuccess(input.profileName) };
  });
}

export async function editCommandInteractive(): Promise<CommandResult> {
  const { selectProfileFromList, inputApiToken, inputBaseUrl, inputSonnetModel, inputOpusModel, inputHaikuModel } = await import('../ui/prompt.js');

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
  const env = profile.env;

  const newToken = await inputApiToken();
  const newBaseUrl = await inputBaseUrl(env.ANTHROPIC_BASE_URL);
  const sonnetModel = await inputSonnetModel(env.ANTHROPIC_DEFAULT_SONNET_MODEL);
  const opusModel = await inputOpusModel(env.ANTHROPIC_DEFAULT_OPUS_MODEL);
  const haikuModel = await inputHaikuModel(env.ANTHROPIC_DEFAULT_HAIKU_MODEL);

  return editCommand({
    profileName: selectedName,
    token: newToken,
    baseUrl: newBaseUrl,
    sonnetModel,
    opusModel,
    haikuModel,
  });
}
