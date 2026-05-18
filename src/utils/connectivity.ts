import { AppError } from '../errors.js';

export class ApiConnectivityError extends AppError {
  constructor(
    message: string,
    url: string,
    statusCode?: number,
    statusText?: string
  ) {
    super(message, 'API_CONNECTIVITY_ERROR', { url, statusCode, statusText });
    this.name = 'ApiConnectivityError';
  }
}

export interface ConnectivityCheckOptions {
  timeoutMs?: number;
  throwOnError?: boolean;
  apiPath?: string;
}

export async function checkApiConnectivity(
  baseUrl: string,
  token: string,
  options: ConnectivityCheckOptions = {}
): Promise<boolean> {
  const { timeoutMs = 5000, throwOnError = false, apiPath = '/v1/models' } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${apiPath}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return true;
    }

    if (response.status === 401 || response.status === 403) {
      if (throwOnError) {
        throw new ApiConnectivityError(
          'Invalid or forbidden API token',
          baseUrl,
          response.status,
          response.statusText
        );
      }
      return false;
    }

    if (throwOnError) {
      throw new ApiConnectivityError(
        `API returned error status: ${response.status}`,
        baseUrl,
        response.status,
        response.statusText
      );
    }

    return false;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ApiConnectivityError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        if (throwOnError) {
          throw new ApiConnectivityError(
            `Connection timeout after ${timeoutMs}ms`,
            baseUrl
          );
        }
        return false;
      }

      if (throwOnError) {
        throw new ApiConnectivityError(
          `Failed to connect: ${error.message}`,
          baseUrl
        );
      }
      return false;
    }

    if (throwOnError) {
      throw new ApiConnectivityError(
        'Unknown error occurred',
        baseUrl
      );
    }
    return false;
  }
}
