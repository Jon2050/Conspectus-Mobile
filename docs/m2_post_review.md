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

---

## Open Issues

All remaining findings that are not yet fixed, organized by severity and category.

### High

#### Code Quality / Security

1. **XSS vector in startup error rendering** (`src/main.ts`, `renderStartupError`):
   - `renderStartupError` sets `appRoot.innerHTML` with the error message string. Although current callers only produce safe static strings, the function accepts an arbitrary `string`. If any future caller passes user-controlled or external data, it could be injected as HTML.
   - **Recommendation:** use `textContent` or DOM API instead of `innerHTML`, or explicitly sanitize/escape the input.

2. **`SyncState` type does not match Architecture-and-Implementation-Plan states** (`src/shared/state/syncStateStore.ts`):
   - The store defines states: `idle`, `syncing`, `synced`, `error`.
   - The Architecture doc (section 3.4 / M4-05) specifies: `syncing`, `synced`, `stale`, `offline`, `error`.
   - Missing states: `stale` and `offline`. The current `idle` state has no doc counterpart.
   - **Recommendation:** align the type definition early and add the missing states before M4, where the sync engine will depend on them.

---

### Medium

#### Code Quality

3. **`ErrorBoundaryPlaceholder.svelte` uses Svelte 4 `export let` syntax in a Svelte 5 project:**
   - The project uses Svelte 5 (`^5.45.2`) but `ErrorBoundaryPlaceholder.svelte` still uses `export let message = ...`. The rest of the codebase should target the runes API (`$props()`) for consistency and future-proofing.
   - Additionally, `hasErrorPlaceholder` in `AppShell.svelte` is set to `false` on every route change but is never set to `true` anywhere — the entire error-boundary branch is **dead code** with no trigger mechanism.

5. **`normalizeBasePath` / slug generation duplication across 3+ locations:**
   - `normalizeBasePath` logic exists with slight variations in: `vite.config.ts`, `scripts/verify-build-channel.mjs`.
   - Slug generation logic is duplicated in Python across `deploy-channels.yml` and `preview-cleanup.yml`, with a JavaScript version in `vite.config.ts` (`toPreviewSlug`).
   - Total: **3 implementations of path normalization, 3 implementations of slug generation** (2 Python + 1 JS) — all must stay in sync manually.
   - Risk: drift/regression if one implementation changes independently.

6. **Empty `src/shared/deploy/` directory:** has no files and no clear purpose. Either remove it or add a README explaining its intended future use.

7. **`dev-server.err.log` and `dev-server.out.log`** are present in the repository root but not in `.gitignore`. These appear to be development server artifacts that should not be committed.

#### CI/CD

8. **`Quality` workflow has no `concurrency` group:**
   - Without `cancel-in-progress`, multiple pushes to the same branch queue redundant Quality runs. This wastes CI minutes and delays feedback.
   - **Recommendation:** add `concurrency` with `cancel-in-progress: true` per branch/PR.

9. **Website-repo-side expectations (M2-04/M2-06) cannot be fully validated from this repository alone.**

#### Security

10. **`dispatch-production-ready` job validates the secret token with direct string interpolation in shell:**
    - `deploy-channels.yml` line 308 does `if [ -z "${{ secrets.WEBSITE_REPO_DISPATCH_TOKEN }}" ]`. GitHub Actions replaces `${{ secrets.* }}` at template expansion time, meaning the secret value briefly appears in the expanded shell script.
    - **Recommendation:** use an `env:` variable and reference `${VAR}` (matching the pattern already used for the dispatch step itself).

---

### Low

#### Code Quality

11. **`src/lib/` directory** contains a single file but is not listed as an architecture module in README's `## Architecture Modules` section and has no `README.md` or barrel `index.ts`. It appears to be a leftover from the Vite scaffold.

12. **Inconsistent icon naming:** `moneysack256_256.png` uses underscores while all other icons use `moneysack{W}x{H}.png` (lowercase-x convention).

13. **`vite.config.ts` `includeAssets` / `manifest.icons` cross-check:** `moneysack.ico` and `moneysack180x180.png` are in `includeAssets` but not in `manifest.icons`. While technically correct, this asymmetry could confuse future maintainers.

14. **Positive/negative money-value CSS variables** (`#38a673`, `#fa2828`) are defined in the Architecture doc (section 4.2) but not present in `app.css`. The CSS defines `--error: #d03535` but no `--positive` or `--negative` variables. These should be added before M5.

#### index.html

15. **Missing `viewport-fit=cover`** in the viewport meta tag. The CSS already uses `env(safe-area-inset-bottom)` in `.app-shell`, which has no effect unless `viewport-fit=cover` is set. Should be fixed now.

16. **No `<meta name="description">` tag:** `index.html` lacks a description element. Add a brief description for search engines and share previews.

17. **No `<meta name="theme-color">` tag:** The `<head>` does not include a `<meta name="theme-color">` to match the manifest's `theme_color: '#dcdcdc'`. Browsers use this for address-bar coloring before manifest parsing.

18. **No `<noscript>` fallback:** A meaningful `<noscript>` message would improve the user experience for JavaScript-disabled contexts.

19. **`%BASE_URL%` placeholder not documented:** `index.html` uses `%BASE_URL%` in icon `href` attributes. This works with `vite-plugin-pwa`'s HTML transformation, but the mechanism is not documented. A comment would help future contributors.

#### CI/CD

20. **Triple full build in `lint-typecheck` job:** The job runs three separate Vite builds (default, production, preview). Consider dropping the default build since it's superseded by the channel-specific builds.

