# Conspectus-Mobile - Architecture and Implementation Plan

## 1. Purpose and Scope

This document is the deep source-of-truth for architecture decisions, sync/write behavior, and milestone delivery for **Conspectus-Mobile**.

Use `README.md` as the quick-entry document for goal, MVP/non-goal summary, local setup, environment variables, and module import conventions.

Core product constraints remain:
- OneDrive-hosted personal SQLite file per user.
- No backend server.
- No required desktop-app changes.
- Simple, maintainable mobile-first implementation.

## 1.1 Documentation Ownership

Canonical sections by topic:
- Sync/caching model (`eTag`, `If-Match`, conflict recovery): this document, `## 3.4 Sync and Caching Strategy`.
- Environment variable definitions/defaults: `README.md`, `## Environment Setup`.
- Module import conventions and aliases: `README.md`, `## Architecture Modules`.

---

## 2. Confirmed Constraints and Product Decisions

- Account type support: **Microsoft personal accounts only**.
- Platform: **PWA**, no native iOS/Android apps.
- Backend: **none** (frontend-only).
- Hosting: `https://jon2050.de/conspectus/webapp` (HTTPS available).
- OneDrive file selection: ask once, store binding locally.
- Settings must include local reset/rebind option.
- Offline mode: **viewing only** using cached last DB.
- Offline add transfer: **not supported**.
- File transport: raw `.db` only.
- Keep source code small and simple.
- Separate repository (`Conspectus-Mobile`) from main desktop Conspectus repo.

---

## 3. High-Level Architecture

## 3.1 Technology Stack

- Framework: **Svelte + TypeScript + Vite**
- PWA: **vite-plugin-pwa** (service worker + manifest)
- Auth: **@azure/msal-browser** (Authorization Code + PKCE)
- OneDrive API: **Microsoft Graph REST**
- SQLite in browser: **sql.js** (WASM)
- Local cache: **IndexedDB** via **Dexie**
- Testing: **Vitest**, **Playwright**, ESLint, Prettier

Rationale:
- Minimal runtime and code size.
- Strong mobile performance.
- Simple deployment (static assets only).

## 3.2 Runtime Components

1. `UI Layer`
- Mobile-first screens and components.
- Gesture handling for month swipe.
- Online/offline state and sync status indicators.

2. `Auth Module`
- Sign in/out with MSAL.
- Silent token acquisition where possible.
- Controlled fallback to interactive login.

3. `OneDrive/Graph Module`
- Metadata fetch (`driveId`, `itemId`, `eTag`).
- File download and full-file upload.
- Conditional upload using `If-Match` eTag.

4. `DB Engine Module`
- Open DB bytes in sql.js.
- Run read queries for accounts/transfers.
- Run write transaction for add-transfer flow.
- Export updated DB bytes for upload.

5. `Local Cache Module`
- Persist DB blob + metadata (`eTag`, file IDs, last sync).
- Provide offline read when network unavailable.
6. `App State Module`
- Selected month.
- Sync lifecycle states.
- Cached file identity (including fallback path/name) and sync metadata state.

## 3.3 Data Model Parity

The PWA must mirror desktop behavior for transfer creation:
- Insert into `transfer`.
- Update both affected `account.amount` values.
- Use same field-level validation rules as desktop:
  - name length > 2
  - amount > 0
  - account combination constraints

## 3.4 Sync and Caching Strategy

This section is the canonical sync behavior definition for the repository.

Read flow on app startup:
1. Resolve user auth.
2. Resolve stored file binding (`driveId`, `itemId`, `parentReference/path`, `name`).
3. Fetch file metadata (including `eTag`).
4. If cached blob exists and eTag unchanged, load cached DB.
5. Else download full DB, cache it, and load it.

Cache loss is non-critical: if the local IndexedDB cache is evicted (e.g. by iOS after inactivity), the app simply re-downloads the DB from OneDrive on next online startup. No data is lost because OneDrive is always the authoritative source.

Write flow for "Add Transfer":
1. Require online state.
2. Validate fields.
3. Execute local SQL transaction.
4. Export full DB bytes.
5. Upload full DB with `If-Match: currentETag`.
6. Cache uploaded DB and returned new eTag.

Conflict policy:
- User agreement says desktop and mobile won't be used concurrently.
- Still keep eTag conditional upload for protection.
- If an eTag conflict occurs, the in-memory `sql.js` database instance MUST be completely destroyed and re-initialized with the freshly downloaded bytes before the user is allowed to retry the transfer save.

