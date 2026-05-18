import inquirer from 'inquirer';
import { ProviderTemplate, Profile } from '../types/index.js';
import { EditableField, EDITABLE_FIELD_LABELS } from '../types/command.js';
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

export async function inputApiToken(): Promise<string> {
  return promptInput({
    message: 'API Token:',
    validate: (input: string) => {
      if (!input.trim()) return 'Token 不能为空';
      return true;
    },
  });
}

export async function inputBaseUrl(defaultValue?: string): Promise<string> {
  return promptInput({
    message: 'API Base URL:',
    default: defaultValue,
    validate: (input: string) => {
      if (!input.trim()) return 'URL 不能为空';
      if (!input.startsWith('http://') && !input.startsWith('https://')) {
        return 'URL 必须以 http:// 或 https:// 开头';
      }
      return true;
    },
  });
}

export async function inputSonnetModel(defaultValue?: string): Promise<string> {
  return promptInput({
    message: 'SONNET 模型:',
    default: defaultValue,
    validate: (input: string) => {
      if (!input.trim()) return '模型名称不能为空';
      return true;
    },
  });
}

export async function inputOpusModel(defaultValue?: string): Promise<string> {
  return promptInput({
    message: 'OPUS 模型:',
    default: defaultValue,
    validate: (input: string) => {
      if (!input.trim()) return '模型名称不能为空';
      return true;
    },
  });
}

export async function inputHaikuModel(defaultValue?: string): Promise<string> {
  return promptInput({
    message: 'HAIKU 模型:',
    default: defaultValue,
    validate: (input: string) => {
      if (!input.trim()) return '模型名称不能为空';
      return true;
    },
  });
}

export async function confirmAction(message: string): Promise<boolean> {
  const { confirm } = await inquirer.prompt({
    type: 'confirm',
    name: 'confirm',
    message,
  });
  return confirm;
}

export async function selectProfileFromList(profiles: Profile[], currentProfile: string | null): Promise<string | null> {
  if (profiles.length === 0) {
    return null;
  }

  const choices = profiles.map((p) => {
    const isActive = p.name === currentProfile;
    const statusIcon = isActive ? icon.active : icon.standby;
    const provider = p.description || 'Unknown';
    const apiKey = p.env.ANTHROPIC_AUTH_TOKEN ? '[*****]' : '[UNSET]';
    return {
      name: `${statusIcon} ${p.name} — ${provider} ${apiKey}`,
      value: p.name,
    };
  });

  const currentIndex = currentProfile ? profiles.findIndex((p) => p.name === currentProfile) : 0;

  const { selected } = await inquirer.prompt({
    type: 'list',
    name: 'selected',
    message: '请选择配置:',
    choices,
    default: currentIndex >= 0 ? currentIndex : 0,
  });

  return selected;
}

function describeFieldValue(field: EditableField, profile: Profile): string {
  const env = profile.env;
  switch (field) {
    case 'token':
      return env.ANTHROPIC_AUTH_TOKEN ? '[*****]' : '[UNSET]';
    case 'baseUrl':
      return env.ANTHROPIC_BASE_URL || '(未设置)';
    case 'sonnetModel':
      return env.ANTHROPIC_DEFAULT_SONNET_MODEL || env.ANTHROPIC_MODEL || '(未设置)';
    case 'opusModel':
      return env.ANTHROPIC_DEFAULT_OPUS_MODEL || '(未设置)';
    case 'haikuModel':
      return env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '(未设置)';
  }
}

export async function selectEditField(profile: Profile): Promise<EditableField | null> {
  const fields: EditableField[] = ['token', 'baseUrl', 'sonnetModel', 'opusModel', 'haikuModel'];

  const labelWidth = Math.max(...fields.map((f) => stripAnsi(EDITABLE_FIELD_LABELS[f]).length));

  const fieldChoices = fields.map((f) => ({
    name: `${padVisualEnd(EDITABLE_FIELD_LABELS[f], labelWidth)}  ${theme.dim(describeFieldValue(f, profile))}`,
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
