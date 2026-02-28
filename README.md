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
- Architecture rationale, runtime flows, and milestone delivery details live in `docs/Architecture-and-Implementation-Plan.md`.

## Environment Setup

Create a `.env` file in the repository root. Use `.env.example` as the template.

Required variable:
- `VITE_AZURE_CLIENT_ID`: Microsoft Entra SPA client ID used for MSAL login.

Optional deployment variables:
- `VITE_DEPLOY_BASE_PATH`: Optional deploy path override (default target path is `/conspectus/webapp/`).
- `VITE_DEPLOY_PUBLIC_URL`: Optional full public app URL for deployment/reference tooling.

Startup validation:
- App startup fails fast when required variables are missing.
- A clear startup message is shown in the UI and explains how to fix the configuration.

## Documentation Ownership

Canonical source-of-truth by topic:
- Environment variables and defaults: this `README.md` (`## Environment Setup`).
- Module import conventions and aliases: this `README.md` (`## Architecture Modules`).
- Sync/caching model (`eTag`, `If-Match`, conflict recovery): `docs/Architecture-and-Implementation-Plan.md` (`## 3.4 Sync and Caching Strategy`).

## Security

- HTTPS only
- OAuth2 PKCE (no backend secret)
- Least-privilege Graph permissions
- Separate Microsoft account/OneDrive per user

## Related Documents

- Architecture and implementation plan: `docs/Architecture-and-Implementation-Plan.md`
- Desktop parity reference used for DB/business-rule alignment: `docs/Conspectus-Desktop-Info.md`
- MVP tracker/index of milestone issues: `docs/GitHub-Issues-MVP-Backlog.md`

## Architecture Modules

The codebase is organized into architecture-aligned module roots in `src/`:

- `auth`: authentication and token/session handling.
- `graph`: Microsoft Graph API client logic.
- `db`: SQLite/sql.js data access and write logic.
- `cache`: local cache persistence (IndexedDB/Dexie).
- `features`: UI feature modules and user workflows.
- `shared`: cross-module utilities and shared state.

Each module includes:

- `README.md` with module responsibilities.
- `index.ts` as the public barrel export.

Import convention:

- Use module-root aliases for cross-module imports:
  - `@auth`
  - `@graph`
  - `@db`
  - `@cache`
  - `@features`
  - `@shared`
- Use relative imports only for files inside the same module.

## Quality Tooling

Local quality scripts:
- `npm run format` - verifies deterministic formatting with Prettier.
- `npm run lint` - runs ESLint and fails on warnings/errors.
- `npm run test` - runs baseline unit tests with Vitest.
- `npm run test:e2e` - runs baseline Playwright app-shell smoke tests.
- `npm run typecheck` - runs Svelte + TypeScript checks in strict mode.

CI runs these checks on every push to `main` and every pull request.

## Deployment Channels

Deployment is split into two CI-gated channels:

- Branch previews (including `main`) are published to GitHub-hosted preview URLs only after the `Quality` workflow passes.
- Production deployment to `https://jon2050.de/conspectus/webapp/` is main-only and is driven by a production artifact from successful `main` builds.

Operational notes:
- Preview deployments are isolated by branch path (for example, `/previews/<branch-slug>/`) for safe parallel testing.
- Production website rollout can be enabled in a later step, but the artifact contract is part of the current deployment design.

## Issue Labeling Rules

Backlog source of truth:
- `docs/GitHub-Issues-MVP-Backlog.md`

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

## Issue Body Template

Use this as a starting point when creating GitHub issues (especially `feature` work). Keep it short, but make it actionable. MORE THAN THIS CAN ALWAYS BE ADDED IF NEEDED FOR THE ISSUE.

```md
## Context / Problem
What is the user/dev problem and why does it matter? Link any prior issues/PRs.

## Goals
- ...

## Non-Goals
- ...

## Scope
- Code areas likely touched (modules/paths): ...
- Config/infra changes (if any): ...
- Dependencies / prerequisites (if any): ...

## Proposed Approach
High-level steps or design constraints. Keep detailed implementation decisions in the PR when possible.

## Acceptance Criteria
- Observable behavior outcomes (user-visible and/or internal).
- Edge cases worth explicitly covering.

## Test Plan
- Unit/integration: ...
- E2E/manual: ...

## Notes / Rollout
- Risks, migration notes, or compatibility concerns.
- Rollout or verification steps (if relevant).
```

## Issue Delivery Workflow

Issue completion definition (required):
- All scoped code/tests/docs changes are committed and pushed.
- Local quality gates pass (`format`, `lint`, `typecheck`, `test`, `build`, and `test:e2e` when relevant).
- Required GitHub checks are green.
- If a PR is used: merge it into `main` and delete the head branch.
- If direct-main delivery is used: verify the implementation commit is on `main` (only when repository policy allows direct commits).

Do not mark an issue as done until all items above are complete.