Data recovery:
- OneDrive automatically keeps version history for uploaded files (30 days for personal accounts).
- Every PWA upload creates a recoverable version in OneDrive.
- If a write corrupts data or the user makes a mistake, previous versions can be restored via OneDrive's web UI.
- No custom backup mechanism is needed in the PWA.

## 3.5 Performance and Data Traffic

Given ~700 KB DB:
- First load per device/profile: ~700 KB download.
- Each successful save: ~700 KB upload.
- Unchanged open: metadata check only, no full download.

Optimization strategy (simple):
- Cache DB locally.
- Avoid background polling.
- Manual/foreground sync triggers.
- Optional `VACUUM` cadence (e.g., every N writes) to keep DB size compact.

Compression note:
- No backend means no practical custom compressed transport pipeline.
- OneDrive stores bytes as uploaded; raw `.db` is the supported path here.

---

## 4. UX and Visual Design Direction

## 4.1 Design Principles

- Fast, touch-first, one-handed usage.
- Clear hierarchy and low cognitive load.
- Financial data legibility first.
- Modern look with subtle motion and high clarity.

## 4.2 Visual System (aligned with desktop colors)

Base palette derived from desktop CSS:
- App background: `#dcdcdc`
- Card/surface: `whitesmoke`
- Positive text: `#38a673`
- Negative text: `#fa2828`
- Neutral text: `dimgrey`
- Accent interaction (swipe/highlight): cyan/teal family

Typography:
- Clean modern sans-serif stack with readable numeric rendering.

Core UI patterns:
- Bottom navigation (Accounts, Transfers, Add, Settings).
- Floating primary action for quick add.
- Bottom-sheet form for adding transfer.
- Swipe month navigation with fallback arrow controls.

## 4.3 Accessibility and Mobile Usability

- Minimum 44x44px tap targets.
- Sufficient contrast for money values and action states.
- Keyboard-safe form interactions.
- Explicit loading and error states.
- Reduced-motion compatibility.
- Native feel via `viewport-fit=cover` and CSS safe-area insets (`env(safe-area-inset-bottom)`) to prevent notch/home bar overlap.
- Explicit Apple touch icons for Add to Home Screen.

---

## 5. Detailed Implementation Plan (Milestones)

## Milestone 1: Foundation (Repo + Tooling)

Goal: create a clean, production-ready technical baseline.

Substeps:
1. Use repository `Conspectus-Mobile`.
2. Bootstrap Svelte + TS + Vite project.
3. Add lint/format/typecheck scripts.
4. Add `vite-plugin-pwa` and baseline manifest:
   - name/short_name
   - icons
   - standalone mode
   - theme color
5. Add environment config strategy:
   - `VITE_AZURE_CLIENT_ID` (definition/defaults are maintained in `README.md`)
6. Create base architecture folders:
   - `src/auth`
   - `src/graph`
   - `src/db`
   - `src/cache`
   - `src/features`
   - `src/shared`
7. Set CI workflow:
   - install
   - typecheck
   - lint
   - unit tests
   - build

Deliverables:
- Compilable app shell.
- PWA install prompt possible.
- CI green on main branch.

Exit criteria:
- App builds and runs on localhost and on test hosting path.
- Lint/typecheck/test/build scripts all pass.

---

## Milestone 2: Website Integration + Early Deploy

Goal: integrate the PWA into the existing static website as early as possible for real-device testing.

Substeps:
1. Define deployment channel architecture (M2-00 foundation):
   - branch preview channel on GitHub-hosted URLs for every branch push after `Quality` passes
   - main-only production channel for `jon2050.de` deployment eligibility
   - branch preview path convention (`/previews/<branch-slug>/`) with cleanup on branch deletion
   - deterministic branch slugging (`branch-name` -> lowercase path-safe single-segment slug) for stable preview URLs and safe cleanup behavior
2. Confirm final public route:
   - `jon2050.de/conspectus/webapp/`
3. Configure Vite/PWA build paths per channel:
   - preview: branch-scoped base path and `start_url`
   - production: `/conspectus/webapp/` base path and `start_url`
   - service worker scope isolation for both channels
4. Add deploy target structure compatible with existing website static hosting.
5. Add minimal "PWA shell smoke" page to verify:
   - app route loads under website path
   - service worker registration works
   - manifest and icons resolve correctly
   - e2e smoke asserts production base-path manifest fields (`start_url`, `scope`) and that parent-site routes outside app scope are not service-worker-controlled
6. Add website navigation entry/link to the PWA route (or temporary test link).
7. Add CI deployment workflows:
   - `Deploy Channels` workflow runs from successful `Quality` push runs (`workflow_run`)
   - publish/update preview on successful branch builds (including `main`)
   - publish production artifact only on successful `main` builds
   - run build-output path/scope assertions for preview and production channels
   - run the same channel path/scope assertions in `Quality` to catch regressions before deploy workflows execute
   - `Preview Cleanup` workflow removes branch preview path on delete event
   - keep production website rollout as a separate follow-up in website repo

