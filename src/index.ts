export { createCommand, createCommandInteractive } from './commands/create.js';
export { editCommand, editCommandInteractive } from './commands/edit.js';
export { deleteCommand, deleteCommandInteractive } from './commands/delete.js';
export { listCommand } from './commands/list.js';
export { switchCommand, switchCommandInteractive } from './commands/switch.js';
export { exportCommand, exportCurrentCommand, type ExportProfileInput } from './commands/export.js';
export { initCommand } from './commands/init.js';

export type { CreateProfileInput, EditProfileInput, EditableField, ProfileCredentialsInput, SwitchProfileInput, DeleteProfileInput, CommandResult } from './types/command.js';
export { EDITABLE_FIELD_LABELS } from './types/command.js';
export type { ProfileService } from './services/profileService.js';
export type { EnvPresenter } from './presenters/envRenderer.js';

export { ProfileServiceImpl, profileService } from './services/profileService.js';
export { envPresenter } from './presenters/envRenderer.js';
export {
  buildExportCommands,
  buildSwitchCommands,
  buildExportJson,
  buildSwitchJson,
  type EnvJsonOutput,
} from './engine/envDiff.js';

export type { ConfigStore } from './config/configStore.js';
export { FileSystemConfigStore } from './config/fileSystemConfigStore.js';
export { InMemoryConfigStore } from './config/inMemoryConfigStore.js';
