# Conspectus-Mobile - GitHub Issues (MVP)

This document is the lightweight MVP issue index/tracker aligned to the milestone plan.
Scope includes only MVP.
Detailed implementation steps and acceptance criteria must live in the corresponding GitHub issue for each entry.
For each backlog entry below, open the linked GitHub issue for detailed implementation guidance and acceptance criteria.

## Issue Status Legend

- `:green_circle:` Open
- `:yellow_circle:` In Progress
- `:white_check_mark:` Done

Update each issue heading status marker to reflect current status.

## Completion Rule

An issue is only considered done when:
1. The implementation reaches `main` via a merged PR from a dedicated issue branch.
2. Required CI checks are green for the merged/pushed commit.
3. The issue branch is deleted after merge.
4. The corresponding backlog status marker is updated to `:white_check_mark:`.

## Label Set (create first)

- `feature`
- `infra`
- `bug`
- `docs`
- `test`
- `security`

## GitHub Milestones (create first)

- `M1 - Foundation`
- `M2 - Website Integration + Early Deploy`
- `M3 - Auth + OneDrive Binding`
- `M4 - Sync Engine + Cache`
- `M5 - Accounts + Transfers Read UX`
- `M6 - Add Transfer Write Path`
- `M7 - Settings + Recovery`
- `M8 - Hardening + QA + Release`

## Project Setup Issues