Deliverables:
- Publicly reachable PWA shell on `jon2050.de` for iOS/Android testing.
- Repeatable early deploy process independent of feature completion.
- Branch preview URLs for development and QA on every branch.
- Main-only production artifact handoff contract for website deployment.

Exit criteria:
- Successful branch pushes produce isolated preview URLs.
- PWA opens correctly at `https://jon2050.de/conspectus/webapp/`.
- Install prompt/service worker/manifest behavior is testable on mobile devices.
- Successful `main` builds produce traceable production artifacts for website consumption.

---

## Milestone 3: Auth + OneDrive File Binding

Goal: user can authenticate and bind a DB file once.

Substeps:
1. Register Entra app for SPA redirect flow (personal accounts).
2. Configure redirect URIs:
   - production path
   - local dev path
3. Implement MSAL bootstrapping and login state store.
4. Implement sign-in and sign-out UX.
5. Implement OneDrive file picker/select flow (or Graph file browse fallback).
6. Persist selected file binding in IndexedDB/local storage:
   - `driveId`
   - `itemId`
   - file display name and `parentReference` (path) for fallback recovery
7. Add settings actions:
   - "Change DB file"
   - "Reset local app data"

Deliverables:
- Stable login flow with persisted session where possible.
- One-time DB file binding retained across app restarts.

Exit criteria:
- User can reopen app and access same file without reselecting.
- Reset clears binding and forces fresh selection.

---

## Milestone 4: Sync Engine + Local Cache (Offline Read)

Goal: robust online/offline read behavior with minimal traffic.

Substeps:
1. Implement Graph metadata fetch for current file.
2. Implement eTag-based freshness decision.
3. Implement DB blob download and cache persist.
4. Implement cache schema:
   - db bytes
   - `eTag`
   - `lastSyncAt`
   - file identifiers (`driveId`, `itemId`, `path`, `name`)
5. Implement startup decision tree:
   - online + unchanged => cached DB
   - online + changed => download
   - offline => cached DB if present
6. Add sync state UI:
   - synced
   - stale
   - offline
   - syncing
   - error
7. Add robust retry strategy with exponential backoff for transient failures.

Deliverables:
- Reliable DB availability for read-only mode offline.
- Minimal repeated data transfers.

Exit criteria:
- Airplane mode still shows cached accounts/transfers.
- Online resume refreshes when eTag changed.

---

## Milestone 5: Accounts and Transfers Read UX

Goal: deliver high-quality fast browsing experience.

Substeps:
1. Implement account query:
   - visible account set
   - sorted order consistent with DB fields
2. Build Accounts screen cards:
   - account name
   - amount with positive/negative styling
3. Implement month state model:
   - default current month
   - previous/next month controls
   - swipe gesture handlers
4. Implement transfer query by month bounds using epoch-day logic.
5. Build Transfers list UI:
   - date, name, amount, from/to, categories
   - empty-state card
6. Add loading skeletons and micro-animations.
7. Performance tuning:
   - avoid unnecessary re-query/re-render
   - memoize derived values where useful

Deliverables:
- Production-ready viewing experience for accounts and monthly transfers.

Exit criteria:
- Month switching feels immediate on modern phones.
- Lists remain usable and readable on narrow screens.

---

## Milestone 6: Add Transfer Write Path

Goal: safe and desktop-compatible transfer creation.

Substeps:
1. Build "Add Transfer" bottom sheet form:
   - date
   - name
   - amount
   - from account
   - to account
   - up to 3 categories
   - buyplace (optional)
2. Implement desktop-equivalent validations.
3. Implement SQL write transaction:
   - insert transfer row
   - update source account amount
   - update target account amount
4. Refresh in-memory views after successful write.
5. Export DB bytes and upload with `If-Match`.
6. Handle upload failures:
   - show failure state
   - keep form data for retry
   - do not pretend success
7. Show clear visual success message upon successful upload completion.
8. Block offline writes:
   - detect missing internet connection
   - disable save button and show prominent offline warning message
9. Optional maintenance toggle:
   - run `VACUUM` every N writes or manual trigger in settings.

Deliverables:
- End-to-end write feature with clear success/error behavior.

Exit criteria:
- Created transfer appears immediately in PWA.
- Desktop app later sees same transfer after OneDrive sync.

---

## Milestone 7: Settings, Recovery, and Operational Safety

