# Conspectus-Mobile

Conspectus-Mobile is a small, modern PWA for iOS and Android to use key Conspectus features on mobile.

## Goal

Provide fast mobile access to a personal Conspectus SQLite database stored in OneDrive, without changing the desktop app.

## Core Features (MVP)

- View accounts and current balances.
- View transfers for a selected month (default: current month).
- Swipe to previous/next month.
- Add a new transfer.
- Offline viewing from cached last synced data.

## Non-Goals (MVP)

- No backend server.
- No desktop app changes.
- No DB migrations in PWA.
- No offline transfer creation.

## Tech Direction

- Svelte + TypeScript + Vite
- PWA install support
- Microsoft login (personal accounts) via MSAL
- OneDrive sync via Microsoft Graph
- SQLite in browser via sql.js
- Local cache via IndexedDB

## Sync Model

- One DB file is selected once from OneDrive.
- App checks metadata (`eTag`) and downloads only when changed.
- Adding a transfer updates the DB locally and uploads the full DB file back to OneDrive.

## Security

- HTTPS only
- OAuth2 PKCE (no backend secret)
- Least-privilege Graph permissions
- Separate Microsoft account/OneDrive per user

## Related Document

Detailed architecture and implementation plan:
- `Architecture-and-Implementation-Plan.md`
