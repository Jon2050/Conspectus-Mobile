# Entra App Registration Contract (M3-01 + M3-02)

This document is the repository contract for:

- [#29](https://github.com/Jon2050/Conspectus-Mobile/issues/29): app registration (SPA, personal accounts)
- [#31](https://github.com/Jon2050/Conspectus-Mobile/issues/31): Graph scopes and consent documentation

Goal:

- Register one Microsoft Entra application for Conspectus-Mobile authentication.
- Configure it as a single-page application (SPA) for personal Microsoft accounts.
- Define the redirect URI contract used by local development and production.

## Required Entra Registration Settings

Create or update an app registration with the following values:

1. Supported account types:
   - `Personal Microsoft accounts only`
2. Platform configuration:
   - `Single-page application (SPA)`
3. Redirect URIs:
   - `http://localhost:5173/`
   - `https://jon2050.de/conspectus/webapp/`

Optional for GitHub Pages preview login:

- `https://jon2050.github.io/Conspectus-Mobile/previews/main/`
- `https://jon2050.github.io/Conspectus-Mobile/previews/test/`

## Frontend Configuration Contract

After registration, copy the `Application (client) ID` and configure:

1. Local development:
   - `.env` -> `VITE_AZURE_CLIENT_ID=<application-client-id>`
2. CI/CD:
   - GitHub repository variable `VITE_AZURE_CLIENT_ID=<application-client-id>`

## Graph Delegated Scope Contract (M3-02)

Authentication and Graph requests MUST use only this combined scope set:

- `openid`
- `profile`
- `offline_access`
- `Files.ReadWrite`

Scope rationale:

- `openid`: required for OpenID Connect sign-in.
- `profile`: required for basic account claims used in session UI/state.
- `offline_access`: enables refresh-token based silent session continuation.
- `Files.ReadWrite`: minimum delegated Graph permission for OneDrive DB metadata read, DB download, and conditional DB upload.

Explicitly not requested:

- `User.Read`: not required because MVP does not call Graph `/me` profile APIs.
- `Files.Read`: redundant because `Files.ReadWrite` already includes read capability.
- `Files.Read.All`, `Files.ReadWrite.All`: broader-than-required permissions.

## Consent Model

- Consent type is delegated user consent for personal Microsoft accounts.
- No tenant-wide or admin-consent scope is part of the MVP contract.
- "Scope list approved" means this document and its matching code/tests are reviewed and merged in the M3-02 PR.

## Entra Configuration and Verification Steps

Portal configuration:

1. Open the app registration.
2. Go to `API permissions`.
3. Ensure `Microsoft Graph` delegated permissions include `Files.ReadWrite`.
4. Ensure no broader `Files.*.All` permission is configured.

CLI verification (optional):

1. Run `az login` with an account that can view the app registration.
2. Run `az ad app permission list --id <application-client-id>`.
3. Confirm delegated Graph permissions include only `Files.ReadWrite` for OneDrive file operations.

Operational notes:

- The client ID is public metadata, not a secret.
- OIDC scopes (`openid`, `profile`, `offline_access`) are requested by the SPA auth flow and may not be listed as Graph API permissions in the Entra portal.

## Verification Checklist (Issue Close Gate)

- Entra app registration exists and is accessible to the project owner.
- Supported account type is set to personal Microsoft accounts only.
- SPA platform is configured.
- Both redirect URIs listed above are configured exactly.
- The same `Application (client) ID` is set in local `.env` and repository variable `VITE_AZURE_CLIENT_ID`.
- Graph delegated permission for file operations is `Files.ReadWrite`.
- Broader file permissions (`Files.Read.All`, `Files.ReadWrite.All`) are absent.
- SPA scope request contract is exactly: `openid profile offline_access Files.ReadWrite`.
