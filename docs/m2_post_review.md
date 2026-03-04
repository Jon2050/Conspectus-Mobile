# M2 Post Implementation Review (Issue #108)

Date: 2026-03-03  
Repository: `Jon2050/Conspectus-Mobile`

---

## Scope and Assumptions

1. Scope is limited to this repository (no direct edits in website-repo or GitHub branch settings).
2. PM/M1/M2 issue details were read from GitHub (`gh issue list/view`) and compared against current repository state.
3. Items that require organization/repository admin settings are reported as external blockers/risks.
4. Consumer-side expectations (website repo M2-04/M2-06) cannot be fully validated from this repository alone.

## Review Method

### Pass 1 — Issue-Driven Audit

1. Read baseline docs:
   - `README.md`
   - `docs/Architecture-and-Implementation-Plan.md`
   - `docs/Conspectus-Desktop-Info.md`
   - `docs/GitHub-Issues-MVP-Backlog.md`
2. Read PM/M1/M2 GitHub issue set and current states:
   - PM: #1, #2, #3, #4
   - M1: #5–#13
   - M2: #94, #14, #15, #17, #19, #21, #23, #25, #27
   - Review/fix issue: #108
3. Performed code/infrastructure/tests/security audit and implemented in-repo fixes.

### Pass 2 — Independent Full-Codebase Review

1. Read all project documentation including `docs/M2-07-installability-verification.md`, `docs/M2-08-two-repo-deployment-runbook.md`, and `docs/Task-Prompt-Snippet.md`.
2. Read GitHub issue #108 body and comments via `gh issue view 108 --json`.
3. Reviewed **every file** in the repository:
   - All source modules: `src/auth`, `src/graph`, `src/db`, `src/cache`, `src/features`, `src/shared`, `src/lib`.
   - All Svelte components, barrel exports, and module READMEs.
   - App entry point (`src/main.ts`), root component (`src/App.svelte`), global styles (`src/app.css`).
   - All 4 CI workflows: `quality.yml`, `deploy-channels.yml`, `preview-cleanup.yml`, `website-deploy-smoke.yml`.
   - All deployment scripts: `verify-build-channel.mjs`, `verify-production-handoff.mjs`, `verify-production-deploy-smoke.mjs` and their test files.
   - All config files: `vite.config.ts`, `eslint.config.js`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `playwright.config.ts`, `svelte.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.env.example`, `package.json`.
   - `index.html`, public icons, issue templates, PR template.
   - All unit tests (`src/**/*.test.ts`, `scripts/**/*.test.ts`) and E2E tests (`tests/e2e/app-shell.spec.ts`).
4. Cross-referenced source code against Architecture-and-Implementation-Plan for alignment.

---

## Issue Coverage Matrix (PM/M1/M2)

