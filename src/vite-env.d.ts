/// <reference types="vite/client" />

declare const __APP_BUILD_INFO__: {
  readonly version: string;
  readonly commitSha: string | null;
  readonly buildTimeUtc: string;
};

interface ImportMetaEnv {
  readonly VITE_AZURE_CLIENT_ID: string;
  readonly VITE_DEPLOY_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
