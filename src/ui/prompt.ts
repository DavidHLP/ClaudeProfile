import inquirer from 'inquirer';
import { ProviderTemplate } from '../types/index.js';

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
  const { name } = await inquirer.prompt({
    type: 'input',
    name: 'name',
    message: '配置名称:',
    default: defaultName,
    validate: (input: string) => {
      if (!input.trim()) return '名称不能为空';
      if (!/^[a-zA-Z0-9-_]+$/.test(input)) return '名称只能包含字母、数字、- 和 _';
      return true;
    },
  });
  return name.trim();
}

export async function inputApiToken(): Promise<string> {
  const { token } = await inquirer.prompt({
    type: 'input',
    name: 'token',
    message: 'API Token:',
    validate: (input: string) => {
      if (!input.trim()) return 'Token 不能为空';
      return true;
    },
  });
  return token.trim();
}

export async function inputBaseUrl(defaultValue: string): Promise<string> {
  const { url } = await inquirer.prompt({
    type: 'input',
    name: 'url',
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
  return url.trim();
}

export async function inputModel(defaultValue: string): Promise<string> {
  const { model } = await inquirer.prompt({
    type: 'input',
    name: 'model',
    message: '默认模型:',
    default: defaultValue,
    validate: (input: string) => {
      if (!input.trim()) return '模型名称不能为空';
      return true;
    },
  });
  return model.trim();
}

export async function inputSonnetModel(defaultValue: string): Promise<string> {
  const { model } = await inquirer.prompt({
    type: 'input',
    name: 'model',
    message: 'SONNET 模型:',
    default: defaultValue,
    validate: (input: string) => {
      if (!input.trim()) return '模型名称不能为空';
      return true;
    },
  });
  return model.trim();
}

export async function inputOpusModel(defaultValue: string): Promise<string> {
  const { model } = await inquirer.prompt({
    type: 'input',
    name: 'model',
    message: 'OPUS 模型:',
    default: defaultValue,
    validate: (input: string) => {
      if (!input.trim()) return '模型名称不能为空';
      return true;
    },
  });
  return model.trim();
}

export async function inputHaikuModel(defaultValue: string): Promise<string> {
  const { model } = await inquirer.prompt({
    type: 'input',
    name: 'model',
    message: 'HAIKU 模型:',
    default: defaultValue,
    validate: (input: string) => {
      if (!input.trim()) return '模型名称不能为空';
      return true;
    },
  });
  return model.trim();
}

export async function confirmAction(message: string): Promise<boolean> {
  const { confirm } = await inquirer.prompt({
    type: 'confirm',
    name: 'confirm',
    message,
  });
  return confirm;
}

export async function selectExistingProfile(names: string[], currentProfile: string | null): Promise<string | null> {
  if (names.length === 0) {
    return null;
  }

  const choices = names.map((name) => ({
    name: name === currentProfile ? `${name} (当前)` : name,
    value: name,
  }));

  const { selected } = await inquirer.prompt({
    type: 'list',
    name: 'selected',
    message: '选择配置:',
    choices,
  });

  return selected;
}
