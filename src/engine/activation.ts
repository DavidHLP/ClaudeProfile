import { EnvConfig } from '../types/index.js';
import { ProfileService } from '../services/profileService.js';

export function resolveOldEnv(
  service: ProfileService,
  sourceName: string | null,
  excludeName: string
): EnvConfig | null {
  if (!sourceName || sourceName === excludeName) {
    return null;
  }
  try {
    const oldProfile = service.getProfile(sourceName);
    return oldProfile.env;
  } catch {
    return null;
  }
}
