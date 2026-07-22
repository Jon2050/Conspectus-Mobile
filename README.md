# Conspectus-Mobile

Conspectus-Mobile is a small, modern PWA for iOS and Android to use key Conspectus features on mobile.

## Goal

Provide fast mobile access to a personal Conspectus SQLite database stored in OneDrive, without changing the desktop app.

## Core Features (MVP)

- View accounts and current balances.
- View transfers for a selected month (default: current month).
- Swipe to previous/next month.
- Add a new transfer.
- Online read access with eTag-verified cached snapshot reuse.

## Non-Goals (MVP)

- No backend server.
- No desktop app changes.
- No DB migrations in PWA.
- No offline database viewing or transfer creation.

## Tech Direction

- Svelte + TypeScript + Vite
- PWA install support
- Microsoft login (personal accounts) via MSAL
- OneDrive sync via Microsoft Graph
- SQLite in browser via sql.js
- Local cache via IndexedDB
- Durable architecture decisions, runtime flows, and safety invariants live in
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Getting Started

Use Node `>=22`.

1. Install dependencies with `npm install`.
2. Create `.env` from `.env.example`.
3. Set `VITE_AZURE_CLIENT_ID` as described in
   [docs/auth/Entra-App-Registration.md](docs/auth/Entra-App-Registration.md).
4. Run `npm run dev` and open `http://localhost:5173/`.

## Environment Setup

Create a `.env` file in the repository root. Use `.env.example` as the template.
Before setting env values, complete the Entra registration contract in
[docs/auth/Entra-App-Registration.md](docs/auth/Entra-App-Registration.md).

Required variable:

- `VITE_AZURE_CLIENT_ID`: Microsoft Entra `Application (client) ID` from the SPA
  registration in [docs/auth/Entra-App-Registration.md](docs/auth/Entra-App-Registration.md).
  - CI/CD requirement: this repository variable must also be set in GitHub Actions repository variables.

Optional deployment variables:

- `VITE_DEPLOY_BASE_PATH`: Optional base-path override for non-channel builds. `npm run dev`
  always serves from `/` so its Microsoft redirect URI remains `http://localhost:5173/`.

Startup validation:

- App startup fails fast when required variables are missing.
- A clear startup message is shown in the UI and explains how to fix the configuration.

## Local Auth Testing

For real Microsoft sign-in and OneDrive browse testing, the app must run on a redirect URI that is registered in the Entra SPA app registration.

Current local contract:

- Use `http://localhost:5173/` for local auth testing.
- Run `npm run dev`. It is pinned to `localhost:5173` and fails fast if that port is already occupied.
- Open exactly `http://localhost:5173/` in the browser.
- Restart the dev server after changing `.env`; deployment base-path overrides are intentionally
  ignored by `npm run dev` so MSAL always sends the registered localhost root as `redirect_uri`.

Important:

- Entra redirect URI matching is exact.
- `http://127.0.0.1:5173/` does not match `http://localhost:5173/`.
- Preview ports such as `http://localhost:4173/` or `http://localhost:4174/` do not work for real auth unless they are also registered in Entra.
- If you want to test real auth on another local host/port, add that exact URI to the Entra SPA redirect URI list first.

## Documentation Map

Use these documents as the canonical sources for their topics:

- Project setup, environment variables, and module layout: this README.
- Architecture decisions, runtime flows, and sync/write safety invariants:
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Entra app registration, redirect URIs, and Graph delegated scopes:
  [docs/auth/Entra-App-Registration.md](docs/auth/Entra-App-Registration.md).
- CI/CD workflow behavior, artifacts, and failure modes:
  [docs/CI-CD-Pipelines.md](docs/CI-CD-Pipelines.md).
- Release branch/tag strategy, approvals, release notes, and production verification:
  [docs/Release-Process.md](docs/Release-Process.md).
