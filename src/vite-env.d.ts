/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_BUILD_TIME_UTC__: string;

interface ImportMetaEnv {
  readonly VITE_AZURE_CLIENT_ID: string;
  readonly VITE_DEPLOY_BASE_PATH?: string;
  readonly VITE_DEPLOY_PUBLIC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
