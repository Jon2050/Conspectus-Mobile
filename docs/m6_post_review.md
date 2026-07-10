# M6 Post-Implementation Review

Date: 2026-07-09
Repository: `Jon2050/Conspectus-Mobile`

---

## Review Scope

- **Primary focus:** Milestone 6 — Add Transfer Write Path
- **Secondary:** Regression spot-check of Milestones 1 through 5
- **Review type:** Static analysis and code reading (no commands executed, all quality gates confirmed green prior to review)

---

## Issue Coverage Matrix (M6)

| Issue | Title                                                       | Status               | Notes                                                                                                                                                     |
| ----- | ----------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #64   | M6-01 Build Add Transfer form UI (bottom sheet)             | ✅ Fully implemented | The required field surface and BottomSheet now include an accessible dialog name.                                                                         |
| #65   | M6-02 Implement account/category options loading for form   | ✅ Fully implemented | Typed source/destination options and name-sorted categories are loaded from the DB services.                                                              |
| #66   | M6-03 Implement transfer validation rules                   | ✅ Fully implemented | Name, amount, date, account membership, and primary-account rules reject invalid input before local persistence.                                          |
| #67   | M6-04 Implement transfer type derivation logic              | ✅ Fully implemented | Desktop precedence/fallback branches are implemented and unit-covered.                                                                                    |
| #68   | M6-05 Implement SQL write transaction                       | ✅ Fully implemented | The insert and balance updates are parameterized, transactional, and covered for statement rollback.                                                      |
| #69   | M6-06 Implement DB export after successful local write      | ✅ Fully implemented | Export occurs after the local commit, rejects empty bytes, and has reopen coverage.                                                                       |
| #70   | M6-07 Implement Graph upload with `If-Match` eTag           | ⚠️ Partial           | Conditional upload and eTag refresh exist, but a cache-write error after remote success is handled as a retryable upload failure (M-01).                  |
| #71   | M6-08 Implement write failure and retry UX                  | ⚠️ Partial           | In-place retry/progress handling exists, but retryable failures trap the user and save state is not safe across completed history/hash navigation (L-01). |
| #72   | M6-09 Block write flow while offline                        | ✅ Fully implemented | Warning, disabled submit, controller guard, and browser coverage are present.                                                                             |
| #73   | M6-10 Add write-path tests (unit/integration/e2e)           | ⚠️ Partial           | Core scenarios are covered, but browser tests do not prove observable post-save mutation/refresh or determinate progress values (M-02).                   |
| #74   | M6-11 Implement eTag conflict resolution UX                 | ⚠️ Partial           | Ordinary conflict recovery closes and reopens the runtime, but recovery state shares the route-lifecycle risk in L-01.                                    |
| #194  | M6-12 Fix Add Transfer draft persistence after close/reopen | ✅ Fully implemented | Ordinary close/reopen preserves the app-shell-owned draft and successful saves reset it.                                                                  |

---

## Prior Milestone Spot-Check

| Milestone | Spot-Check Result                   | Notes                                                                                                                                   |
| --------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| M1        | ⚠️ Issues found                     | The documented local deployment override is not loaded while Vite config is evaluated (M-03); CI action hardening is incomplete (M-04). |
| M2        | ⚠️ Issues found                     | Deployment base-path documentation/configuration diverge (M-03), and production workflows use mutable action tags (M-04).               |
| M3        | ✅ No static regressions identified | Auth scope, binding, and Graph-token boundaries remain aligned with the documented module contracts.                                    |
| M4        | ⚠️ Issues found                     | M6 exposes an unsafe cache-update outcome after upload (M-01).                                                                          |
| M5        | ✅ No static regressions identified | DB runtime, read-query, route, and responsive-read UI spot checks remain consistent with their documented contracts.                    |

---

## Findings

### Effort: Small

Findings that can be resolved in under 20 minutes with isolated, localized changes.

#### S-01: Graph metadata requests an unsupported download-URL field

- **Status:** ✅ Fixed
- **Severity:** High
- **Perspective:** Feature Completeness, Architecture Alignment, Bug Hunting, Testing
- **Location:** `src/graph/graphClient.ts` (lines 16, 350–374, 469–480); `src/graph/graphClient.test.ts` (lines 257–292)
- **Description:** `getFileMetadata()` selects `content.downloadUrl`, but `normalizeFileMetadata()` requires `@microsoft.graph.downloadUrl` (or a legacy fallback). Microsoft Graph's browser-download contract exposes the latter annotation; `content.downloadUrl` is not the selected annotation. A documented Graph response can therefore omit the URL and be rejected as malformed. The request-contract test fabricates the annotation response while asserting the incorrect selector, so it cannot detect the mismatch.
- **Impact:** Online snapshot download, cache refresh, and M6 conflict recovery can fail before a DB download begins. Cached data may still be used as stale fallback, but first-time loads and conflict resolution are blocked.
- **Recommendation:** Request `@microsoft.graph.downloadUrl` in the metadata `$select` value, retain parsing compatibility only where needed, and update the request-contract test to assert the documented selector and a realistic metadata payload.