Goal: make small app self-maintainable by end users.

Substeps:
1. Settings page sections:
   - bound OneDrive file info
   - last sync timestamp
   - app version/build
2. Actions:
   - change file
   - reset local cache
   - force refresh from OneDrive
3. Safety notice card:
   - "Do not use mobile app while desktop app is open"
4. Error recovery UX:
   - re-login flow
   - stale token handling
   - missing file handling (moved/deleted)
5. Add simple diagnostics panel (copyable text for support):
   - auth state
   - network state
   - file ID presence
   - last error code

Deliverables:
- Clear operational controls and troubleshooting path.

Exit criteria:
- User can recover from wrong file binding without developer help.

---

## Milestone 8: Hardening, QA, and Release

Goal: release with confidence on iOS and Android.

Substeps:
1. Security hardening:
   - strict CSP
   - no secrets in frontend
   - dependency audit
2. Performance hardening:
   - Lighthouse checks
   - bundle size budget
3. E2E smoke suite for critical paths.
4. Manual device matrix testing.
5. Release checklist and rollback plan.
6. Deploy pipeline to production path.

Deliverables:
- Release candidate and production deployment.

Exit criteria:
- All release gates green and smoke tests pass on both platforms.

---

## 6. Quality Strategy (QS) and Testing Strategy

## 6.1 Quality Objectives

- Correctness of financial writes.
- Safe sync behavior with transparent state.
- Strong mobile usability.
- Predictable behavior in unstable network conditions.

## 6.2 Test Pyramid

1. Unit tests (high volume, fast)
- Validation rules.
- Month boundary calculations.
- SQL builder/helpers.
- Cache freshness decision logic.

2. Integration tests (medium)
- DB module + sql.js with fixture DB.
- Graph client wrappers with mocked responses.
- Auth state transitions.

3. End-to-end tests (focused)
- Login flow (mocked tokens in CI if needed).
- File binding and app restart persistence.
- View accounts and month transfers.
- Add transfer happy path and failure/retry path.
- Offline startup with cache.

## 6.3 Test Data and Fixtures

- Maintain small fixture DBs:
  - baseline production-like schema/data
  - empty/month-heavy data
- Include deterministic transfer/account sets for assertion stability.

## 6.4 Manual Device Test Matrix

Required minimum:
- iPhone Safari (latest iOS)
- Android Chrome (latest stable)

Recommended additional:
- iPad Safari
- Samsung Internet (recent)

Manual scenarios:
- Install to home screen.
- App reopen after token expiration.
- Network drops during upload.
- Swipe gestures + fallback controls.
- Settings reset/rebind flow.

## 6.5 Regression and Release Gates

Hard gates before release:
1. Unit/integration/e2e suites pass.
2. Typecheck and lint pass.
3. Bundle size within budget.
4. No high severity dependency vulnerabilities.
5. Manual device smoke tests pass.

## 6.6 Observability and Error Handling

- Structured client logs in dev mode.
- User-facing error messages with actionable text.
- Internal error codes for support troubleshooting.
- Non-blocking telemetry optional; avoid complexity for MVP.

---

## 7. Security and Privacy Strategy

- SPA auth with PKCE via MSAL.
- Delegated Graph scopes only; least privilege.
- No client secret in frontend code.
- HTTPS-only deployment.
- MFA recommended/required on both Microsoft accounts.
- Store only minimal local metadata and cached DB necessary for offline read.
- Provide explicit logout and local reset options.

---

## 8. Deployment and Repository Strategy

## 8.1 Separate Repo + Website Integration

Recommended:
1. Keep `Conspectus-Mobile` as independent git repository.
2. Use dual deployment channels:
   - branch previews hosted from this repo on GitHub paths for development validation
   - main-only production artifact handoff for website deployment
3. Build and deploy static output directly to:
   - `jon2050.de/conspectus/webapp/`
4. Keep website repo independent; add simple link to PWA route.

Rejected alternatives for MVP (authoritative decision is section `8.3`):
- Git submodule with website-side build/copy steps.
- Git subtree syncing of mobile source into website repository.
- Package-registry pull flow for static assets.

## 8.2 CI/CD

Pipeline stages:
1. Build/test on push and PR.
2. `Deploy Channels` listens to successful `Quality` push runs only.
3. Deploy/update branch preview URL on `gh-pages` path `/previews/<branch-slug>/`.
4. On successful `main` quality runs, publish a production artifact with deployment metadata (`commit SHA`, UTC build time, run IDs).
5. `Preview Cleanup` removes stale preview paths when branches are deleted.
6. Website repo consumes main artifact and deploys to `jon2050.de/conspectus/webapp/`.
7. Post-deploy smoke check for app shell availability.

