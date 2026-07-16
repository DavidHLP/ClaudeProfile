/**
 * Inquirer-backed interactive prompts.
 *
 * The module exposes two surfaces:
 *   1. **Per-prompt helper functions** that wrap `inquirer` calls.
 *      These are the "implementation" half of the `Prompts` interface
 *      in `commands/prompts.ts`; `realPrompts` re-binds them as
 *      methods so commands consume them through `ctx.prompts`.
 *   2. **No `selectProfileFromList` here** — the rich profile
 *      choice formatting (icon + name + description + token marker)
 *      is owned by `commands/interactiveSession.ts#defaultProfileChoice`
 *      and is wired into `runProfileAction` automatically. The
 *      previous hand-rolled copy lived here; it was a shallow
 *      pass-through that the deepening dissolves.
 *
 * Why a function-per-prompt and not one big `inquirer.prompt` call?
 * -------------------------------------------------------------------------
 * Because each prompt has its own validation policy and default
 * resolution, and several are called from command bodies that need
 * to await them individually. Centralizing the wrapping also makes
 * them mockable as a unit in the test suite (every
 * `tests/*Interactive*.test.ts` case builds a fresh `Prompts` bag
 * that returns sentinel values without touching the network).
 */
import inquirer from 'inquirer';
import { Profile, ProviderTemplate } from '../types/index.js';
import { EditableField, EDITABLE_FIELD_LABELS } from '../types/command.js';
import { EFFORT_LEVELS, PROFILE_FIELDS_ORDER, formatFieldDisplayValue } from '../domain/profileSchema.js';
import { icon, theme, padVisualEnd, stripAnsi } from './theme.js';

export async function promptInput(options: {
  message: string;
  default?: string;
  validate?: (input: string) => string | true;
}): Promise<string> {
  const { value } = await inquirer.prompt({
    type: 'input',
    name: 'value',
    message: options.message,
    default: options.default,
    validate: options.validate,
  });
  return value.trim();
}

export async function selectProvider(providers: ProviderTemplate[]): Promise<ProviderTemplate> {
  const choices = providers.map((p) => ({
    name: `${p.name} - ${p.description}`,
    value: p.id,
  }));

  const { providerId } = await inquirer.prompt({
    type: 'list',
    name: 'providerId',
    message: '请选择 API Provider:',
    choices,
  });

  return providers.find((p) => p.id === providerId)!;
}

export async function inputProfileName(defaultName: string): Promise<string> {
  return promptInput({
    message: '配置名称:',
    default: defaultName,
    validate: (input: string) => {
      if (!input.trim()) return '名称不能为空';
      if (!/^[a-zA-Z0-9-_]+$/.test(input)) return '名称只能包含字母、数字、- 和 _';
      return true;
    },
  });
}

export async function promptForNewName(defaultName: string): Promise<string | null> {
  return promptInput({
    message: '新名称:',
    default: defaultName,
    validate: (input: string) => {
      if (!input.trim()) return '名称不能为空';
      if (!/^[a-zA-Z0-9-_]+$/.test(input)) return '名称只能包含字母、数字、- 和 _';
      return true;
    },
  }).catch(() => null);
}

export async function confirmAction(message: string): Promise<boolean> {
  const { confirm } = await inquirer.prompt({
    type: 'confirm',
    name: 'confirm',
    message,
  });
  return confirm;
}

/**
 * Backup selection — the only in-module "select from a list" prompt
 * that survives the deepening. `selectProfileFromList` was removed:
 * its rich formatting (icon + name + provider + token marker) is
 * now produced by `defaultProfileChoice` in
 * `commands/interactiveSession.ts`, driven by the
 * `runSelectableAction` seam's `formatChoice` field. The
 * `BackupStore`-backed restore flow still needs a one-off list
 * prompt because each entry shows a date stamp, not a profile
 * field; it stays here as a thin wrapper.
 */
export async function selectBackup(backups: { name: string; path: string; date: Date }[]): Promise<string | null> {
  const choices = backups.map((b) => {
    const dateStr = b.date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    return {
      name: `${b.name} - ${theme.dim(dateStr)}`,
      value: b.path,
    };
  });

  const { selected } = await inquirer.prompt({
    type: 'list',
    name: 'selected',
    message: '请选择要恢复的备份:',
    choices,
  });

  return selected;
}

/**
 * Edit-field selection for a profile. Walks the canonical
 * `PROFILE_FIELDS_ORDER` list (which is the schema's `ProfileField`
 * display order) and renders each as
 *   `<label>  <current-value>`.
 *
 * Iterating from the schema rather than a hardcoded list keeps the
 * edit menu in lock-step with the schema: adding a field to
 * `PROFILE_FIELDS` automatically surfaces it in `edit`. The
 * `selectEffortLevel` prompt is reached when the user picks the
 * EFFORT row; the dispatch lives in `commands/edit.ts`.
 *
 * The current-value display is delegated to the schema's
 * `formatFieldDisplayValue` so the per-field display policy
 * (token → `[*****]`, others → effective value or `(未设置)`) lives
 * in one place.
 */
export async function selectEditField(profile: Profile): Promise<EditableField | null> {
  const fields: EditableField[] = [...PROFILE_FIELDS_ORDER];

  const labelWidth = Math.max(...fields.map((f) => stripAnsi(EDITABLE_FIELD_LABELS[f]).length));

  const fieldChoices = fields.map((f) => ({
    name: `${padVisualEnd(EDITABLE_FIELD_LABELS[f], labelWidth)}  ${theme.dim(formatFieldDisplayValue(profile.env, f))}`,
    value: f,
  }));

  const choices = [
    ...fieldChoices,
    new inquirer.Separator(),
    { name: theme.dim('取消'), value: null },
  ];

  const { field } = await inquirer.prompt({
    type: 'list',
    name: 'field',
    message: '请选择要修改的字段:',
    choices,
    pageSize: 10,
  });

  return field as EditableField | null;
}

/**
 * Effort level selector. Lists the five `EFFORT_LEVELS` in ascending
 * intensity, with a per-choice annotation showing what the level means
 * so the user can pick without consulting docs.
 *
 * `defaultValue` is matched case-insensitively against the canonical
 * `EFFORT_LEVELS`; unknown / missing values fall back to `ultracode` so the
 * user always sees a sensible highlighted choice.
 */
export async function selectEffortLevel(defaultValue?: string): Promise<string> {
  const fallback = 'ultracode';
  const normalized = defaultValue?.trim().toLowerCase();
  const defaultEffort = (EFFORT_LEVELS as readonly string[]).includes(normalized ?? '')
    ? (normalized as string)
    : fallback;

  const annotation: Record<string, string> = {
    low: '（节能/快）',
    medium: '（平衡）',
    high: '（深入）',
    max: '（最强）',
    ultracode: '（极致/默认）',
  };

  const choices = EFFORT_LEVELS.map((level) => ({
    name: `${level.padEnd(7)} ${theme.dim(annotation[level] ?? '')}`,
    value: level,
  }));

  const { effort } = await inquirer.prompt({
    type: 'list',
    name: 'effort',
    message: 'EFFORT 等级（决定 Claude Code 推理深度）:',
    choices,
    default: defaultEffort,
    pageSize: 6,
  });

  return effort as string;
}

// Re-export the icon set so embedders that used to reach into
// `ui/prompt.ts#selectProfileFromList` for its `icon` reference
// can keep the same import path.
export { icon } from './theme.js';

// Silence the unused-import warning for `icon` when an embedder
// imports it from this module: the local `icon` reference would be
// removed, but the re-export above keeps the public surface stable.
void icon;