| Issue | Title | Review result |
| --- | --- | --- |
| #1 | PM-01 Create milestone and label taxonomy | ✅ Verified complete (labels/milestones exist; usage rules documented). |
| #2 | PM-02 Create issue templates | ⚠️ Gap found and fixed in this review: added `.github/ISSUE_TEMPLATE/{feature,bug,infra,test}.md`. |
| #3 | PM-03 Create PR template with QS checklist | ✅ Verified complete (`.github/pull_request_template.md`). |
| #4 | PM-04 Configure branch protection and required checks | ✅ Fixed in this review: activated repository ruleset with PR requirement, required status checks (`lint-typecheck`, `e2e-smoke`), linear history (rebase-only), deletion protection, and force-push protection. |
| #5 | M1-01 Bootstrap Svelte + TypeScript + Vite | ✅ Verified complete. |
| #6 | M1-02 Configure code quality tooling | ✅ Verified complete (ESLint/Prettier/TS strict + scripts). Minor gap: ESLint ignores do not include `playwright-report/` or `test-results/`. |
| #7 | M1-03 Add Vitest baseline | ✅ Verified complete. |
| #8 | M1-04 Add Playwright baseline | ✅ Verified complete. Gap: only Desktop Chrome profile configured despite mobile-first focus. |
| #9 | M1-05 Configure vite-plugin-pwa and manifest | ✅ Verified complete. Minor gap: `index.html` missing `<meta name="theme-color">` to match manifest `theme_color`. |
| #10 | M1-06 Prepare app architecture folders | ✅ Verified complete (module folders + aliases + README/index). Minor gaps: empty `src/shared/deploy/` directory, leftover `src/lib/` from Vite scaffold not documented. |
| #11 | M1-07 Add environment handling | ✅ Verified complete (runtime validation + startup failure UI). Security note: `renderStartupError` uses `innerHTML` (XSS vector). |
| #12 | M1-08 Create baseline CI workflow | ✅ Verified complete (quality + e2e jobs). Optimization gaps: no concurrency group, triple-build in lint-typecheck, no Playwright browser caching. |
| #13 | M1-09 Build initial mobile-first app shell | ✅ Verified complete. Gaps: `viewport-fit=cover` missing from `index.html`, error-boundary branch is dead code, Svelte 4 legacy `export let` syntax in `ErrorBoundaryPlaceholder.svelte`. |
| #94 | M2-00 Deploy architecture | ✅ Verified complete (preview + production-channel structure in workflows/docs). |
| #14 | M2-01 Cross-repo deployment architecture decision | ✅ Verified complete (`docs/Architecture-and-Implementation-Plan.md` section 8.3). |
| #15 | M2-02 Configure Vite base path | ✅ Verified complete (`vite.config.ts` channel-aware base path). |
| #17 | M2-03 PWA deploy workflow | ✅ Verified complete (`.github/workflows/deploy-channels.yml`). Security note: secret validation uses string interpolation instead of env variable. |
| #19 | M2-04 Consumer artifact integration | ⚠️ Producer-side contract verified; consumer-side implementation in website repo is external to this repository. |
| #21 | M2-05 Deployment smoke checks | ✅ Verified complete (script + website smoke workflow). |
| #23 | M2-06 Early public test page/link | ✅ GitHub issue is closed; this repo cannot verify website navigation entry directly. Backlog marker mismatch fixed. |
| #25 | M2-07 Installability verification | ✅ Verified complete (`docs/M2-07-installability-verification.md`). |
| #27 | M2-08 Two-repo runbook | ✅ Verified complete; improved with explicit artifact retention contract. |

---

## Implemented Fixes in This Review (#108)

1. **Workflow security hardening and least privilege:**
   - Reduced top-level permissions in `.github/workflows/deploy-channels.yml` to read by default.
   - Added scoped job-level permissions where write is required.

2. **Supply-chain hardening:**
   - Pinned `peaceiris/actions-gh-pages` to commit SHA in deploy workflow.

3. **Deployment verification hardening:**
   - Enforced HTTPS-only base URLs in `scripts/verify-production-deploy-smoke.mjs`.
   - Added test coverage for HTTPS validation in `scripts/verify-production-deploy-smoke.test.ts`.

4. **Artifact rollback durability:**
   - Set explicit artifact retention (`retention-days: 90`) in production artifact upload.
   - Documented retention expectation in `docs/M2-08-two-repo-deployment-runbook.md`.

5. **Missing PM-02 repository artifacts:**
   - Added issue templates:
     - `.github/ISSUE_TEMPLATE/feature.md`
     - `.github/ISSUE_TEMPLATE/bug.md`
     - `.github/ISSUE_TEMPLATE/infra.md`
     - `.github/ISSUE_TEMPLATE/test.md`

6. **Test gap closure for critical deploy gate:**
   - Added dedicated tests for `scripts/verify-build-channel.mjs` in `scripts/verify-build-channel.test.ts`.

7. **Additional readiness test improvement:**
   - Added hash-route store lifecycle test in `src/features/app-shell/hashRouting.test.ts` (subscribe/update/unsubscribe behavior).

8. **Backlog consistency:**
   - Updated `M2-06` marker to done in `docs/GitHub-Issues-MVP-Backlog.md`.

