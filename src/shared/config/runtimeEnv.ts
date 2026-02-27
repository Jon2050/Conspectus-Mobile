export const REQUIRED_RUNTIME_ENV_KEYS = ['VITE_AZURE_CLIENT_ID'] as const;
export const OPTIONAL_RUNTIME_ENV_KEYS = [
  'VITE_DEPLOY_BASE_PATH',
  'VITE_DEPLOY_PUBLIC_URL',
] as const;

type RequiredRuntimeEnvKey = (typeof REQUIRED_RUNTIME_ENV_KEYS)[number];

export interface RuntimeEnvSource {
  VITE_AZURE_CLIENT_ID?: string;
  VITE_DEPLOY_BASE_PATH?: string;
  VITE_DEPLOY_PUBLIC_URL?: string;
}

export interface RuntimeEnv {
  VITE_AZURE_CLIENT_ID: string;
  VITE_DEPLOY_BASE_PATH?: string;
  VITE_DEPLOY_PUBLIC_URL?: string;
}

export class RuntimeEnvError extends Error {
  readonly missingKeys: ReadonlyArray<RequiredRuntimeEnvKey>;

  constructor(missingKeys: ReadonlyArray<RequiredRuntimeEnvKey>) {
    const joinedKeys = missingKeys.join(', ');
    super(
      `Missing required environment variable(s): ${joinedKeys}. Add them to your .env file (see .env.example) and restart the app.`,
    );
    this.name = 'RuntimeEnvError';
    this.missingKeys = [...missingKeys];
  }
}

const normalizeEnvValue = (value: string | undefined): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
};

export const loadRuntimeEnv = (source: RuntimeEnvSource = import.meta.env): RuntimeEnv => {
  const azureClientId = normalizeEnvValue(source.VITE_AZURE_CLIENT_ID);
  if (!azureClientId) {
    throw new RuntimeEnvError(['VITE_AZURE_CLIENT_ID']);
  }

  const deployBasePath = normalizeEnvValue(source.VITE_DEPLOY_BASE_PATH);
  const deployPublicUrl = normalizeEnvValue(source.VITE_DEPLOY_PUBLIC_URL);

  return {
    VITE_AZURE_CLIENT_ID: azureClientId,
    ...(deployBasePath ? { VITE_DEPLOY_BASE_PATH: deployBasePath } : {}),
    ...(deployPublicUrl ? { VITE_DEPLOY_PUBLIC_URL: deployPublicUrl } : {}),
  };
};
