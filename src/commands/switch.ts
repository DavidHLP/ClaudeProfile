import { buildSwitchCommands } from '../engine/envDiff.js';
import { SwitchProfileInput, CommandResult } from '../types/command.js';
import { resolveOldEnv } from '../engine/activation.js';
import { runCommand } from './runner.js';
import type { CommandContext } from './context.js';
import { runSelectableAction } from './interactiveSession.js';

export async function switchCommand(ctx: CommandContext, input: SwitchProfileInput): Promise<CommandResult> {
  return runCommand('切换配置', async () => {
    const currentProfileName = ctx.profiles.getCurrentProfile();
    const oldEnv = resolveOldEnv(ctx.profiles, currentProfileName, input.profileName);

    const profile = ctx.profiles.getProfile(input.profileName);

    if (input.dryRun) {
      return {
        success: true,
        output: `【dry-run】将切换配置 '${input.profileName}'\n环境变量: ${Object.keys(profile.env).join(', ')}`,
      };
    }

    ctx.profiles.setCurrentProfile(input.profileName);

    // TTY → banner; non-TTY → pure `export`/`unset` lines for the
    // shell-hook's safe-eval bridge to inject into the current shell.
    const output = ctx.isTTY
      ? ctx.env.formatSwitchSuccess(input.profileName, profile.env)
      : buildSwitchCommands(oldEnv, profile.env);

    return { success: true, output };
  });
}

export async function switchCommandInteractive(ctx: CommandContext): Promise<CommandResult> {
  // Pre-flight that is *not* about list selection: 0 profiles is its
  // own message (and doesn't need the banner). Everything else —
  // the single-profile shortcut, the prompt, the "save previous
  // profile" side effect, and the dispatch to `switchCommand` —
  // goes through the `runSelectableAction` seam.
  const profiles = ctx.profiles.listProfiles();
  if (profiles.length === 0) {
    return { success: false, error: '没有可用的配置。请先使用 create 命令创建配置。' };
  }

  // TTY banner is part of the interactive UX; the standard flow
  // would otherwise just show the "select profile" prompt.
  console.log(ctx.env.formatBanner());

  const currentProfile = ctx.profiles.getCurrentProfile();
  return runSelectableAction<typeof profiles[number], SwitchProfileInput>(ctx, {
    verb: '切换',
    emptyMessage: '没有可用的配置。请先使用 create 命令创建配置。',
    // The seam's pre-flight: when there's exactly one profile and
    // it's already the current one, skip the prompt entirely. This
    // replaces the hand-rolled `profiles.length === 1 && profiles[0].name === currentProfile`
    // pre-flight that used to live here.
    skipSelectionWhenSingleMatch: true,
    list: (c) => c.profiles.listProfiles(),
    currentKey: (c) => c.profiles.getCurrentProfile(),
    buildInput: async (selected, c) => {
      // Save the old profile name so `export --current` can diff
      // against it on the next call. `switchCommand` itself does
      // not touch the previous-profile marker; only this
      // interactive entry does.
      c.profiles.setPreviousProfile(currentProfile);
      return { profileName: selected.name };
    },
    execute: switchCommand,
  });
}