#### S-02: Clearing the date field can save a transfer with an unintended historical date

- **Status:** ✅ Fixed
- **Severity:** High
- **Perspective:** Feature Completeness, Bug Hunting, Validation, Testing
- **Location:** `src/features/app-shell/routes/AddRoute.svelte` (lines 381–391); `src/features/app-shell/routes/addTransferValidation.ts` (lines 11–61); `src/features/app-shell/routes/addTransferFormState.ts` (lines 45–53); `src/features/app-shell/routes/addTransferSaveController.ts` (lines 99–120)
- **Description:** The native date input is neither `required` nor checked by `validateAddTransfer()`. When it is cleared, `isoDateToEpochDay('')` feeds empty string slices through `Date.UTC`, which normalizes them to a finite historical day instead of rejecting the value. That day reaches the SQL write path without a form-level validation message.
- **Impact:** A financial transfer can be committed and uploaded with an unintended circa-1899 booking date, making it absent from the user's expected month view and difficult to find.
- **Recommendation:** Require and strictly validate a nonempty `YYYY-MM-DD` calendar date before conversion, including round-trip calendar validity; add the native required affordance and unit/browser tests proving cleared or malformed values never invoke the write service.

#### S-03: Stale account IDs bypass form validation and surface as a generic save error

- **Status:** ✅ Fixed
- **Severity:** Medium
- **Perspective:** Feature Completeness, UI/UX, Validation, Testing
- **Location:** `src/features/app-shell/routes/addTransferValidation.ts` (lines 28–58); `src/features/app-shell/routes/addTransferSaveController.ts` (lines 99–104, 241–278); `src/features/app-shell/routes/addTransferOptionsController.ts` (lines 138–147); `src/features/app-shell/routes/AddRoute.svelte` (lines 72–78)
- **Description:** Validation only applies account-combination rules when both selected IDs resolve in the current option lists. A retained non-null ID that is no longer available after an options refresh/rebind is silently skipped, then `toCreateTransferInput()` throws a raw unavailable-account error after the controller has entered `local_save`. In the explicit options-error state, Add still leaves Submit enabled.
- **Impact:** Users receive a misleading local-save failure instead of a localized, actionable instruction to refresh or reselect an account; the closed M6 validation requirement is only partially met for stale drafts.
- **Recommendation:** Treat membership in the current source/destination option lists as required validation, keep submission disabled unless options are ready, and preserve draft editing. Add tests for stale IDs and options-load errors that assert no local-save transition or write call occurs.

#### S-04: The shared bottom-sheet dialog has no programmatic accessible name

- **Status:** ✅ Fixed
- **Severity:** Low
- **Perspective:** UI/UX, Accessibility
- **Location:** `src/features/app-shell/components/BottomSheet.svelte` (lines 73–93); `src/features/app-shell/components/BottomSheet.test.ts` (lines 7–32)
- **Description:** The native `dialog` has `aria-modal="true"` and renders a visual heading, but it does not associate that heading with the dialog through `aria-labelledby` or provide an `aria-label`. Screen-reader users can encounter an unnamed modal when opening Add Transfer.
- **Impact:** The form's purpose is less clear in assistive technology and does not meet the architecture's explicit mobile accessibility direction.
- **Recommendation:** Generate a stable heading ID and bind it with `aria-labelledby`; require a fallback label when no title is supplied. Add a component assertion for the dialog's accessible-name wiring.

#### S-05: The canonical M6 delivery documentation omits five completed issue mappings

- **Status:** ✅ Fixed
- **Severity:** Low
- **Perspective:** Documentation, Maintainability
- **Location:** `docs/Architecture-and-Implementation-Plan.md` (lines 3–7, 626–667); `docs/GitHub-Issues-MVP-Backlog.md` (lines 458–528)
- **Description:** The architecture document declares itself the detailed source of truth for milestone delivery, but its M6 implementation clarifications cover only M6-01, -04 through -07, -11, and -12. Completed M6-02, -03, -08, -09, and -10 have requirements in the backlog but no canonical implementation/source mapping.
- **Impact:** Future maintainers must rediscover ownership across controllers, stores, routes, and tests, increasing the chance of duplicating or bypassing established write-path behavior.
- **Recommendation:** Add concise implementation clarifications for the omitted issues, naming the owning modules and the essential behavior/test coverage without duplicating issue prose.

