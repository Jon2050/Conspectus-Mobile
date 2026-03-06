/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AZURE_CLIENT_ID: string;
  readonly VITE_DEPLOY_BASE_PATH?: string;
  readonly VITE_DEPLOY_PUBLIC_URL?: string;
  readonly VITE_E2E_AUTH_MOCK_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