9. **CI budget optimization for PRs:**
   - Updated `.github/workflows/quality.yml` to detect docs-only PRs and skip heavy quality jobs (`lint/typecheck/tests/build/e2e`) for those PRs.

10. **Branch protection for `main`** (PM-04):
    - Activated GitHub repository ruleset "Main Branch Protection Ruleset" with:
      - Pull request requirement (all changes must go through a PR).
      - Required status checks: `lint-typecheck` and `e2e-smoke` must pass, branch must be up-to-date.
      - Required linear history (rebase-only merges, no merge commits).
      - Branch deletion protection and force-push protection.
    - Bypass actors: repository admin and integration (CI bot).

11. **`index.html` theme-color parity with manifest:**
    - Added `<meta name="theme-color" content="#dcdcdc" />` to `index.html` to align early browser chrome tinting with manifest `theme_color`.
    - Verified local quality gates remain green (`format`, `lint`, `test`, `test:e2e`, `typecheck`).

---

## Open Issues

All remaining findings that are not yet fixed, organized by severity and category.

### High

#### Code Quality / Security

1. ~~**XSS vector in startup error rendering** (`src/main.ts`, `renderStartupError`):~~ **RESOLVED** — Replaced `innerHTML` template interpolation with `document.createElement` + `textContent` + `replaceChildren`. All quality gates pass.

2. ~~**`SyncState` type does not match Architecture-and-Implementation-Plan states** (`src/shared/state/syncStateStore.ts`):~~ **RESOLVED** — Added `stale` and `offline` states to the `SyncState` type, `SyncStateStore` interface, and factory. Kept `idle` as the pre-sync startup state. Updated tests to cover all 6 states (transitions + parameterized initialization). All quality gates pass.

---

### Medium

#### Code Quality

3. ~~**`ErrorBoundaryPlaceholder.svelte` uses Svelte 4 `export let` syntax in a Svelte 5 project:**~~ **RESOLVED** — Migrated `ErrorBoundaryPlaceholder.svelte` to Svelte 5 `$props()` syntax. Removed dead error boundary code from `AppShell.svelte`: the `hasErrorPlaceholder` variable (never set to `true`), its reset in the route subscriber, the `{#if hasErrorPlaceholder}` template branch, and the unused import. Component file retained for future use. All quality gates pass.

5. ~~**`normalizeBasePath` / slug generation duplication across 3+ locations:**~~ **RESOLVED** — Extracted `normalizeBasePath` and `toPreviewSlug` into `scripts/deploy-utils.mjs`; `vite.config.ts` and `verify-build-channel.mjs` now import from this shared module. Consolidated inline Python slug logic from `deploy-channels.yml` and `preview-cleanup.yml` into `scripts/slugify-branch.py`. Added `scripts/deploy-utils.test.ts` with unit tests for both functions and a JS/Python contract test that verifies identical output across 9 diverse branch-name inputs, catching any future drift in CI. Also fixed a latent bug: the original JS `toPreviewSlug` preserved underscores while Python hex-encoded them — the JS implementation now uses per-character encoding matching Python exactly. All quality gates pass.

6. ~~**Empty `src/shared/deploy/` directory:** has no files and no clear purpose. Either remove it or add a README explaining its intended future use.~~ **RESOLVED** — Removed the empty directory.

7. REMOVED

#### CI/CD

8. ~~**`Quality` workflow has no `concurrency` group** (`.github/workflows/quality.yml`):~~ **RESOLVED** — Added a `concurrency` block with `cancel-in-progress: true` at the workflow top level.
   - Without `cancel-in-progress`, multiple pushes to the same branch queue redundant Quality runs. This wastes CI minutes and delays feedback.
   - **Fix:** Add a `concurrency` block at the workflow top level, matching the pattern used in `deploy-channels.yml` (line 19). Use `group: quality-${{ github.head_ref || github.ref }}` with `cancel-in-progress: true`.

9. **Website-repo-side expectations (M2-04/M2-06) cannot be fully validated from this repository alone.**

#### Security

