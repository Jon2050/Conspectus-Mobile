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

## Quality Tooling

Local quality scripts:
- `npm run format` - verifies deterministic formatting with Prettier.
- `npm run lint` - runs ESLint and fails on warnings/errors.
- `npm run typecheck` - runs Svelte + TypeScript checks in strict mode.

CI runs these checks on every push to `main` and every pull request.

## Issue Labeling Rules

Backlog source of truth:
- `GitHub-Issues-MVP-Backlog.md`

Required project labels:
- `feature`: user-visible functionality or behavior changes in the app.
- `infra`: repository, CI/CD, tooling, workflow, or deployment plumbing.
- `bug`: defect fixes for incorrect current behavior.
- `docs`: documentation-only work.
- `test`: automated test work and QA harness improvements.
- `security`: security, auth hardening, scopes, headers, dependency risk mitigation.

Usage rules:
- Apply exactly one primary label from the required project labels on each issue.
- If an issue spans multiple areas, choose the dominant work type and capture secondary concerns in the issue body.
- Assign a milestone to all milestone delivery issues (`M1-*` through `M8-*`).
- Keep project-management bootstrap issues (`PM-*`) without milestone unless explicitly planned into one.