- Deterministic two-repository production rollback and incident ownership:
  [docs/Production-Rollback.md](docs/Production-Rollback.md).
- Active GitHub issue backlog, status, and dependencies:
  [docs/GitHub-Issues-Backlog.md](docs/GitHub-Issues-Backlog.md).
- Desktop database and business-rule parity reference:
  [docs/Conspectus-Desktop-Info.md](docs/Conspectus-Desktop-Info.md).
- Contribution and delivery workflow for humans and coding agents:
  [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## Security

- HTTPS for hosted environments; `http://localhost:5173/` is the local development redirect URI.
- OAuth2 PKCE (no backend secret)
- Least-privilege Graph permissions
- Separate Microsoft account/OneDrive per user

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

- `npm run audit:dependencies` - reports all dependency advisories and fails on high/critical findings.
- `npm run format` - verifies deterministic formatting with Prettier.
- `npm run lint` - runs ESLint and fails on warnings/errors.
- `npm run typecheck` - runs Svelte + TypeScript checks in strict mode.
- `npm run check:dead-code` - checks for unused files, exports, and dependencies with Knip.
- `npm run test` - runs app Vitest tests plus script Vitest tests.
- `npm run build` - creates a production build in `dist/`.
- `npm run check:bundle-size` - checks an existing `dist/` against the committed JS/CSS raw and
  gzip budgets; run `npm run build` first.
- `npm run check:lighthouse -- <deployed-https-url>` - runs the mobile Lighthouse release
  gate three times against a deployed route, writes HTML/JSON reports under `reports/lighthouse`,
  and enforces the committed score and PWA deployment budgets. A local Chrome/Chromium install is
  required.
- `npm run test:e2e` - runs Playwright browser tests.
- `npm run check:local` - runs formatting, linting, type checking, dead-code analysis, tests,
  production build, and bundle-size verification in sequence.

Playwright release-gate policy:

- Local runs use zero retries so deterministic failures surface immediately.
- CI uses one retry for transient browser or runner noise and one worker because the suite shares
  the served build and service-worker files.
- CI rejects focused tests, retains traces/screenshots/videos on failure, and uploads the HTML
  report plus raw test results when the E2E job fails.
- A test that still fails after the CI retry blocks `Quality`; repeated flaky behavior must be
  fixed at its root cause instead of increasing retries.

The `Quality` workflow runs on every push to non-`gh-pages` branches. Branches whose effective diff is docs-only skip the heavy jobs.

CI test report view in GitHub:

- Open a `Quality` run and use the `Summary` tab.
- The run summary includes:
  - `Unit Test Report` (all parsed Vitest test cases from JUnit XML)
  - `E2E Test Report` (all parsed Playwright test cases from JUnit XML)

## Deployment Pipelines

- `Quality` runs on every push to non-`gh-pages` branches and is the only gate for deployments.
- `Deploy Preview` runs automatically after a successful `Quality` push run and publishes:
  - `main` to [https://jon2050.github.io/Conspectus-Mobile/previews/main/](https://jon2050.github.io/Conspectus-Mobile/previews/main/)
  - every non-`main` branch to [https://jon2050.github.io/Conspectus-Mobile/previews/test/](https://jon2050.github.io/Conspectus-Mobile/previews/test/)
- `Deploy Production` is manual, only from `main`, and deploys the current `main` commit to [https://jon2050.de/conspectus/](https://jon2050.de/conspectus/) after confirming a successful `Quality` run for that commit.
- GitHub may also show `pages-build-deployment`; that is the GitHub-managed Pages publisher for the `gh-pages` branch, not a project-owned pipeline, and it cannot be renamed in the current branch-based Pages setup.

Detailed workflow behavior, artifacts, and failure modes live in
[docs/CI-CD-Pipelines.md](docs/CI-CD-Pipelines.md).

## Contribution Workflow

The canonical issue, branch, commit, verification, review, merge, agent-collaboration, and release
workflow is maintained in [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).
