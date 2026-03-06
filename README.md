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
Before setting env values, complete the Entra registration contract in `docs/auth/Entra-App-Registration.md`.

Required variable:

- `VITE_AZURE_CLIENT_ID`: Microsoft Entra `Application (client) ID` from the SPA registration in `docs/auth/Entra-App-Registration.md`.
  - CI/CD requirement: this repository variable must also be set in GitHub Actions repository variables.

Optional deployment variables:

- `VITE_DEPLOY_BASE_PATH`: Optional base-path override for non-channel/local builds.
- `VITE_DEPLOY_PUBLIC_URL`: Optional full public app URL for deployment/reference tooling.

Startup validation:

- App startup fails fast when required variables are missing.
- A clear startup message is shown in the UI and explains how to fix the configuration.

## Documentation Ownership

Canonical source-of-truth by topic:

- Environment variables and defaults: this `README.md` (`## Environment Setup`).
- Entra app registration contract (account type, SPA platform, redirect URIs): `docs/auth/Entra-App-Registration.md`.
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
- CI/CD workflow reference: `docs/CI-CD-Pipelines.md`
- Entra app registration runbook (`M3-01`): `docs/auth/Entra-App-Registration.md`
- M2-07 installability verification record: [#25](https://github.com/Jon2050/Conspectus-Mobile/issues/25)
- M2-08 two-repo deployment runbook record: [#27](https://github.com/Jon2050/Conspectus-Mobile/issues/27)

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

CI runs these checks on every push to non-`gh-pages` branches.

CI test report view in GitHub:

- Open a `Quality` run and use the `Summary` tab.
- The run summary includes:
  - `Unit Test Report` (all parsed Vitest test cases from JUnit XML)
  - `E2E Test Report` (all parsed Playwright test cases from JUnit XML)

## Deployment Channels

Deployment is split into preview delivery and production-artifact handoff stages:

- `Quality` remains the only gate for deploy eligibility and produces reusable verified `dist/` artifacts.
- `Deploy Preview Channel` runs only from successful `Quality` push runs (`workflow_run` trigger).
- `Publish Production Artifact` runs only from successful `Quality` push runs on `main`.
- `Deploy Production Website` is a manual workflow (`workflow_dispatch`) that deploys the already-published artifact for the current `main` commit to the website repo and runs production smoke checks.
- Fixed deployment URLs:
  - [https://jon2050.github.io/Conspectus-Mobile/previews/main/](https://jon2050.github.io/Conspectus-Mobile/previews/main/) (`main` preview slot)
  - [https://jon2050.github.io/Conspectus-Mobile/previews/test/](https://jon2050.github.io/Conspectus-Mobile/previews/test/) (shared preview slot for every non-`main` branch)
  - [https://jon2050.de/conspectus/webapp/](https://jon2050.de/conspectus/webapp/) (production)
- Successful `main` Quality runs additionally publish an immutable production artifact for website-repo consumption.

Operational notes:

- Preview builds use `DEPLOY_CHANNEL=preview` with fixed `DEPLOY_PREVIEW_SLUG` values (`main` for `main`, `test` for non-`main`) and isolate service worker scope/assets under `/<repo>/previews/<slot>/`.
- `Quality` uploads `quality-preview-dist` and `quality-production-dist`; downstream workflows reuse those artifacts instead of rebuilding.
- If MSAL login should work on GitHub Pages previews, add both fixed preview URLs
  ([https://jon2050.github.io/Conspectus-Mobile/previews/main/](https://jon2050.github.io/Conspectus-Mobile/previews/main/) and
  [https://jon2050.github.io/Conspectus-Mobile/previews/test/](https://jon2050.github.io/Conspectus-Mobile/previews/test/)) as SPA redirect URIs in Entra app registration.
- Production artifact builds use `DEPLOY_CHANNEL=production` and enforce `/conspectus/webapp/` for Vite `base`, PWA manifest `start_url`, and service worker scope.
- Failed `Quality` runs do not produce preview deployments or production artifacts.
- `Deploy Preview Channel` includes a hard post-deploy preview availability check; if GitHub Pages is unavailable or the preview URL is not reachable, the workflow fails.
- `Deploy Production Website` fails closed when the current `main` commit has no successful published production artifact, when the website consumer contract is incompatible, or when the production smoke checks do not observe the expected deploy identity.
- Production handoff dispatch requires repository secret `WEBSITE_REPO_DISPATCH_TOKEN` (scoped to trigger workflow events in the website repo).
- Production handoff target repository defaults to `Jon2050/Jon2050_Webpage` and can be overridden with repository variable `WEBSITE_REPO_FULL_NAME`.
- Canonical cross-repo producer/consumer architecture decision (M2-01): `docs/Architecture-and-Implementation-Plan.md` section `8.3`.
- Detailed workflow catalog, dependency graph, and failure behavior: `docs/CI-CD-Pipelines.md`.

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

## Commit Agent Attribution

Every commit by an AI Agent must include an `Agent:` trailer at the end of the commit message identifying who or what created it. This is enforced by a `commit-msg` hook and commits without the trailer are rejected.

Example:

```
feat: add login button

Agent: Claude
```

Valid agent names: `Claude`, `Gemini`, `Codex`, `None`, or any descriptive identifier.

This enables filtering by agent: `git log --grep="Agent: Claude"`.

## Issue Delivery Workflow

Issue completion definition (required):

- Every issue must be implemented from a dedicated issue branch and merged through a PR.
- All scoped code/tests/docs changes are committed and pushed.
- Local quality gates pass (`format`, `lint`, `typecheck`, `test`, `build`, and `test:e2e` when relevant).
- Required GitHub checks are green.
- Merge the PR into `main` and delete the head branch.

Do not mark an issue as done until all items above are complete.