---

### Effort: Medium

Findings that require up to 60 minutes of work, potentially touching multiple files or requiring new tests.

#### M-01: A successful remote write can be retried as though it failed when cache persistence fails

- **Status:** ✅ Fixed
- **Severity:** High
- **Perspective:** Bug Hunting, Architecture Design, Sync/Caching, Testing
- **Location:** `src/features/app-shell/databaseUploadHandoffService.ts` (lines 80–140); `src/features/app-shell/transferSaveExportService.ts` (lines 78–96); `src/features/app-shell/routes/addTransferSaveController.ts` (lines 187–205, 284–322); `src/features/app-shell/databaseUploadHandoffService.test.ts` (lines 48–205)
- **Description:** `uploadFile()` and `cacheStore.writeSnapshot()` share one `try` block. If OneDrive accepts the conditional PUT but IndexedDB persistence subsequently rejects, the catch classifies that post-commit error as `upload_failed` and exposes the ordinary retry action. The cache retains the old eTag, so retrying the same bytes then conflicts; recovery downloads a DB that already contains the transfer while retaining the form for a fresh submit.
- **Impact:** A user can be told that a remote financial write failed even though it succeeded, then be guided into a conflict/re-submit path that creates a duplicate transfer.
- **Recommendation:** Make successful `uploadFile()` a distinct remote-commit boundary. On a subsequent cache failure, reconcile/download the remote snapshot and show a partial local-sync recovery state; never offer the normal upload retry or a new local insert for the original form. Add integration coverage for a cache-write rejection after Graph success and assert no duplicate insert can follow.

#### M-02: Browser write-path tests do not prove the user-visible mutation or determinate progress

- **Status:** ✅ Fixed
- **Severity:** Medium
- **Perspective:** Testing, Feature Completeness, Regression Prevention
- **Location:** `tests/e2e/app-shell.spec.ts` (lines 806–845, 2632–2659, 2683–2702); `src/features/app-shell/transferSaveExportService.integration.test.ts` (lines 26–171)
- **Description:** The browser mock only special-cases selected SQL calls and does not model transfer/account mutation. The happy-path E2E test checks toast/form reset, but never verifies that the new transfer appears in Transfers or that account balances refresh. The slow-upload case only checks that a progress component exists, not its loaded/total values while the upload remains pending.
- **Impact:** Regressions in M6's required immediate in-memory visibility, balance updates, or determinate upload rendering can pass the browser suite even though service-level transaction tests remain green.
- **Recommendation:** Use a stateful browser DB mock or a real in-browser fixture for the save journey; assert the persisted transfer and affected balances on their routes, assert progress `value`/`max` while upload is pending, and assert success remains absent until completion.

#### M-03: Documented deployment environment variables do not work as described from `.env`

- **Status:** ✅ Fixed
- **Severity:** Medium
- **Perspective:** Configuration Management, Documentation, CI/CD
- **Location:** `.env.example` (lines 5–7); `README.md` (lines 57–60); `vite.config.ts` (lines 30–51); `src/shared/config/runtimeEnv.ts` (lines 1–5, 39–52)
- **Description:** README and `.env.example` describe `VITE_DEPLOY_BASE_PATH` as a local/non-channel override, but the static Vite config reads only `process.env` and never calls `loadEnv`. Vite therefore evaluates the config before `.env` values are injected. `VITE_DEPLOY_PUBLIC_URL` is normalized by runtime-env code but has no production consumer in the repository.
- **Impact:** A developer following the documented setup cannot change the build base path through `.env`; generated paths, manifest scope, and service-worker scope can differ from the stated local configuration. The unused public URL also misleads deployment operators.
- **Recommendation:** Convert the config to a mode-aware `defineConfig` callback that explicitly loads supported values with Vite's `loadEnv`, add a focused config test for the `.env` override, and either implement a clear consumer for the public URL or remove it from the contract and documentation.

#### M-04: Mutable GitHub Action tags are allowed in secret-bearing workflows