10. ~~**`dispatch-production-ready` job validates the secret token with direct string interpolation in shell:**~~ **RESOLVED** — Passed the secret to the step as an environment variable `DISPATCH_TOKEN` rather than interpolating it directly, thus preventing it from appearing in the expanded shell script.
    - `deploy-channels.yml` line 308 does `if [ -z "${{ secrets.WEBSITE_REPO_DISPATCH_TOKEN }}" ]`. GitHub Actions replaces `${{ secrets.* }}` at template expansion time, meaning the secret value briefly appears in the expanded shell script.
    - **Fix:** Add `env: DISPATCH_TOKEN: ${{ secrets.WEBSITE_REPO_DISPATCH_TOKEN }}` to the step (the same variable name is already used in the dispatch step on line 316), then change the check to `if [ -z "${DISPATCH_TOKEN}" ]`.

---

### Low

#### Code Quality

11. ~~**`src/lib/` directory** contains only `Counter.svelte` (the Vite scaffold default component). It is not listed as an architecture module in README's `## Architecture Modules` section and has no `README.md` or barrel `index.ts`. **Fix:** Delete `src/lib/` and `Counter.svelte` entirely — neither is imported anywhere in the project.~~ **RESOLVED** — Deleted the unused `src/lib/` directory and `Counter.svelte`. All quality gates pass.

12. ~~**Inconsistent icon naming:** `moneysack256_256.png` uses underscores while all other icons use `moneysack{W}x{H}.png` (lowercase-x convention).~~ **RESOLVED** — Renamed `public/icons/moneysack256_256.png` to `moneysack256x256.png` and updated references in `vite.config.ts` and `scripts/verify-production-deploy-smoke.test.ts`. All quality gates pass.

13. ~~**`vite.config.ts` `includeAssets` / `manifest.icons` cross-check:** `moneysack.ico` and `moneysack180x180.png` are in `includeAssets` but not in `manifest.icons`. While technically correct, this asymmetry could confuse future maintainers.~~ **RESOLVED** — Added missing icons (`moneysack.ico`, `moneysack32x32.png`, `moneysack180x180.png`) to `manifest.icons` to exactly mirror `includeAssets`. All quality gates pass.

14. ~~**Positive/negative money-value CSS variables** (`#38a673`, `#fa2828`) are defined in `docs/Architecture-and-Implementation-Plan.md` (line 163: `Positive text: #38a673`) but not present in `src/app.css`. The CSS `:root` block defines `--error: #d03535` but no `--positive` or `--negative` variables. **Fix:** Add `--positive: #38a673;` and `--negative: #fa2828;` to the `:root` block in `app.css` before M5 when these colors will be needed for account balance and transfer amount rendering.~~ **RESOLVED** — Added `--positive` and `--negative` to the `:root` block in `src/app.css`.

#### index.html

15. ~~**Missing `viewport-fit=cover`** in `index.html` line 10. The CSS already uses `env(safe-area-inset-bottom)` in `.app-shell` (line 48) and the `@media` block (line 148), which has no effect unless `viewport-fit=cover` is set. **Fix:** Change the viewport meta to `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`.~~ **RESOLVED** — Updated `index.html` viewport meta to include `viewport-fit=cover`. All quality gates pass.

16. ~~**No `<meta name="description">` tag:** `index.html` lacks a description element. **Fix:** Add `<meta name="description" content="Mobile PWA for Conspectus personal finance tracking." />` to `<head>`.~~ **RESOLVED** — Added `<meta name="description" content="Mobile PWA for Conspectus personal finance tracking." />` in `index.html`. Local quality gates are green (`format`, `lint`, `test`, `typecheck`, `build`, `test:e2e`).

17. ~~**No `<meta name="theme-color">` tag:** The `<head>` does not include a `<meta name="theme-color">` to match the manifest's `theme_color: '#dcdcdc'` (defined in `vite.config.ts` line 77). Browsers use this for address-bar coloring before manifest parsing. **Fix:** Add `<meta name="theme-color" content="#dcdcdc" />` to `<head>`.~~ **RESOLVED** - Added `<meta name="theme-color" content="#dcdcdc" />` to `index.html`. Local quality gates are green (`format`, `lint`, `test`, `test:e2e`, `typecheck`).

