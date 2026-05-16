import { Profile, EnvConfig } from '../types/index.js';
import { providerTemplates, getProviderById } from '../templates/providers.js';
import { profileService } from '../services/profileService.js';
import { envPresenter } from '../presenters/envPresenter.js';
import { CreateProfileInput, CommandResult } from '../types/command.js';
import { runCommand } from './runner.js';

export async function createCommand(input: CreateProfileInput): Promise<CommandResult> {
  return runCommand('创建配置', async () => {
    const provider = getProviderById(input.providerId);
    if (!provider) {
      return { success: false, error: `未知的 Provider: ${input.providerId}` };
    }

    const env: EnvConfig = {
      ...provider.envTemplate,
      ANTHROPIC_BASE_URL: input.baseUrl,
      ANTHROPIC_AUTH_TOKEN: input.token,
      ANTHROPIC_MODEL: input.sonnetModel,
      ANTHROPIC_DEFAULT_SONNET_MODEL: input.sonnetModel,
      ANTHROPIC_DEFAULT_OPUS_MODEL: input.opusModel,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: input.haikuModel,
    };

    const profile: Profile = {
      name: input.profileName,
      description: provider.name,
      env,
    };

    profileService.saveProfile(profile);

    const location = profileService.getStoreLocation();
    const profilePath = location ? `${location}/${input.profileName}.json` : input.profileName;
    return { success: true, output: envPresenter.formatCreateSuccess(input.profileName, profilePath) };
  });
}

export async function createCommandInteractive(): Promise<CommandResult> {
  const { selectProvider, inputProfileName, inputApiToken, inputBaseUrl, inputSonnetModel, inputOpusModel, inputHaikuModel } = await import('../ui/prompt.js');

  const provider = await selectProvider(providerTemplates);
  const profileName = await inputProfileName(provider.id);
  const token = await inputApiToken();
  const baseUrl = await inputBaseUrl(provider.defaultBaseUrl);

  const sonnetModel = await inputSonnetModel(provider.envTemplate.ANTHROPIC_DEFAULT_SONNET_MODEL || provider.defaultModel);
  const opusModel = await inputOpusModel(provider.envTemplate.ANTHROPIC_DEFAULT_OPUS_MODEL || provider.defaultModel);
  const haikuModel = await inputHaikuModel(provider.envTemplate.ANTHROPIC_DEFAULT_HAIKU_MODEL || provider.defaultModel);

  return createCommand({
    providerId: provider.id,
    profileName,
    token,
    baseUrl,
    sonnetModel,
    opusModel,
    haikuModel,
  });
}
