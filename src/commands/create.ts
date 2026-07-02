/**
 * Create a profile from a provider template + user-supplied credentials.
 *
 * The provider → env merge is owned by `materializeProfile` in
 * `templates/providers.ts`; this command is responsible only for
 * resolving the provider, asking for a name, and handing the
 * materialized profile to the service.
 */
import { getProviderById, materializeProfile, providerTemplates } from '../templates/providers.js';
import { CreateProfileInput, CommandResult } from '../types/command.js';
import type { CommandContext } from './context.js';
import { runCommand } from './runner.js';

export async function createCommand(ctx: CommandContext, input: CreateProfileInput): Promise<CommandResult> {
  return runCommand('创建配置', async () => {
    const provider = getProviderById(input.providerId);
    if (!provider) {
      return { success: false, error: `未知的 Provider: ${input.providerId}` };
    }

    const profile = materializeProfile(provider, {
      token: input.token,
      baseUrl: input.baseUrl,
      sonnetModel: input.sonnetModel,
      opusModel: input.opusModel,
      haikuModel: input.haikuModel,
    }, input.profileName);

    ctx.profiles.saveProfile(profile);

    const location = ctx.profiles.getStoreLocation();
    const profilePath = location ? `${location}/${input.profileName}.json` : input.profileName;
    return { success: true, output: ctx.env.formatCreateSuccess(input.profileName, profilePath) };
  });
}

export async function createCommandInteractive(ctx: CommandContext): Promise<CommandResult> {
  const provider = await ctx.prompts.selectProvider(providerTemplates);
  const profileName = await ctx.prompts.inputProfileName(provider.id);
  const token = await ctx.prompts.inputApiToken();
  const baseUrl = await ctx.prompts.inputBaseUrl(provider.defaultBaseUrl);

  const sonnetModel = await ctx.prompts.inputSonnetModel(
    provider.envTemplate.ANTHROPIC_DEFAULT_SONNET_MODEL || provider.defaultModel
  );
  const opusModel = await ctx.prompts.inputOpusModel(
    provider.envTemplate.ANTHROPIC_DEFAULT_OPUS_MODEL || provider.defaultModel
  );
  const haikuModel = await ctx.prompts.inputHaikuModel(
    provider.envTemplate.ANTHROPIC_DEFAULT_HAIKU_MODEL || provider.defaultModel
  );

  return createCommand(ctx, {
    providerId: provider.id,
    profileName,
    token,
    baseUrl,
    sonnetModel,
    opusModel,
    haikuModel,
  });
}
