# M3-01 Entra App Registration (SPA, Personal Accounts)

This document is the repository contract for issue [#29](https://github.com/Jon2050/Conspectus-Mobile/issues/29).

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

## Frontend Configuration Contract

After registration, copy the `Application (client) ID` and configure:

1. Local development:
   - `.env` -> `VITE_AZURE_CLIENT_ID=<application-client-id>`
2. CI/CD:
   - GitHub repository variable `VITE_AZURE_CLIENT_ID=<application-client-id>`

Notes:

- The client ID is public metadata, not a secret.
- Graph API delegated scopes and consent details are handled in `M3-02` (issue [#31](https://github.com/Jon2050/Conspectus-Mobile/issues/31)).

## Verification Checklist (Issue Close Gate)

- Entra app registration exists and is accessible to the project owner.
- Supported account type is set to personal Microsoft accounts only.
- SPA platform is configured.
- Both redirect URIs listed above are configured exactly.
- The same `Application (client) ID` is set in local `.env` and repository variable `VITE_AZURE_CLIENT_ID`.