21. **Quadruple build per Quality run overall:** `e2e-smoke` builds via `playwright.config.ts` `webServer.command`. Combined with the triple build in `lint-typecheck`, a single Quality run produces **four full Vite builds**. Restructuring to share build artifacts across jobs would significantly reduce CI time.

22. **No Playwright browser caching:** `e2e-smoke` runs `npx playwright install --with-deps chromium` on every run. Using `actions/cache` for browser binaries would save ~30-60s per run.

23. **Branch slug Python logic in workflows is not tested:** The inline Python slugging code in `deploy-channels.yml` and `preview-cleanup.yml` has no automated tests. If it diverges from `toPreviewSlug` in `vite.config.ts`, preview cleanup could fail silently.

24. **`preview-cleanup.yml` uses top-level `permissions: contents: write`** instead of job-level permissions. For consistency with the hardened `deploy-channels.yml`, this should be moved to job level.

25. **`website-deploy-smoke.yml` does not run `npm ci`** before running the smoke script. The script currently uses only Node built-ins, but if it ever imports a dependency, the workflow will silently break.

26. **Revisit retry caps** in preview/prod smoke checks to balance reliability and quota usage on long-tail failures.

#### Security

27. **CSP/security-header runtime validation** is not yet part of smoke checks (tracked naturally by future M8 security hardening).

28. **No `Content-Security-Policy` meta tag in `index.html`:** While CSP is tracked in M8-01, a basic restrictive CSP meta tag could be added now to establish the baseline and catch regressions early.

#### Testing

29. **Playwright only tests Desktop Chrome:** `playwright.config.ts` has a single project using `devices['Desktop Chrome']`. Given the mobile-first PWA focus, at least `'Pixel 5'` and/or `'iPhone 13'` device profiles should be added.

30. **E2E test for startup env-failure UI path** (`VITE_AZURE_CLIENT_ID` missing) does not exist.

31. **No unit tests for route placeholder Svelte components** (`AccountsRoute`, `TransfersRoute`, `AddRoute`, `SettingsRoute`). Basic render tests would catch import/export breakage.

32. **More component-level tests for app shell transition and loading/error rendering states** are recommended.

33. **`hashRouting.test.ts` does not test `resolveRouteFromHash` directly:** The exported utility function has no standalone unit tests for edge cases (deeply nested hashes, query strings, empty string, non-string inputs).

34. **No test for `sumCents` edge cases:** `sumCents.test.ts` should also cover empty arrays, single-element arrays, and very large numbers for integer safety.

35. **`src/architectureAliases.test.ts`** does not verify that aliases in `vite.config.ts` match `tsconfig.app.json` paths. A comparison test would catch drift.

36. **Script tests share Vitest config with app tests** (`scripts/**/*.test.ts` under `tsconfig.node.json`). Script tests can accidentally import browser-only modules without TypeScript catching it.

#### Documentation

37. REMOVED

38. **Module README files are minimal:** `auth`, `graph`, `db`, and `cache` modules have empty barrel exports (`export {}`) and minimal READMEs. These should be updated before M3 to clarify responsibilities and expected interfaces.

39. REMOVED

40. **Version `"0.0.0"` in `package.json`:** Still at the default. Setting a meaningful version (e.g., `0.2.0` for post-M2) would improve artifact traceability.

#### Configuration

41. **`.prettierignore` ignores all `*.md` files:** Documentation markdown files are not format-checked. Inconsistent formatting in docs won't be caught by `npm run format`.

42. **ESLint ignore list does not include `playwright-report/` or `test-results/`:** The ignore block only excludes `dist`, `coverage`, `node_modules`. Running `npm run lint` locally after test failures could pick up generated artifacts.

43. **No `engines` field in `package.json`:** CI uses `node-version: 22` but `package.json` has no `engines` constraint. Adding `"engines": { "node": ">=22" }` would catch version mismatches in local development.

44. **`vite-env.d.ts` does not declare optional env variables:** Adding `VITE_DEPLOY_BASE_PATH` and `VITE_DEPLOY_PUBLIC_URL` to the `ImportMetaEnv` interface would improve autocomplete and type safety.

---

## Open Issues Summary

| Severity | Count | Key areas |
| --- | --- | --- |
| **High** | 2 | XSS vector in startup error, SyncState type mismatch with architecture |
| **Medium** | 7 | Dead code / Svelte 5 migration, normalizeBasePath/slug duplication (3+ places), empty deploy dir, dev log files, Quality concurrency, website-repo validation, secret interpolation |
| **Low** | 17 | index.html meta tags (4), icon naming, CSS design variables, CI build waste (4), security headers (2), test gaps (8), docs gaps (4), config gaps (4) |
| **Total** | 26 | |

---

## M3 Readiness Confirmation

Conclusion: **M3 can start now** from a codebase perspective.

Ready:
1. Build/test/tooling baseline is stable.
2. Module structure and aliases for `auth`, `graph`, `cache`, `db`, `features`, `shared` are in place.
3. M2 deployment and smoke infrastructure is working and hardened in this repo.

Not blocking M3 but should be tracked:
1. Address slug-normalization duplication by centralizing normalization logic or adding a shared helper contract test.
2. Fix `viewport-fit=cover` and missing `<meta>` tags in `index.html` before mobile testing begins.
3. Align `SyncState` type with architecture doc states before M4 implementation.
4. Fix `renderStartupError` XSS vector (switch from `innerHTML` to `textContent`).

---


