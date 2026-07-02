/**
 * Backward-compatible re-export shim.
 *
 * History: this file originally fused human-facing format* methods with
 * machine-facing build* (env-diff) functions behind one wide interface.
 * That coupling was shallow — the two halves had different audiences and
 * different change rates, and changing a banner color risked breaking the
 * shell-eval bridge.
 *
 * Split into:
 *   - `envRenderer`  — 19 format* methods, ANSI-wrapped, human-facing
 *   - `envDiff`      — 4 build* pure functions, machine-facing
 *
 * This file exists only to keep `import { envPresenter, buildXxx } from
 * '.../envPresenter.js'` working during the transition. New code should
 * import from the focused modules directly.
 */
export { envPresenter, type EnvPresenter } from './envRenderer.js';
export {
  buildExportCommands,
  buildSwitchCommands,
  buildExportJson,
  buildSwitchJson,
  type EnvJsonOutput,
} from '../engine/envDiff.js';