- **Status:** ✅ Fixed (repository-policy activation is required after these pinned workflows publish)
- **Severity:** Medium
- **Perspective:** Security, CI/CD, Supply-Chain Security
- **Location:** GitHub Actions repository policy (`allowed_actions: all`, `sha_pinning_required: false`); `.github/workflows/quality.yml` (lines 24, 129, 139, 169, 179, 220, 230, 247, 266, 269, 274, 298, 308, 325, 331); `.github/workflows/deploy-preview.yml` (lines 171, 176); `.github/workflows/deploy-production.yml` (lines 40, 110, 156, 202–252)
- **Description:** The repository permits all actions without SHA pinning, while most workflow actions use mutable major-version tags such as `actions/checkout@v4`. The production workflow later supplies `WEBSITE_REPO_DISPATCH_TOKEN` to repository scripts. A compromised upstream action tag can alter the checked-out worktree or workflow execution before that secret-bearing step runs.
- **Impact:** The deployment pipeline has an avoidable third-party action supply-chain path to a cross-repository dispatch credential and production handoff.
- **Recommendation:** Pin every third-party and GitHub-maintained action to a reviewed full commit SHA with a version comment, enable required SHA pinning in repository Actions policy, and document the deliberate update/review process for action revisions.

---

### Effort: Large

Findings that require more than 60 minutes, involving architectural changes, cross-cutting concerns, or significant refactoring.

#### L-01: Retry and conflict recovery state is both modal-trapping and route-lifecycle fragile

- **Severity:** High
- **Perspective:** Feature Completeness, UI/UX, Bug Hunting, Testing
- **Location:** `src/features/app-shell/routes/addTransferSaveController.ts` (lines 137–144, 187–205, 284–297); `src/features/app-shell/routes/AddRoute.svelte` (lines 46, 70, 261–265, 537–543); `src/features/app-shell/components/BottomSheet.svelte` (lines 12–60); `src/features/app-shell/hashRouting.ts` (lines 93–102); `src/features/app-shell/AppShell.svelte` (lines 56, 397–405); `tests/e2e/app-shell.spec.ts` (lines 2738–2770)
- **Description:** A retryable upload failure sets `canRetry`, which disables the Close button and makes the modal reject cancel/backdrop close; no safe dismiss, durable pending-state surface, or explicit discard/recovery option exists. The exact pending bytes and conflict state are closure-local to the default controller created by `AddRoute`, while AppShell persists only form fields. **Assumption:** if a browser/history/hash navigation completes while this dialog is open, the unguarded hash store replaces `AddRoute`, losing the pending bytes; reopening Add then creates a fresh controller and can perform another local write instead of retrying. The code proves the loss after a completed route change, but no browser execution was permitted to establish the hardware-Back behavior for each supported mobile browser.
- **Impact:** The confirmed path traps a user during a transient failure, contrary to M6-08's non-trapping retry requirement. Under the stated browser-history assumption, it can also turn a recoverable upload failure or conflict into a duplicate financial write.
- **Recommendation:** Move the save/recovery operation and pending exported snapshot to app-shell or dedicated operation-store ownership, render a persistent pending-sync state outside the sheet, and provide an explicit safe leave/discard/recovery choice. Guard or restore completed hash/history navigation until resolution. Add browser tests for retryable failure and conflict followed by navigation/history traversal, verifying that the original bytes—not a second SQL write—are used.

---

## Next Milestone Readiness

### Ready

- Account-scoped file binding, local reset/rebind, cache metadata, sync-state transitions, and runtime open/close boundaries are usable foundations for M7.
- The M6 write modules already isolate SQL transactions, export, conditional upload, and conflict-recovery orchestration behind typed interfaces.
- Settings and app-shell infrastructure provide a viable place to add M7 force refresh, diagnostics, safety messaging, and recovery actions.

### Blockers or Risks

- L-01 still leaves retry and conflict recovery modal-trapping and route-lifecycle fragile; resolve it before exposing more end-user recovery controls in M7.
- M-04 requires an administrator to enable GitHub's full-length SHA pinning policy after the pinned workflow revision is published to the default branch.
- M7's planned force refresh, safety notice, diagnostics, stale-token, and moved-file recovery are still future scope rather than completed functionality.

---

## Summary

| Effort    | Count | Critical | High | Medium | Low | Invalidated | Solved |
| --------- | ----- | -------- | ---- | ------ | --- | ----------- | ------ |
| Small     | 5     | 0        | 2    | 1      | 2   | 0           | 5      |
| Medium    | 4     | 0        | 1    | 3      | 0   | 0           | 4      |
| Large     | 1     | 0        | 1    | 0      | 0   | 0           | 0      |
| **Total** | 10    | 0        | 4    | 4      | 2   | 0           | 9      |
