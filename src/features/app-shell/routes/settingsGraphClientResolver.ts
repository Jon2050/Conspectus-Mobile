// Re-exports the shared app Graph client resolver for the Settings route.
import { resolveAppGraphClient } from '../graphClientResolver';

export const resolveSettingsGraphClient = resolveAppGraphClient;