## 8.3 Approved Cross-Repo Deployment Architecture (M2-01)

Decision status:
- Approved for MVP Milestone 2.
- Selected strategy: artifact handoff (PWA repo produces immutable build artifacts; website repo consumes artifacts in CI).

Options reviewed:
- Artifact handoff (selected): clean repo separation, immutable versioned outputs, simple rollback to known-good artifact, no cross-repo working-tree coupling.
- Submodule (rejected): pins source code commit, not compiled output; adds submodule update overhead and failure modes that are unrelated to deployment correctness.
- Subtree (rejected): duplicates source history into website repo and increases merge/maintenance complexity for routine deploys.
- Package pull (rejected for MVP): adds package publish/registry lifecycle that is unnecessary for static-site artifact delivery.

Producer/consumer CI contract (automation-only, no manual copy):
1. Producer (`Conspectus-Mobile`):
   - Source workflow: `Deploy Channels` after successful `Quality` push runs.
   - Production artifact is published only for `main`.
   - Every successful `main` deploy run MUST emit exactly one deployable production artifact; the producer workflow enforces this before handoff dispatch.
   - Artifact name format: `conspectus-mobile-production-<commitSha>`.
   - Artifact payload is `dist/` and MUST include `deploy-metadata.json` with:
     - `channel` (`production`)
     - `basePath` (`/conspectus/webapp/`)
     - `sourceBranch`
     - `commitSha`
     - `buildTimeUtc`
     - `qualityRunId`
     - `deployRunId`
   - Deterministic handoff event to website repo (no human selection):
     - Trigger `repository_dispatch` with event type `conspectus-mobile-production-ready`.
     - Payload MUST include `commitSha`, `deployRunId`, `qualityRunId`, and `artifactName`.
     - Producer dispatch token MUST be scoped to trigger workflow events in the website repository.
     - Producer workflow secret `WEBSITE_REPO_DISPATCH_TOKEN` is required for dispatch.
     - Producer workflow variable `WEBSITE_REPO_FULL_NAME` may override the default consumer target (`Jon2050/conspectus`).
2. Consumer (website repository):
   - Trigger on `repository_dispatch` (`conspectus-mobile-production-ready`) and read payload fields as the single source of artifact identity.
   - Resolve artifact deterministically via GitHub Actions API using `deployRunId`:
     - List artifacts for that run and select exact `artifactName`.
     - Download artifact archive from the same run.
   - Consumer token MUST have `actions:read` access to `Conspectus-Mobile` artifacts.
   - Validate `deploy-metadata.json` before publish (channel is `production`, base path is `/conspectus/webapp/`, identity fields present).
   - Validate identity match (`deploy-metadata.commitSha == dispatch.commitSha`, `deploy-metadata.deployRunId == dispatch.deployRunId`).
   - Perform atomic replace of website output directory `conspectus/webapp/` from the artifact contents.
   - Fail deployment if artifact download or metadata validation fails.

Failure and rollback behavior:
1. If producer artifact generation fails, website deployment does not run for that revision.
2. If consumer artifact retrieval or validation fails, website deployment fails without changing live files.
3. Rollback re-deploys the last known-good `deployRunId` artifact through website CI `workflow_dispatch`; rollback must use CI automation only (no manual filesystem copy steps).
4. Detailed operator runbook steps remain tracked in `M2-08` and `M8-09`.

---

## 9. Future Feature Outlook: Receipt Scan and Auto-Split

MVP status: concept only.

Option A (no-cost local-first):
- Capture receipt image in browser.
- Run OCR on-device (`tesseract.js`).
- Extract totals/date/vendor with heuristics.
- Suggest prefilled transfer form.

Option B (better extraction, possible free tier limits):
- Cloud OCR/vision API then parse/classify lines.
- Suggest category-based split into multiple transfers.

Auto-split concept:
1. Parse line items.
2. Classify by keyword/category mapping.
3. Group into transfer candidates.
4. User confirms/edits before save.

Privacy principle:
- Keep local-first by default.
- If cloud processing is enabled later, require explicit user opt-in.

---

## 10. Implementation Deliverables Summary

MVP deliverables:
1. Installable PWA on iOS/Android.
2. Early integrated deployment on `jon2050.de/conspectus/webapp/` for device testing.
3. OneDrive-authenticated access to selected SQLite DB.
4. Cached offline viewing.
5. Accounts view.
6. Month-based transfers view with swipe.
7. Add-transfer write flow with desktop-compatible DB updates.
8. Settings recovery tools.
9. Documented test suite and release process.
