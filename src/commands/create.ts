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
import { defaultFieldValue } from '../domain/profileSchema.js';
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
      effortLevel: input.effortLevel,
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

  // Defaults come from the provider template, falling back to the
  // provider-level `defaultModel` (for the 3 model slots) or
  // `defaultBaseUrl` (for baseUrl). The schema's `defaultFieldValue`
  // owns the "which env key is the primary for field X" knowledge;
  // this command no longer reaches into env-key names directly.
  const token = await ctx.prompts.inputProfileField('token');
  const baseUrl = await ctx.prompts.inputProfileField('baseUrl', {
    defaultValue: defaultFieldValue(provider.envTemplate, 'baseUrl', provider.defaultBaseUrl),
  });
  const sonnetModel = await ctx.prompts.inputProfileField('sonnetModel', {
    defaultValue: defaultFieldValue(provider.envTemplate, 'sonnetModel', provider.defaultModel),
  });
  const opusModel = await ctx.prompts.inputProfileField('opusModel', {
    defaultValue: defaultFieldValue(provider.envTemplate, 'opusModel', provider.defaultModel),
  });
  const haikuModel = await ctx.prompts.inputProfileField('haikuModel', {
    defaultValue: defaultFieldValue(provider.envTemplate, 'haikuModel', provider.defaultModel),
  });
  // EFFORT is a profile-global value (not per-model). Default to whatever the
  // provider template carries (e.g. baseEnvTemplate gives 'ultracode') so a user
  // building a new profile inherits the project's recommended setting; they
  // can still pick another level here.
  const effortLevel = await ctx.prompts.inputProfileEffort(
    provider.envTemplate.CLAUDE_CODE_EFFORT_LEVEL,
  );

  return createCommand(ctx, {
    providerId: provider.id,
    profileName,
    token,
    baseUrl,
    sonnetModel,
    opusModel,
    haikuModel,
    effortLevel,
  });
}