18. ~~**No `<noscript>` fallback:**~~ **RESOLVED** — Added `<noscript>` tag in `<body>` with a user-friendly message explaining that JavaScript is required.

19. ~~**`%BASE_URL%` placeholder not documented:**~~ **RESOLVED** — Added an HTML comment above the icon `href` attributes explaining the `%BASE_URL%` placeholder mechanism and pointing to `vite.config.ts` for channel-aware base-path logic.

#### CI/CD

20. **Triple full build in `lint-typecheck` job** (`quality.yml` lines 112–129): The job runs three separate Vite builds: (1) default build (line 113, no `DEPLOY_CHANNEL`), (2) production build (line 119, `DEPLOY_CHANNEL=production`), (3) preview build (line 128, `DEPLOY_CHANNEL=preview`). **Fix:** Drop the default build (line 112–113) — the production and preview builds already exercise all code paths and additionally verify channel-specific path/scope constraints.

21. **Quadruple build per Quality run overall:** `e2e-smoke` builds via `playwright.config.ts` `webServer.command`. Combined with the triple build in `lint-typecheck`, a single Quality run produces **four full Vite builds**. Restructuring to share build artifacts across jobs would significantly reduce CI time.

22. **No Playwright browser caching:** `e2e-smoke` runs `npx playwright install --with-deps chromium` on every run. Using `actions/cache` for browser binaries would save ~30-60s per run.

23. **Branch slug Python logic in workflows is not tested:** The inline Python slugging code in `deploy-channels.yml` and `preview-cleanup.yml` has no automated tests. If it diverges from `toPreviewSlug` in `vite.config.ts`, preview cleanup could fail silently.

24. ~~**`preview-cleanup.yml` uses top-level `permissions: contents: write`**~~ **RESOLVED** — Moved `contents: write` to job-level permissions and set top-level to `contents: read`, matching the hardened pattern in `deploy-channels.yml`.

25. **`website-deploy-smoke.yml` does not run `npm ci`** before running the smoke script. The script currently uses only Node built-ins, but if it ever imports a dependency, the workflow will silently break.

26. **Revisit retry caps** in preview/prod smoke checks to balance reliability and quota usage on long-tail failures.

#### Security

27. **CSP/security-header runtime validation** is not yet part of smoke checks (tracked naturally by future M8 security hardening).

28. **No `Content-Security-Policy` meta tag in `index.html`:** While CSP is tracked in M8-01, a basic restrictive CSP meta tag could be added now to establish the baseline and catch regressions early.

#### Testing

29. **Playwright only tests Desktop Chrome:** `playwright.config.ts` (line 18) has a single project using `devices['Desktop Chrome']`. Given the mobile-first PWA focus, add at least `devices['Pixel 5']` (Android viewport/UA) and/or `devices['iPhone 13']` (iOS Safari viewport/UA) as additional projects. Note: the E2E test already sets a mobile viewport override (`{ width: 390, height: 844 }` in `app-shell.spec.ts` line 3), but this doesn't affect UA string or touch emulation — adding device profiles would cover those.

30. **E2E test for startup env-failure UI path** (`VITE_AZURE_CLIENT_ID` missing) does not exist.

31. **No unit tests for route placeholder Svelte components** (`AccountsRoute`, `TransfersRoute`, `AddRoute`, `SettingsRoute`). Basic render tests would catch import/export breakage.

32. **More component-level tests for app shell transition and loading/error rendering states** are recommended.

33. REMOVED

34. **Missing `sumCents` edge-case tests:** `src/shared/utils/sumCents.test.ts` covers empty arrays and mixed positive/negative values but is missing: (a) single-element arrays, (b) very large numbers near `Number.MAX_SAFE_INTEGER` to verify integer safety. Add these cases to prevent silent precision loss on high-value accounts.

35. **`src/architectureAliases.test.ts`** only checks that alias imports resolve and return defined objects. It does not verify that the alias set in `vite.config.ts` (lines 112–118, 6 aliases) matches the `paths` in `tsconfig.app.json` (lines 9–15, 6 paths). A comparison test reading both config files and asserting identical alias keys would catch drift if one config is updated without the other.