### :white_check_mark: PM-01 Create milestone and label taxonomy
- Label: `infra`
- Milestone: `none`
- Summary: Work includes all milestones listed above and all labels listed above. It also covers usage rules in repo docs.
- Depends on: `none`
- GitHub: [#1](https://github.com/Jon2050/Conspectus-Mobile/issues/1)

### :white_check_mark: PM-02 Create issue templates
- Label: `infra`
- Milestone: `none`
- Summary: Work includes templates for feature, bug, infra, test and Include required sections: context, tasks, acceptance criteria, test plan. It also covers default labels and milestone placeholders.
- Depends on: `PM-01`
- GitHub: [#2](https://github.com/Jon2050/Conspectus-Mobile/issues/2)

### :white_check_mark: PM-03 Create PR template with QS checklist
- Label: `infra`
- Milestone: `none`
- Summary: Work includes PR template with checks for lint, typecheck, tests, screenshots, and risk notes and "no secrets" and "no breaking path/base URL" checks. It also covers Require linked issue ID.
- Depends on: `PM-01`
- GitHub: [#3](https://github.com/Jon2050/Conspectus-Mobile/issues/3)

### :white_check_mark: PM-04 Configure branch protection and required checks
- Label: `infra`
- Milestone: `none`
- Summary: Work includes Protect main and Require status checks for lint, typecheck, unit tests, build. It also covers direct pushes to main.
- Depends on: `PM-03`
- GitHub: [#4](https://github.com/Jon2050/Conspectus-Mobile/issues/4)

### :white_check_mark: M1-01 Bootstrap Svelte + TypeScript + Vite app
- Label: `feature`
- Milestone: `M1 - Foundation`
- Summary: Work includes Initialize app with Svelte + TypeScript and Standardize npm scripts (dev, build, preview, lint, test, typecheck). It also covers Commit baseline app shell.
- Depends on: `PM-01`
- GitHub: [#5](https://github.com/Jon2050/Conspectus-Mobile/issues/5)

### :white_check_mark: M1-02 Configure code quality tooling
- Label: `infra`
- Milestone: `M1 - Foundation`
- Summary: Work includes ESLint + Prettier and strict TypeScript settings. It also covers scripts and fail-on-error behavior.
- Depends on: `M1-01`
- GitHub: [#6](https://github.com/Jon2050/Conspectus-Mobile/issues/6)

### :white_check_mark: M1-03 Add Vitest baseline
- Label: `test`
- Milestone: `M1 - Foundation`
- Summary: Work includes Vitest config and first smoke tests for utils and state store. It also covers test command into CI.
- Depends on: `M1-01`
- GitHub: [#7](https://github.com/Jon2050/Conspectus-Mobile/issues/7)

### :white_check_mark: M1-04 Add Playwright baseline
- Label: `test`
- Milestone: `M1 - Foundation`
- Summary: Work includes Playwright config and browser install step and one app-shell smoke test. It also covers traces/screenshots on failure.
- Depends on: `M1-01`
- GitHub: [#8](https://github.com/Jon2050/Conspectus-Mobile/issues/8)

### :white_check_mark: M1-05 Configure vite-plugin-pwa and manifest
- Label: `feature`
- Milestone: `M1 - Foundation`
- Summary: Work includes vite-plugin-pwa and manifest name, icons, theme color, display mode. It also covers Register service worker in app shell.
- Depends on: `M1-01`
- GitHub: [#9](https://github.com/Jon2050/Conspectus-Mobile/issues/9)

### :white_check_mark: M1-06 Prepare app architecture folders
- Label: `infra`
- Milestone: `M1 - Foundation`
- Summary: Work includes folders: auth, graph, db, cache, features, shared and index/barrel conventions and import aliases. It also covers README per module with responsibilities.
- Depends on: `M1-01`
- GitHub: [#10](https://github.com/Jon2050/Conspectus-Mobile/issues/10)

### :white_check_mark: M1-07 Add environment handling
- Label: `infra`
- Milestone: `M1 - Foundation`
- Summary: Work includes required env vars (VITE_AZURE_CLIENT_ID and optional deployment vars) and runtime validation and friendly startup error. It also covers .env.example.
- Depends on: `M1-01`
- GitHub: [#11](https://github.com/Jon2050/Conspectus-Mobile/issues/11)

### :white_check_mark: M1-08 Create baseline CI workflow
- Label: `infra`
- Milestone: `M1 - Foundation`
- Summary: Work includes GitHub Actions workflow for install, lint, typecheck, test, build and Enable caching for npm dependencies. It also covers test artifacts on failure.
- Depends on: `M1-02, M1-03, M1-04`
- GitHub: [#12](https://github.com/Jon2050/Conspectus-Mobile/issues/12)

### :white_check_mark: M1-09 Build initial mobile-first app shell
- Label: `feature`
- Milestone: `M1 - Foundation`
- Summary: Work includes base layout with navigation placeholders and route placeholders: Accounts, Transfers, Add, Settings. It also covers loading and error boundary placeholder components.
- Depends on: `M1-01`
- GitHub: [#13](https://github.com/Jon2050/Conspectus-Mobile/issues/13)

### :white_check_mark: M2-00 Define branch preview + main-only production deployment architecture
- Label: `infra`
- Milestone: `M2 - Website Integration + Early Deploy`
- Summary: Work includes Every successful branch push creates or updates a branch-specific preview URL on GitHub-hosted pages and Failed quality runs do not deploy previews or production artifacts. It also covers Successful main runs additionally produce a production-ready artifact for website-repo consumption.
- Depends on: `M1-08`
- GitHub: [#94](https://github.com/Jon2050/Conspectus-Mobile/issues/94)

### :white_check_mark: M2-01 Decide cross-repo deployment architecture
- Label: `infra`
- Milestone: `M2 - Website Integration + Early Deploy`
- Summary: Work includes options: artifact handoff, submodule, subtree, package pull and one strategy and document rationale. It also covers failure/rollback behavior for the chosen strategy.
- Depends on: `M1-08, M2-00`
- GitHub: [#14](https://github.com/Jon2050/Conspectus-Mobile/issues/14)

### :white_check_mark: M2-02 Configure Vite base path for `/conspectus/webapp/`
- Label: `feature`
- Milestone: `M2 - Website Integration + Early Deploy`
- Summary: Work includes production base path to /conspectus/webapp/ and routes, assets, manifest, and service worker scope. It also covers tests for generated asset URLs.
- Depends on: `M2-01`
- GitHub: [#15](https://github.com/Jon2050/Conspectus-Mobile/issues/15)

### :green_circle: M2-03 Create PWA deploy workflow in PWA repo
- Label: `infra`
- Milestone: `M2 - Website Integration + Early Deploy`
- Summary: Work includes production bundle in CI and artifact for website repo consumption. It also covers Tag artifact with commit SHA and timestamp.
- Depends on: `M2-01, M2-02`
- GitHub: [#17](https://github.com/Jon2050/Conspectus-Mobile/issues/17)

### :green_circle: M2-04 Integrate PWA artifact consumption in website repo CI
- Label: `infra`
- Milestone: `M2 - Website Integration + Early Deploy`
- Summary: Work includes CI job in website repo to fetch approved PWA artifact and files to conspectus/webapp/ output location. It also covers Enforce atomic replace behavior.
- Depends on: `M2-03`
- GitHub: [#19](https://github.com/Jon2050/Conspectus-Mobile/issues/19)

### :green_circle: M2-05 Add deployment smoke checks in website pipeline
- Label: `test`
- Milestone: `M2 - Website Integration + Early Deploy`
- Summary: Work includes HTTP checks for app route, manifest, and service worker URLs and HTML response sanity check for app bootstrap. It also covers Fail deploy if checks fail.
- Depends on: `M2-04`
- GitHub: [#21](https://github.com/Jon2050/Conspectus-Mobile/issues/21)

### :green_circle: M2-06 Add early public test page/link
- Label: `feature`
- Milestone: `M2 - Website Integration + Early Deploy`
- Summary: Work includes website link entry for the PWA route and temporary "beta" marker if needed. It also covers routing from landing page to app path.
- Depends on: `M2-04`
- GitHub: [#23](https://github.com/Jon2050/Conspectus-Mobile/issues/23)

### :green_circle: M2-07 Verify iOS and Android installability on production URL
- Label: `test`
- Milestone: `M2 - Website Integration + Early Deploy`
- Summary: Work includes Add to Home Screen flow on iOS Safari and Android Chrome and install icon uses the Conspectus moneybag assets (public/icons/moneysack.ico and.... It also covers Record issues with screenshots.
- Depends on: `M2-05, M2-06`
- GitHub: [#25](https://github.com/Jon2050/Conspectus-Mobile/issues/25)

### :green_circle: M2-08 Add deployment runbook for two-repo flow
- Label: `docs`
- Milestone: `M2 - Website Integration + Early Deploy`
- Summary: Work includes trigger conditions for deploy and rollback steps and owner responsibilities. It also covers how to hotfix only PWA without full website regression.
- Depends on: `M2-04, M2-05`
- GitHub: [#27](https://github.com/Jon2050/Conspectus-Mobile/issues/27)

### :green_circle: M3-01 Create Microsoft Entra app registration (SPA, personal accounts)
- Label: `feature`
- Milestone: `M3 - Auth + OneDrive Binding`
- Summary: Work includes app registration for SPA and account type for personal Microsoft accounts. It also covers local and production redirect URIs.
- Depends on: `M1-07`
- GitHub: [#29](https://github.com/Jon2050/Conspectus-Mobile/issues/29)

### :green_circle: M3-02 Configure Graph scopes and consent documentation
- Label: `security`
- Milestone: `M3 - Auth + OneDrive Binding`
- Summary: Work includes least-privilege delegated scopes required for file read/write and scopes in Entra app. It also covers consent and rationale.
- Depends on: `M3-01`
- GitHub: [#31](https://github.com/Jon2050/Conspectus-Mobile/issues/31)

### :green_circle: M3-03 Implement MSAL bootstrap module
- Label: `feature`
- Milestone: `M3 - Auth + OneDrive Binding`
- Summary: Work includes MSAL initialization with PKCE flow and token acquisition helper with silent-first strategy. It also covers account selection and active account restoration.
- Depends on: `M3-01`
- GitHub: [#33](https://github.com/Jon2050/Conspectus-Mobile/issues/33)

### :green_circle: M3-04 Build sign-in/sign-out UX
- Label: `feature`
- Milestone: `M3 - Auth + OneDrive Binding`
- Summary: Work includes sign-in and sign-out actions to UI and loading and error states for auth operations. It also covers current signed-in account summary.
- Depends on: `M3-03`
- GitHub: [#35](https://github.com/Jon2050/Conspectus-Mobile/issues/35)

### :green_circle: M3-05 Implement Graph client wrapper
- Label: `feature`
- Milestone: `M3 - Auth + OneDrive Binding`
- Summary: Work includes typed wrapper for Graph API calls used by MVP and Inject bearer tokens from auth module. It also covers Normalize error mapping for UI handling.
- Depends on: `M3-03`
- GitHub: [#37](https://github.com/Jon2050/Conspectus-Mobile/issues/37)

### :green_circle: M3-06 Implement OneDrive file selection flow
- Label: `feature`
- Milestone: `M3 - Auth + OneDrive Binding`
- Summary: Work includes file browse/select for .db target and Capture driveId, itemId, file name, and parentReference (folder path). It also covers Validate selection data before storing.
- Depends on: `M3-05`
- GitHub: [#39](https://github.com/Jon2050/Conspectus-Mobile/issues/39)

### :green_circle: M3-07 Persist binding in local storage layer
- Label: `feature`
- Milestone: `M3 - Auth + OneDrive Binding`
- Summary: Work includes selected file identifiers (driveId, itemId, name, parentReference/path) and binding at startup. It also covers schema versioning for local metadata store.
- Depends on: `M3-06`
- GitHub: [#41](https://github.com/Jon2050/Conspectus-Mobile/issues/41)

### :green_circle: M3-08 Add settings actions for rebind and local reset
- Label: `feature`
- Milestone: `M3 - Auth + OneDrive Binding`
- Summary: Work includes "Change DB file" action and "Reset local app data" action. It also covers confirmation dialogs for destructive local resets.
- Depends on: `M3-07`
- GitHub: [#43](https://github.com/Jon2050/Conspectus-Mobile/issues/43)

### :green_circle: M3-09 Add auth and binding integration tests
- Label: `test`
- Milestone: `M3 - Auth + OneDrive Binding`
- Summary: Work includes tests for login state transitions and tests for binding persistence and reload. It also covers tests for failed token and failed selection flows.
- Depends on: `M3-04, M3-06, M3-07`
- GitHub: [#45](https://github.com/Jon2050/Conspectus-Mobile/issues/45)

### :green_circle: M4-01 Define Dexie schema for DB cache and metadata
- Label: `feature`
- Milestone: `M4 - Sync Engine + Cache`
- Summary: Work includes stores for DB bytes and sync metadata and Include keys for driveId, itemId, eTag, and lastSyncAt. It also covers migration strategy for future schema updates.
- Depends on: `M3-07`
- GitHub: [#47](https://github.com/Jon2050/Conspectus-Mobile/issues/47)

### :green_circle: M4-02 Implement Graph metadata fetch (`eTag` and file info)
- Label: `feature`
- Milestone: `M4 - Sync Engine + Cache`
- Summary: Work includes file metadata for bound item and Extract and validate eTag. It also covers Graph metadata errors.
- Depends on: `M3-05`
- GitHub: [#48](https://github.com/Jon2050/Conspectus-Mobile/issues/48)

### :green_circle: M4-03 Implement file download and cache write
- Label: `feature`
- Milestone: `M4 - Sync Engine + Cache`
- Summary: Work includes Download DB bytes from Graph and bytes and metadata in cache. It also covers byte integrity before marking sync complete.
- Depends on: `M4-01, M4-02`
- GitHub: [#49](https://github.com/Jon2050/Conspectus-Mobile/issues/49)

### :green_circle: M4-04 Implement startup freshness decision tree
- Label: `feature`
- Milestone: `M4 - Sync Engine + Cache`
- Summary: Work includes branches: online unchanged, online changed, offline with cache, offline no cache and deterministic state outputs. It also covers telemetry/logging in development mode.
- Depends on: `M4-02, M4-03`
- GitHub: [#50](https://github.com/Jon2050/Conspectus-Mobile/issues/50)

### :green_circle: M4-05 Implement sync state machine for UI
- Label: `feature`
- Milestone: `M4 - Sync Engine + Cache`
- Summary: Work includes states: syncing, synced, stale, offline, error and state transitions to UI. It also covers illegal transitions.
- Depends on: `M4-04`
- GitHub: [#51](https://github.com/Jon2050/Conspectus-Mobile/issues/51)

### :green_circle: M4-06 Add retry and backoff for transient sync failures
- Label: `feature`
- Milestone: `M4 - Sync Engine + Cache`
- Summary: Work includes exponential backoff with cap and Retry only retryable status classes. It also covers Surface final failure with actionable message.
- Depends on: `M4-03, M4-04`
- GitHub: [#52](https://github.com/Jon2050/Conspectus-Mobile/issues/52)

### :green_circle: M4-07 Add sync/cache integration tests
- Label: `test`
- Milestone: `M4 - Sync Engine + Cache`
- Summary: Work includes startup decision matrix and retry behavior and terminal failure behavior. It also covers offline startup with cache and without cache.
- Depends on: `M4-04, M4-05, M4-06`
- GitHub: [#53](https://github.com/Jon2050/Conspectus-Mobile/issues/53)

### :green_circle: M4-08 Implement progress feedback for DB sync and upload operations
- Label: `feature`
- Milestone: `M4 - Sync Engine + Cache`
- Summary: Work includes progress indicator for initial DB download and cache-miss re-downloads and progress indicator for DB upload after transfer creation. It also covers progress states are clear during slow mobile connections.
- Depends on: `M4-05`
- GitHub: [#54](https://github.com/Jon2050/Conspectus-Mobile/issues/54)

### :green_circle: M5-01 Integrate sql.js runtime and DB open service
- Label: `feature`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Summary: Work includes sql.js WASM bundle and DB open/close lifecycle from cached bytes. It also covers required SQLite pragmas and error handling.
- Depends on: `M4-03`
- GitHub: [#55](https://github.com/Jon2050/Conspectus-Mobile/issues/55)

### :green_circle: M5-02 Implement account query service
- Label: `feature`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Summary: Work includes visible non-primary account query and deterministic sorting. It also covers result rows to typed frontend models.
- Depends on: `M5-01`
- GitHub: [#56](https://github.com/Jon2050/Conspectus-Mobile/issues/56)

### :green_circle: M5-03 Implement transfer-by-month query service
- Label: `feature`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Summary: Work includes epoch-day month-bound utilities and transfers with inclusive month range. It also covers Sort by date ascending and transfer ID tie-breaker.
- Depends on: `M5-01`
- GitHub: [#57](https://github.com/Jon2050/Conspectus-Mobile/issues/57)

### :green_circle: M5-04 Implement month navigation state and gestures
- Label: `feature`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Summary: Work includes Default to current month and previous/next controls and swipe handlers. It also covers fallback controls for non-gesture usage.
- Depends on: `M5-03`
- GitHub: [#58](https://github.com/Jon2050/Conspectus-Mobile/issues/58)

### :green_circle: M5-05 Build Accounts screen UI
- Label: `feature`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Summary: Work includes account card/list components and positive/negative amount styling. It also covers loading and empty states.
- Depends on: `M5-02`
- GitHub: [#59](https://github.com/Jon2050/Conspectus-Mobile/issues/59)

### :green_circle: M5-06 Build Transfers screen UI
- Label: `feature`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Summary: Work includes transfer list item component and date, name, amount, account context, categories. It also covers loading, empty, and error visuals.
- Depends on: `M5-03, M5-04`
- GitHub: [#60](https://github.com/Jon2050/Conspectus-Mobile/issues/60)

### :green_circle: M5-07 Add formatting utilities and localization-ready rendering
- Label: `feature`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Summary: Work includes money formatting from integer cents and date formatting from epoch-day. It also covers formatting utilities unit tested.
- Depends on: `M5-05, M5-06`
- GitHub: [#61](https://github.com/Jon2050/Conspectus-Mobile/issues/61)

### :green_circle: M5-08 Add read-flow tests (unit + integration + e2e smoke)
- Label: `test`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Summary: Work includes Unit test query mappers and date bounds and Integration test screen rendering from fixture DB. It also covers E2E smoke for month navigation.
- Depends on: `M5-02, M5-03, M5-06`
- GitHub: [#62](https://github.com/Jon2050/Conspectus-Mobile/issues/62)

### :green_circle: M5-09 Capture live DB schema as reference artifact
- Label: `docs`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Summary: Work includes Export schema from a real Conspectus DB using SELECT sql FROM sqlite_master and the output as a reference schema file in the repository. It also covers this as the single source of truth for PWA SQL queries instead of conflicting desktop repo schema files.
- Depends on: `none`
- GitHub: [#63](https://github.com/Jon2050/Conspectus-Mobile/issues/63)

### :green_circle: M6-01 Build Add Transfer form UI (bottom sheet)
- Label: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Summary: Work includes fields: date, name, amount, from, to, categories, buyplace and touch-friendly controls and keyboard-safe layout. It also covers form-level loading/error states.
- Depends on: `M5-06`
- GitHub: [#64](https://github.com/Jon2050/Conspectus-Mobile/issues/64)

### :green_circle: M6-02 Implement account/category options loading for form
- Label: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Summary: Work includes valid from account options and valid to account options. It also covers categories sorted by name.
- Depends on: `M5-01`
- GitHub: [#65](https://github.com/Jon2050/Conspectus-Mobile/issues/65)

### :green_circle: M6-03 Implement transfer validation rules
- Label: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Summary: Work includes Validate name length > 2 and Validate amount > 0. It also covers Validate account combination restrictions.
- Depends on: `M6-01, M6-02`
- GitHub: [#66](https://github.com/Jon2050/Conspectus-Mobile/issues/66)

### :green_circle: M6-04 Implement transfer type derivation logic
- Label: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Summary: Work includes account types for selected accounts and Derive transfer type ID based on primary account rules. It also covers tests for all branch combinations.
- Depends on: `M6-02`
- GitHub: [#67](https://github.com/Jon2050/Conspectus-Mobile/issues/67)

### :green_circle: M6-05 Implement SQL write transaction
- Label: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Summary: Work includes Insert transfer row and Update source account amount (-amount). It also covers Update destination account amount (+amount) in one transaction.
- Depends on: `M6-03, M6-04`
- GitHub: [#68](https://github.com/Jon2050/Conspectus-Mobile/issues/68)

### :green_circle: M6-06 Implement DB export after successful local write
- Label: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Summary: Work includes Export DB bytes from sql.js and Validate non-empty payload. It also covers Hand off bytes to upload module.
- Depends on: `M6-05`
- GitHub: [#69](https://github.com/Jon2050/Conspectus-Mobile/issues/69)

### :green_circle: M6-07 Implement Graph upload with `If-Match` eTag
- Label: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Summary: Work includes Upload full DB bytes with If-Match and success and eTag refresh. It also covers precondition failure conflicts.
- Depends on: `M6-06, M4-02`
- GitHub: [#70](https://github.com/Jon2050/Conspectus-Mobile/issues/70)

### :green_circle: M6-08 Implement write failure and retry UX
- Label: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Summary: Work includes unsent form data on upload failure and retry action without retyping full form. It also covers false-success UI states.
- Depends on: `M6-07`
- GitHub: [#71](https://github.com/Jon2050/Conspectus-Mobile/issues/71)

### :green_circle: M6-09 Block write flow while offline
- Label: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Summary: Work includes offline state before submit and Disable submit action with clear explanation. It also covers Display a prominent warning message indicating the app is offline and transfers cannot be saved.
- Depends on: `M6-01`
- GitHub: [#72](https://github.com/Jon2050/Conspectus-Mobile/issues/72)

### :green_circle: M6-10 Add write-path tests (unit/integration/e2e)
- Label: `test`
- Milestone: `M6 - Add Transfer Write Path`
- Summary: Work includes Unit test validations and transfer type derivation and Integration test SQL transaction behavior. It also covers E2E test happy path, conflict, and retry scenarios.
- Depends on: `M6-05, M6-07, M6-08, M6-09`
- GitHub: [#73](https://github.com/Jon2050/Conspectus-Mobile/issues/73)

### :green_circle: M6-11 Implement eTag conflict resolution UX
- Label: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Summary: Work includes When upload returns 412 Precondition Failed (eTag mismatch), show a conflict dialog and Offer option to download the latest DB version from OneDrive. It also covers Preserve the form data from the failed transfer so the user can re-enter it after sync.
- Depends on: `M6-07, M6-08`
- GitHub: [#74](https://github.com/Jon2050/Conspectus-Mobile/issues/74)

### :green_circle: M7-01 Build Settings screen sections
- Label: `feature`
- Milestone: `M7 - Settings + Recovery`
- Summary: Work includes bound file details and last sync timestamp and app version/build info. It also covers Group actions by risk level.
- Depends on: `M3-08, M4-05`
- GitHub: [#75](https://github.com/Jon2050/Conspectus-Mobile/issues/75)

### :green_circle: M7-02 Implement force refresh action
- Label: `feature`
- Milestone: `M7 - Settings + Recovery`
- Summary: Work includes manual refresh trigger and Re-run metadata check and download flow. It also covers Update sync status and timestamps.
- Depends on: `M4-04`
- GitHub: [#76](https://github.com/Jon2050/Conspectus-Mobile/issues/76)

### :green_circle: M7-03 Add operational safety notice and data recovery documentation
- Label: `docs`
- Milestone: `M7 - Settings + Recovery`
- Summary: Work includes warning card: do not use mobile and desktop app concurrently and Link to short explanation. It also covers wording concise and unambiguous.
- Depends on: `M7-01`
- GitHub: [#77](https://github.com/Jon2050/Conspectus-Mobile/issues/77)

### :green_circle: M7-04 Implement stale token recovery flow
- Label: `feature`
- Milestone: `M7 - Settings + Recovery`
- Summary: Work includes token-expired API failures and safe re-auth flow. It also covers Return user to previous screen after success.
- Depends on: `M3-03, M3-04`
- GitHub: [#78](https://github.com/Jon2050/Conspectus-Mobile/issues/78)

### :green_circle: M7-05 Implement missing/moved OneDrive file recovery
- Label: `feature`
- Milestone: `M7 - Settings + Recovery`
- Summary: Work includes not-found/moved file responses (404) for itemId and Attempt self-healing fallback: query Graph using the saved parentReference (path) and file name to get the.... It also covers If fallback fails, prompt for rebind flow.
- Depends on: `M3-06, M4-02`
- GitHub: [#79](https://github.com/Jon2050/Conspectus-Mobile/issues/79)

### :green_circle: M7-06 Implement diagnostics panel with copy action
- Label: `feature`
- Milestone: `M7 - Settings + Recovery`
- Summary: Work includes auth/network/sync/binding diagnostic values and one-tap copy for support text. It also covers no sensitive tokens are exposed.
- Depends on: `M7-01`
- GitHub: [#80](https://github.com/Jon2050/Conspectus-Mobile/issues/80)

### :green_circle: M7-07 Add recovery-flow tests
- Label: `test`
- Milestone: `M7 - Settings + Recovery`
- Summary: Work includes expired token recovery and missing file recovery/rebind path. It also covers reset and force refresh actions.
- Depends on: `M7-04, M7-05, M7-06`
- GitHub: [#81](https://github.com/Jon2050/Conspectus-Mobile/issues/81)

### :green_circle: M8-01 Implement CSP and security headers for PWA path
- Label: `security`
- Milestone: `M8 - Hardening + QA + Release`
- Summary: Work includes CSP compatible with Svelte/Vite build output and headers for PWA route on website hosting. It also covers Validate service worker and manifest still function.
- Depends on: `M2-04`
- GitHub: [#82](https://github.com/Jon2050/Conspectus-Mobile/issues/82)

### :green_circle: M8-02 Implement PWA Service Worker Update Flow
- Label: `feature`
- Milestone: `M8 - Hardening + QA + Release`
- Summary: Work includes vite-plugin-pwa to prompt for updates (promptForUpdate strategy) and an "Update Available" toast/banner component to the UI. It also covers a button to accept the update and trigger a page reload.
- Depends on: `M1-05`
- GitHub: [#83](https://github.com/Jon2050/Conspectus-Mobile/issues/83)

### :green_circle: M8-03 Add dependency vulnerability scanning
- Label: `security`
- Milestone: `M8 - Hardening + QA + Release`
- Summary: Work includes npm audit or equivalent scanner in CI and Fail on high/critical vulnerabilities. It also covers Track exceptions explicitly when unavoidable.
- Depends on: `M1-08`
- GitHub: [#84](https://github.com/Jon2050/Conspectus-Mobile/issues/84)

### :green_circle: M8-04 Add bundle size budget checks
- Label: `infra`
- Milestone: `M8 - Hardening + QA + Release`
- Summary: Work includes JS/CSS size budgets and CI check for budget regression. It also covers optimization steps when budget exceeded.
- Depends on: `M1-08`
- GitHub: [#85](https://github.com/Jon2050/Conspectus-Mobile/issues/85)

### :green_circle: M8-05 Add Lighthouse CI checks for mobile performance
- Label: `test`
- Milestone: `M8 - Hardening + QA + Release`
- Summary: Work includes Lighthouse CI against deployed preview/prod route and Track performance, accessibility, best practices, PWA. It also covers minimum thresholds.
- Depends on: `M2-05`
- GitHub: [#86](https://github.com/Jon2050/Conspectus-Mobile/issues/86)

### :green_circle: M8-06 Expand Playwright suite to critical user journeys
- Label: `test`
- Milestone: `M8 - Hardening + QA + Release`
- Summary: Work includes flows: login, bind file, read accounts/transfers, add transfer, retry and offline-read smoke scenario. It also covers flaky-test mitigation and retries policy.
- Depends on: `M6-10, M7-07`
- GitHub: [#87](https://github.com/Jon2050/Conspectus-Mobile/issues/87)

### :green_circle: M8-07 Create manual device QA checklist issue
- Label: `test`
- Milestone: `M8 - Hardening + QA + Release`
- Summary: Work includes iOS Safari and Android Chrome test matrix and exact smoke scenarios and pass/fail criteria. It also covers Record results in release PR.
- Depends on: `M2-07, M6-10, M7-07`
- GitHub: [#88](https://github.com/Jon2050/Conspectus-Mobile/issues/88)

### :green_circle: M8-08 Create release checklist and cut process
- Label: `docs`
- Milestone: `M8 - Hardening + QA + Release`
- Summary: Work includes release branch/tag strategy and required checks and approvers. It also covers release notes and post-deploy verification steps.
- Depends on: `M8-05, M8-06`
- GitHub: [#89](https://github.com/Jon2050/Conspectus-Mobile/issues/89)

### :green_circle: M8-09 Create rollback procedure for two-repo deployment
- Label: `docs`
- Milestone: `M8 - Hardening + QA + Release`
- Summary: Work includes rollback trigger conditions and technical rollback steps in both repos. It also covers communication and ownership during rollback.
- Depends on: `M2-08`
- GitHub: [#90](https://github.com/Jon2050/Conspectus-Mobile/issues/90)

### :green_circle: M8-10 Add post-deploy smoke monitor job
- Label: `infra`
- Milestone: `M8 - Hardening + QA + Release`
- Summary: Work includes scheduled check of app route and key assets and Alert on repeated failures. It also covers Include deploy SHA in alert metadata.
- Depends on: `M2-05`
- GitHub: [#91](https://github.com/Jon2050/Conspectus-Mobile/issues/91)

### :green_circle: M8-11 Final MVP release issue
- Label: `feature`
- Milestone: `M8 - Hardening + QA + Release`
- Summary: Work includes all milestone issues are closed and Execute release checklist and deployment. It also covers release notes and known limitations.
- Depends on: `all milestone issues`
- GitHub: [#92](https://github.com/Jon2050/Conspectus-Mobile/issues/92)

## Suggested Issue Creation Order

1. Create all `PM-*` issues.
2. Create all issues in milestone order (`M1` to `M8`).
3. Link dependencies during creation using issue references.

