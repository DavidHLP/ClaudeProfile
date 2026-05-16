export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ProfileNotFoundError extends AppError {
  constructor(name: string) {
    super(`配置 '${name}' 不存在`, 'PROFILE_NOT_FOUND', { name });
    this.name = 'ProfileNotFoundError';
  }
}

export class ProfileAlreadyExistsError extends AppError {
  constructor(name: string) {
    super(`配置 '${name}' 已存在`, 'PROFILE_ALREADY_EXISTS', { name });
    this.name = 'ProfileAlreadyExistsError';
  }
}

export class ConfigDirectoryError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(`配置目录错误: ${message}`, 'CONFIG_DIR_ERROR', context);
    this.name = 'ConfigDirectoryError';
  }
}

export class FileOperationError extends AppError {
  constructor(operation: string, filePath: string, cause: unknown) {
    super(`文件操作失败: ${operation} ${filePath}`, 'FILE_OPERATION_ERROR', { operation, filePath, cause });
    this.name = 'FileOperationError';
  }
}