36. **Script tests share Vitest config with app tests:** `vite.config.ts` (line 108) sets Vitest `include` to `['src/**/*.test.ts', 'scripts/**/*.test.ts']` under a single `environment: 'node'` setting. Meanwhile `tsconfig.node.json` (line 25) includes `scripts/**/*.test.ts` with Node-only libs (`ES2023` + `node` types), and `tsconfig.app.json` (line 35) includes `src/**/*.test.ts` with browser libs. Risk: a script test that accidentally imports a browser-only module (e.g., from `src/`) will pass TypeScript checks under the app tsconfig but fail at runtime in CI's Node environment.

#### Documentation

37. REMOVED

38. **Module README files are minimal:** `auth`, `graph`, `db`, and `cache` modules have empty barrel exports (`export {}`) and minimal READMEs. These should be updated before M3 to clarify responsibilities and expected interfaces.

39. REMOVED

40. ~~**Version `"0.0.0"` in `package.json`:**~~ **RESOLVED** — Updated to `"0.2.0"` for post-M2 traceability.

#### Configuration

41. **`.prettierignore` ignores all `*.md` files:** Documentation markdown files are not format-checked. Inconsistent formatting in docs won't be caught by `npm run format`. Consider removing `*.md` from `.prettierignore` and running `npm run format:write` to normalize existing docs, or narrowing the ignore to only generated markdown.

42. ~~**ESLint ignore list does not include `playwright-report/` or `test-results/`:**~~ **RESOLVED** — Added `'playwright-report'` and `'test-results'` to the `ignores` array in `eslint.config.js`.

43. ~~**No `engines` field in `package.json`:**~~ **RESOLVED** — Added `"engines": { "node": ">=22" }` to match CI's `node-version: 22`.

44. REMOVED

---

## Open Issues Summary

| Severity | Count | Key areas |
| --- | --- | --- |
| **High** | 0 | — |
| **Medium** | 2 | Quality concurrency, website-repo validation |
| **Low** | 19 | CI build waste (4), security headers (2), test gaps (6), docs gaps (2), config gap (1), Playwright device profiles, script test isolation, retry caps, website-smoke npm ci |
| Resolved | 18 | #1 (XSS vector in renderStartupError), #2 (SyncState type mismatch), #3 (Svelte 4 syntax + dead error boundary code), #5 (normalizeBasePath/slug duplication — shared module + contract test), #6 (empty deploy dir removed), #10 (Workflow string interpolation), #11 (Unused src/lib directory), #12 (Inconsistent icon naming), #13 (vite.config.ts includeAssets vs manifest.icons asymmetry), #14 (CSS design variables), #15 (`viewport-fit=cover` in `index.html`), #16 (`meta description` in `index.html`), #17 (`meta theme-color` in `index.html`), #18 (noscript fallback), #19 (`%BASE_URL%` docs), #24 (preview-cleanup permissions), #40 (package.json version), #42 (ESLint ignores), #43 (engines field) |
| Removed | 6 | #4, #7, #33, #37, #39, #44 |
| **Total open** | 20 | |

---

## M3 Readiness Confirmation

Conclusion: **M3 can start now** from a codebase perspective.

Ready:
1. Build/test/tooling baseline is stable.
2. Module structure and aliases for `auth`, `graph`, `cache`, `db`, `features`, `shared` are in place.
3. M2 deployment and smoke infrastructure is working and hardened in this repo.

Not blocking M3 but should be tracked:
1. Address slug-normalization duplication by centralizing normalization logic or adding a shared helper contract test.
2. Fix remaining missing `<meta>` tags in `index.html` before mobile testing begins (`viewport-fit=cover` and `theme-color` resolved).
3. ~~Align `SyncState` type with architecture doc states before M4 implementation.~~ — **RESOLVED.**
4. ~~Fix `renderStartupError` XSS vector~~ — **RESOLVED.**

---
