export const AUTH_OIDC_SCOPES = ['openid', 'profile', 'offline_access'] as const;

export const GRAPH_ONEDRIVE_FILE_SCOPES = ['Files.ReadWrite'] as const;

export const AUTH_REQUEST_SCOPES = [...AUTH_OIDC_SCOPES, ...GRAPH_ONEDRIVE_FILE_SCOPES] as const;

export type AuthRequestScope = (typeof AUTH_REQUEST_SCOPES)[number];
