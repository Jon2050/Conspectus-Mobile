# M4 Post-Implementation Review

Date: 2026-03-12
Repository: `Jon2050/Conspectus-Mobile`
Second-pass reviewer: Antigravity

---

## Review Scope

- **Primary focus:** Milestone 4 — Sync Engine + Cache
- **Secondary:** Regression spot-check of Milestones 1 through 3
- **Review type:** Static analysis and code reading (no commands executed, all quality gates confirmed green prior to review)
- **Second-pass scope:** Full codebase re-read of all 77+ source files, 3 CI/CD workflows, and all configuration files. Each prior finding verified against source. New findings discovered.

---

## Issue Coverage Matrix (M4)

| Issue | Title                                                        | Status               | Notes                                                                                                                                                                                                          |
| ----- | ------------------------------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #47   | M4-01 Define Dexie schema for DB cache and metadata          | ✅ Fully implemented | Dexie schema v1 in `src/cache/dexieCacheStore.ts` with `databaseSnapshots` and `syncMetadata` tables keyed by `[driveId+itemId]`. `CacheStore` interface + factory cleanly exported from `src/cache/index.ts`. |
| #48   | M4-02 Implement Graph metadata fetch (eTag and file info)    | ✅ Fully implemented | `getFileMetadata` in `src/graph/graphClient.ts` returns typed `GraphFileMetadata` with `eTag`, `sizeBytes`, `lastModifiedDateTime`.                                                                            |
| #49   | M4-03 Implement file download and cache write                | ✅ Fully implemented | `downloadFile` with progress callback + `cachedDatabaseSnapshotService.ts` validates SQLite header, size, then delegates to `cacheStore.writeSnapshot`.                                                        |
| #50   | M4-04 Implement startup freshness decision tree              | ✅ Fully implemented | `startupFreshnessService.ts` implements a complete decision tree with deterministic online/offline/stale/error branches and development-only telemetry logging.                                                |
| #51   | M4-05 Implement sync state machine for UI                    | ✅ Fully implemented | `syncStateStore.ts` enforces guarded state transitions (`idle → syncing → synced/stale/offline/error`) with progress tracking. `startupSyncStateController.ts` maps decisions to UI toasts.                    |
| #52   | M4-06 Add retry and backoff for transient sync failures      | ✅ Fully implemented | `executeWithRetry` in `startupFreshnessService.ts` uses capped exponential backoff (`250ms → 500ms → 1000ms`) and retries only normalized `network_error` failures.                                            |
| #53   | M4-07 Add sync/cache integration tests                       | ✅ Fully implemented | `startupFreshnessService.test.ts` and `tests/e2e/app-shell.spec.ts` cover the decision matrix, retry exhaustion behavior, and offline cache-hit/cache-miss outcomes.                                           |
| #54   | M4-08 Implement progress feedback for DB sync and upload ops | ⚠️ Partial           | User-visible download progress is implemented in `AppShell.svelte`, but upload progress is only plumbed in `src/graph/graphClient.ts`; no current save flow or UI consumes it yet.                             |
| #63   | M4-99 Add end-of-page deployment info footer bar             | ✅ Fully implemented | `DeploymentInfoFooter.svelte` with visibility tracking (scroll + ResizeObserver), `buildInfo.ts` loads `deploy-metadata.json` at runtime with compile-time fallback.                                           |

---

## Prior Milestone Spot-Check

| Milestone | Spot-Check Result | Notes                                                                                                                                         |
| --------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| M1        | ✅ No regressions | Svelte scaffolding, aliases, and environment variables remain intact. `App.svelte` still delegates to `AppShell`.                             |
| M2        | ✅ No regressions | E2E Playwright infrastructure intact. Hash routing, PWA manifest, service worker scope, and deployment channel builds still pass.             |
| M3        | ✅ No regressions | Auth flow, MSAL bootstrap, file binding persistence, settings controllers all preserved. M3 review findings (S-01 through S-08) remain fixed. |

---

## Findings

### Effort: Small

Findings that can be resolved in under 20 minutes with isolated, localized changes.

#### S-01: Footer visibility flickers when scrolling the Settings page

- **Status:** Fixed ✅
- **Severity:** Medium
- **Perspective:** UI/UX Bug (User-reported)
- **Location:** `src/features/app-shell/AppShell.svelte` (lines 87-140), `src/features/app-shell/components/DeploymentInfoFooter.svelte` (lines 40-58)
- **Description:** When scrolling down the Settings page (and potentially other scrollable pages), the bottom area of the UI — including the page selector navigation and the `DeploymentInfoFooter` — flickers visibly if the scrollbar is not fully at the bottom. The `updateFooterVisibility` function at line 87 uses a threshold-based comparison (`scrollTop + clientHeight >= scrollHeight - FOOTER_VISIBILITY_THRESHOLD_PX`) to determine whether the footer should be visible. Because the `DeploymentInfoFooter` itself transitions between `max-height: 0` and `max-height: 3rem` via CSS, toggling its visibility changes the `scrollHeight` of the content container. This creates a feedback loop: showing the footer increases `scrollHeight`, which causes the scroll position check to re-hide it, which reduces `scrollHeight`, which re-shows it. This oscillation manifests as visual flickering.
- **Impact:** Medium. The flickering is noticeable during normal scrolling and detracts from the polished feel of the application. It affects every scrollable page, not just Settings.
- **Recommendation:** Break the feedback loop by decoupling the footer's space reservation from its visibility state. One approach: always reserve the footer's height in the layout (e.g., via `visibility: hidden` instead of `max-height: 0` when not visible) so that `scrollHeight` remains stable regardless of footer visibility. Alternatively, debounce the `updateFooterVisibility` calls or use `requestAnimationFrame` coalescing to prevent rapid successive toggling within a single scroll frame.
- **Second reviewer notes:** Confirmed via code reading. The `DeploymentInfoFooter` CSS at lines 40-58 transitions `max-height` and `padding`, directly affecting the parent `scrollHeight`. The `updateFooterVisibility` at line 94 rechecks `scrollHeight` on every scroll event, resize event, and ResizeObserver callback — all three independently trigger while the CSS transition is still animating, amplifying the oscillation.
- **Resolution:** Fixed in local review follow-up. `AppShell.svelte` now applies footer-visibility hysteresis so near-bottom layout changes do not immediately toggle the footer back off, and the Playwright footer test now asserts there is only one reveal and one hide transition.
  Reviewed by: Codex, Antigravity

#### ~~S-02: Post-deployment auth/sync errors require manual re-authentication~~

**INVALIDATED** by Codex: the inspected code does not support this finding's stated root cause. There is no service-worker update logic in this repository that clears MSAL localStorage, and `interaction_required` auth failures are normalized to `unauthorized`, not retried as network errors. The underlying user-reported startup recovery problem is still real, but it is more accurately captured by `M-02`.

**Second reviewer concurs:** The invalidation is correct. `registerSW({ immediate: true })` in `main.ts` (line 41) uses `vite-plugin-pwa`'s auto-update mode, which does not touch `localStorage`. MSAL's `BrowserCacheLocation.LocalStorage` cache (line 197 of `msalAuthClient.ts`) persists across service worker updates. The actual user-facing recovery issue is correctly attributed to M-01 and M-02.

- **Status:** Invalidated
- **Severity:** High
- **Perspective:** Bug Hunting / User-reported
- **Location:** `src/features/app-shell/AppShell.svelte` (lines 148-196), `src/auth/msalAuthClient.ts` (lines 312-338)
- **Description:** After a new version of the app is deployed, if a Microsoft Account was already signed in and a DB file was selected, the startup freshness service encounters errors (e.g., "Unable to download the latest OneDrive database snapshot..."). This happens because the service worker update clears browser caches (including MSAL's token cache in `localStorage`), and the new app bundle attempts to acquire tokens silently via `acquireTokenSilent`. When the cached refresh token or session state is invalidated by the deployment, `acquireTokenSilent` throws an `InteractionRequiredAuthError`. The startup freshness service wraps this in a retry loop, but `interaction_required` errors are non-retryable (correctly classified as non-transient), so the error surfaces immediately. The user must manually sign out and sign back in to re-establish a valid MSAL session.
- **Impact:** High. Every deployment forces previously authenticated users to perform a manual sign-out/sign-in cycle, which is a poor user experience and defeats the purpose of seamless updates.
- **Recommendation:** Add an `interaction_required` recovery path in the startup sync flow. When `getFileMetadata` or `downloadFile` fails with an auth error whose underlying cause is `interaction_required`, the app should either: (a) automatically trigger a silent token refresh via MSAL's `ssoSilent` or `acquireTokenRedirect` with `prompt: 'none'`, or (b) surface a targeted "Session expired — please sign in again" prompt that redirects the user to re-authenticate in a single action, rather than showing a generic sync error. Additionally, consider handling the `InteractionRequiredAuthError` at the `GraphClient` level so it can be distinguished from true network errors.

#### ~~S-03: `graphClientResolver` leaks a stale singleton after sign-out~~

**INVALIDATED** by Codex: this is a speculative future-risk note, not a concrete defect in the current repository state. `resolveAppGraphClient()` and `resolveAppAuthClient()` deliberately share the same app-lifetime singleton scope, and the review prompt explicitly disallows non-concrete findings.

**Second reviewer concurs:** Both singletons (`sharedAuthClient` in `authClientResolver.ts` line 9 and `sharedGraphClient` in `graphClientResolver.ts` line 12) are module-level and share the same lifecycle. The `GraphClient` delegates to the `AuthClient` on every request, so no stale token reference is possible. Sign-out redirects the page, which resets all module state.

- **Status:** Invalidated
- **Severity:** Low
- **Perspective:** Code Quality / Resource Management
- **Location:** `src/features/app-shell/graphClientResolver.ts` (lines 12, 27-33)
- **Description:** The `resolveAppGraphClient` function caches a `GraphClient` instance in a module-level `sharedGraphClient` variable. This singleton is created once and never cleared, even when the user signs out. Because the `GraphClient` factory binds an `authClient` reference at construction time, the singleton correctly delegates token acquisition on each request. However, if the `AuthClient` instance itself is ever replaced or reset (e.g., during a local data reset), the `GraphClient` singleton will continue to hold a reference to the old `AuthClient`. While this does not currently cause issues because the auth client singleton also persists, it creates a fragile coupling that could lead to stale-reference bugs if either singleton lifecycle changes in the future.
- **Impact:** Low. Currently safe because both singletons share the same lifecycle. But the lack of a `reset` mechanism means tests or future flows that reinitialize auth cannot guarantee a clean graph client.
- **Recommendation:** Add a `resetAppGraphClient()` function that sets `sharedGraphClient = null`, and call it from the sign-out or local data reset flows alongside the auth reset.

#### ~~S-04: `syncStateStore` allows `synced → stale` transition but not `stale → synced`~~

**INVALIDATED** by Codex: the current M4 flow always returns to `synced` through `syncing`, and no code path in the repository requires a direct `stale -> synced` transition. This finding is future-facing design advice rather than a present defect.

**Second reviewer concurs:** The `ALLOWED_SYNC_STATE_TRANSITIONS` table at line 43 permits `stale: ['syncing', 'offline', 'error']`. The startup flow always resets via `syncStateStore.reset()` on mount (line 146) before entering `syncing`, so the `stale → synced` path is never needed. This is a deliberate design choice for the current one-shot startup architecture.

- **Status:** Invalidated
- **Severity:** Low
- **Perspective:** Architecture / State Machine Design
- **Location:** `src/shared/state/syncStateStore.ts` (lines 39-46)
- **Description:** The `ALLOWED_SYNC_STATE_TRANSITIONS` map permits `synced → stale` but does not permit `stale → synced`. This means once the app enters a `stale` state (e.g., metadata fetch failed but cached data was used), there is no direct path back to `synced` without first transitioning through `syncing`. While this is technically correct for the current startup-only sync flow (a re-sync would always go through `syncing` first), it creates an unnecessarily restrictive state machine. If a future background refresh successfully syncs while the app is in `stale`, the transition `stale → synced` would be blocked, requiring an intermediate reset or `stale → syncing → synced` dance.
- **Impact:** Low. The current startup-only flow always resets the store on mount, so this never manifests. It becomes relevant only when background sync is introduced.
- **Recommendation:** Add `'synced'` to the `stale` transition list in `ALLOWED_SYNC_STATE_TRANSITIONS` to future-proof the state machine for background sync scenarios planned in later milestones.

#### ~~S-05: `cachedDatabaseSnapshotService` does not verify the `eTag` of the downloaded bytes against the metadata~~

**INVALIDATED** by Codex: this is a narrow race-condition hypothesis without repository evidence that it currently manifests incorrectly. The implementation matches the documented M4 contract of metadata check followed by full download and cache write, and the review prompt prohibits speculative findings without a demonstrated concrete defect.

**Second reviewer concurs:** The `downloadAndCacheSnapshot` method at lines 55-75 of `cachedDatabaseSnapshotService.ts` correctly validates the downloaded byte length against `metadata.sizeBytes` and the SQLite header. The theoretical eTag mismatch from a mid-flight update on OneDrive is self-correcting: the next startup detects the stale eTag and re-downloads. The Graph API `downloadFile` endpoint does not support `If-Match` headers on content endpoints, so there is no practical way to enforce eTag match on download.

- **Status:** Invalidated
- **Severity:** Low
- **Perspective:** Data Integrity / Defensive Programming
- **Location:** `src/features/app-shell/cachedDatabaseSnapshotService.ts` (lines 59-74)
- **Description:** The `downloadAndCacheSnapshot` method accepts a `metadata` parameter containing the expected `eTag` and `sizeBytes`. It validates that the downloaded byte array matches the expected size and starts with the SQLite magic header. However, it does not verify that the downloaded content's actual `eTag` matches the metadata's `eTag`. Between the `getFileMetadata` call and the `downloadFile` call, the file could be updated on OneDrive, resulting in a downloaded payload whose content no longer corresponds to the `eTag` stored in the cache metadata. This creates a silent data inconsistency: the cache stores bytes from version N+1 but metadata claiming version N.
- **Impact:** Low. The window for this race condition is narrow (between metadata fetch and download), and the next startup will detect the `eTag` mismatch and re-download. However, during the current session, the app may operate on data that doesn't match the cached metadata.
- **Recommendation:** After downloading, make a lightweight `HEAD` or metadata re-fetch to verify the `eTag` still matches before caching. Alternatively, use the `@microsoft.graph.downloadUrl` with an `If-Match` header to ensure the download corresponds to the expected `eTag`, or accept this as a known-benign race and document it.

#### ~~S-06: `DeploymentInfoFooter` fetches `deploy-metadata.json` on every mount without caching~~

**INVALIDATED** by Codex: in the current architecture the footer mounts once per app lifetime, so this does not create a concrete performance issue. The finding is a micro-optimization suggestion rather than a defect.

**Second reviewer concurs:** `DeploymentInfoFooter.svelte` is rendered inside `AppShell.svelte` (line 318), which is rendered once from `App.svelte`. The footer never unmounts during normal app usage. The `loadBuildInfo()` call is effectively a one-shot fetch.

- **Status:** Invalidated
- **Severity:** Low
- **Perspective:** Performance / Efficiency
- **Location:** `src/features/app-shell/components/DeploymentInfoFooter.svelte` (lines 21-24), `src/shared/config/buildInfo.ts` (lines 48-79)
- **Description:** The `DeploymentInfoFooter` component calls `loadBuildInfo()` in its `onMount` hook, which performs a `fetch` request for `deploy-metadata.json` every time the component mounts. Since the footer is part of the `AppShell`, it mounts once per app lifecycle under normal conditions. However, if the `AppShell` were ever unmounted and remounted (e.g., during hot-module replacement in development, or future route-level code splitting), the fetch would be repeated unnecessarily. The `deploy-metadata.json` content is static per deployment and cannot change during a session.
- **Impact:** Low. Under the current architecture, this fetches exactly once in production. The impact is limited to development mode (HMR) where remounts are common.
- **Recommendation:** Cache the result of `loadBuildInfo()` in a module-level variable after the first successful fetch, so subsequent calls return the cached value immediately. This is a minor efficiency improvement.

#### ~~S-07: Upload progress uses `XMLHttpRequest` while download uses `fetch`, creating inconsistent error handling paths~~

**INVALIDATED** by Codex: this is an architectural style preference, not a demonstrated bug. The split is an intentional consequence of browser platform limits (`fetch` does not expose upload progress), and the current tests cover both branches successfully.

**Second reviewer concurs:** The `uploadFile` method at line 495 of `graphClient.ts` uses XHR only when `onProgress` is provided — when no progress callback is needed, it falls back to the `fetch`-based `executeRequest` at line 585. The dual-path error normalization (`normalizeXhrError` at line 253 and `normalizeHttpError` at line 232) both produce `GraphClientError` with the same `mapStatusToErrorCode` mapping. The `graphClient.test.ts` file covers both paths.

- **Status:** Invalidated
- **Severity:** Low
- **Perspective:** Code Quality / Maintainability
- **Location:** `src/graph/graphClient.ts` (upload: lines ~450-560, download: lines ~350-420)
- **Description:** The `uploadFile` method uses `XMLHttpRequest` to support upload progress tracking (via `xhr.upload.onprogress`), while `downloadFile` uses the `fetch` API with `ReadableStream` for download progress. This dual-API approach means error handling, timeout behavior, and abort semantics differ between the two code paths. The XHR path manually constructs `GraphClientError` from HTTP status codes and XHR events, while the fetch path uses the shared `normalizeGraphFetchError` function. Both paths ultimately produce `GraphClientError`, but through different normalization code, increasing the risk of subtle behavioral differences.
- **Impact:** Low. Both paths produce correct, typed errors today. The risk is in future maintenance drift where a fix to one error path is not replicated in the other.
- **Recommendation:** Document the reason for the dual-API pattern (fetch cannot report upload progress) with a prominent comment. Consider extracting common error-handling logic into a shared helper that both paths can call, reducing the surface area for maintenance drift.

#### S-08: `ToastContainer` close button lacks `type="button"` and uses redundant keydown handler

- **Status:** Fixed ✅
- **Severity:** Low
- **Perspective:** Code Quality / UI/UX
- **Location:** `src/features/app-shell/components/ToastContainer.svelte` (lines 19-28)
- **Description:** The toast item is implemented as a `<button>` without the `type="button"` attribute. By default, a button without a type acts as a submit button if placed inside a form. While not currently in a form context, this is a fragility. Additionally, the component binds `on:keydown` to manually trigger `removeToast` when Enter or Space is pressed. Because native `<button>` elements already dispatch a `click` event on Enter and Space, pressing these keys actually calls `removeToast(id)` twice.
- **Impact:** Low. The `removeToast` action is idempotent so the double-invocation is invisible to the user, and the lack of `type="button"` doesn't break the current layout.
- **Recommendation:** Add `type="button"` to the `<button>` element and remove the redundant `on:keydown` event listener entirely.
- **Second reviewer notes:** Confirmed. Lines 19-28 of `ToastContainer.svelte` show `<button class="toast toast--{toast.type}" ... on:click={() => removeToast(toast.id)} on:keydown={(e) => handleKeydown(e, toast.id)}>`. The `handleKeydown` at lines 10-13 fires `removeToast` on Enter/Space, duplicating the browser's native button click behavior. The `remove` function in `toastStore.ts` (line 24) calls `update((toasts) => toasts.filter(...))` — the second call is harmless but wasteful.
- **Resolution:** Fixed in local review follow-up. `ToastContainer.svelte` now uses `type="button"` and relies on native button keyboard activation only, with a focused component test covering the button contract.
  Reviewed by: Codex, Antigravity

#### S-09: `BottomSheet` dialog implementation lacks focus trapping

- **Status:** Fixed ✅
- **Severity:** Low
- **Perspective:** UI/UX / Accessibility
- **Location:** `src/features/app-shell/components/BottomSheet.svelte` (lines 34-39)
- **Description:** The `BottomSheet` component uses the native `<dialog>` element but mounts it with the `open` attribute (`<dialog open>`) alongside a separate `<div>` for the backdrop, rather than using the `HTMLDialogElement.showModal()` API. Because it does not use `showModal()`, the dialog does not natively trap focus. Keyboard users (tabbing) can escape the bottom sheet and interact with hidden elements underneath it, breaking accessibility guidelines for modal overlays.
- **Impact:** Low to Medium. Screen reader and keyboard-only users will experience a broken navigation flow when a bottom sheet is open.
- **Recommendation:** Refactor the component to use the `.showModal()` API upon mounting (e.g., via a Svelte action or `bind:this` + `onMount`) to leverage the browser's native focus trapping and backdrop management mechanism, removing the need for a separate backdrop `<div>`.
- **Second reviewer notes:** Confirmed. The component at lines 24-51 renders a `<div class="bottom-sheet__backdrop">` and `<dialog open>` as siblings. The `SettingsRoute.svelte` uses the native `<dialog>` with `showModal()` for its confirmation flow (line 207), demonstrating that the correct pattern is already used elsewhere in the codebase, making this an inconsistency.
- **Resolution:** Fixed in local review follow-up. `BottomSheet.svelte` now uses `HTMLDialogElement.showModal()` plus native `::backdrop` styling instead of a sibling backdrop node, and regression tests cover the modal-dialog contract.
  Reviewed by: Codex, Antigravity

#### S-10: `SettingsFileBindingController` does not roll back `folderStack` on `loadItems` network failure

- **Status:** Fixed ✅
- **Severity:** Low
- **Perspective:** Bug Hunting / State Management
- **Location:** `src/features/app-shell/routes/settingsFileBindingController.ts` (lines 204-250, 305-314)
- **Description:** When a user clicks to open a folder in the OneDrive browser, the controller immediately pushes the new folder to the `folderStack` array and calls `loadItems()`. If `loadItems()` fails (e.g., network timeout or offline), the `catch` block emits an error state and sets `items: []`, but it does not roll back the `folderStack` pop/push operation. The UI is left showing the new folder's path in the header and an empty list of files. Since `hasLoaded` is set to true, the user sees "No folders or .db files found here" along with the error banner. The user must manually click "Back to parent folder" to escape this broken state, effectively losing their original context.
- **Impact:** Low. Requires a network drop exactly when navigating folders. The user can recover by navigating back or cancelling.
- **Recommendation:** In the `catch` block of `loadItems`, or inside `openFolder`, catch the error and pop the failing folder off the `folderStack` before emitting the error state, so the user remains in the previously loaded, valid folder context.
- **Second reviewer notes:** Confirmed. The `openFolder` method at line 300 pushes to `folderStack` at line 305 before awaiting `loadItems`. The `loadItems` catch block at lines 233-249 calls `updateState` with `items: []` but never modifies `folderStack`. The `updateState` helper at line 182 derives `currentFolder: folderStack.at(-1) ?? null`, so the UI will show the failed folder's path. `goBack` (line 316) would work to recover, but the error state combined with the wrong folder path is confusing.
- **Resolution:** Fixed in local review follow-up. `settingsFileBindingController.ts` now restores the previous folder stack and list state when folder-open or go-back loads fail, and unit coverage locks both rollback paths.
  Reviewed by: Codex, Antigravity

#### S-11: `Deploy Production` validates an env var that the workflow never exports

- **Status:** Fixed ✅
- **Severity:** High
- **Perspective:** CI/CD
- **Location:** `.github/workflows/deploy-production.yml` (lines 6-11, 99-119)
- **Description:** The manual production workflow checks `VITE_AZURE_CLIENT_ID` before build, but unlike `quality.yml` it never maps `${{ vars.VITE_AZURE_CLIENT_ID }}` into the workflow environment. As written, the `Validate required runtime env` step can only succeed if the runner already has that variable from some outside source, which the repository workflow does not provide.
- **Impact:** Production deployments are blocked by configuration that the workflow itself forgets to inject, even when the repository variable is correctly set and preview builds are green.
- **Recommendation:** Export `VITE_AZURE_CLIENT_ID` at workflow or job scope in `deploy-production.yml`, mirroring the `Quality` workflow, and add a script/workflow test that guards this contract so preview and production pipelines cannot drift again.
- **Second reviewer notes:** Confirmed. `quality.yml` line 9 sets `VITE_AZURE_CLIENT_ID: ${{ vars.VITE_AZURE_CLIENT_ID }}` at workflow-level `env`. `deploy-production.yml` lines 6-11 define five env vars but omit `VITE_AZURE_CLIENT_ID`. The npm build step at line 119 (`npm run build`) only receives `DEPLOY_CHANNEL: production` as step-level env. Vite requires `VITE_AZURE_CLIENT_ID` during build to embed the client ID — without it, the build would produce an app that fails at runtime startup via `RuntimeEnvError` in `runtimeEnv.ts` line 42.
- **Resolution:** Fixed in local review follow-up. `deploy-production.yml` now exports `VITE_AZURE_CLIENT_ID` at workflow scope, and `scripts/deploy-utils.test.ts` asserts the production workflow keeps the same client-id injection contract as `quality.yml`.
  Reviewed by: Codex, Antigravity

#### S-12: Settings route and confirmation dialog use hardcoded light-mode-only colors

- **Status:** Open | 🆕 Found by second reviewer
- **Severity:** Low
- **Perspective:** UI/UX / Dark Mode
- **Location:** `src/features/app-shell/routes/SettingsRoute.svelte` (lines 478-485, 493-499, 554-555, 576-577)
- **Description:** The `SettingsRoute.svelte` component hardcodes several color values that are only appropriate for light mode and do not adapt to the dark color scheme. Specifically: (1) The `settings-screen__auth-error` class at line 484 uses `color: #991b1b` and `background: #fef2f2`. (2) The `settings-screen__binding-error` class at line 498 repeats the same hardcoded values. (3) The `settings-screen__confirmation` dialog at lines 554-555 uses `background: #fef2f2`. (4) The `settings-screen__confirmation-error` at line 576 uses `color: #7d1111`. These are all red-on-light-pink color combinations that work on white backgrounds but become nearly invisible or jarring against the dark mode surface colors (`--surface-strong: #374151` in dark mode). The rest of the app uses CSS custom properties (e.g., `var(--negative)`, `var(--surface-strong)`) to adapt to both color schemes, but these error/confirmation surfaces were not updated.
- **Impact:** Low. Error messages in Settings become hard to read or visually inconsistent in dark mode. The confirmation dialog background clashes with the dark surface.
- **Recommendation:** Replace the hardcoded colors with CSS custom properties. For error text, use `color: var(--negative)` or define a dedicated `--error-text` / `--error-bg` pair in `:root` and the dark-mode media query. For the confirmation dialog, use `var(--surface-strong)` for the background and appropriate text colors. The `startup-sync-status--error` styles in `AppShell.svelte` (line 358) already demonstrate the correct pattern using `color-mix(in srgb, var(--negative) ...)`.
  Reviewed by: Antigravity

#### S-13: `toastStore` timer cleanup is not guaranteed on app teardown

- **Status:** Open | 🆕 Found by second reviewer
- **Severity:** Low
- **Perspective:** Code Quality / Resource Management
- **Location:** `src/shared/state/toastStore.ts` (lines 12-46)
- **Description:** The `createToastStore` function maintains a `timers` Map that holds `setTimeout` handles for each active toast's auto-dismiss timer. These timers are only cleaned up when individual toasts are removed via `remove()` or when `clear()` is explicitly called. There is no automatic cleanup when the store is no longer referenced or when the application is torn down. In the current architecture, the `appToastStore` is a module-level singleton that lives for the entire page lifetime, so this is not a practical leak. However, `createToastStore` is a public factory — any consumer creating a local toast store (e.g., in tests or future component-scoped usage) would need to remember to call `clear()` on cleanup, or the timers continue firing and calling `remove()` on a potentially stale store reference.
- **Impact:** Low. The singleton usage pattern prevents this from manifesting in production. Test harnesses may accumulate orphaned timers if they create toast stores without calling `clear()`.
- **Recommendation:** Document that `clear()` must be called before discarding a toast store, or expose a `destroy()` method that calls `clear()` and marks the store as disposed. Alternatively, use `WeakRef` or tie the timer lifecycle to a Svelte `onDestroy` hook when used in component scope.
  Reviewed by: Antigravity

---

### Effort: Medium

Findings that require up to 60 minutes of work, potentially touching multiple files or requiring new tests.

#### M-01: Startup freshness flow does not distinguish auth errors from Graph API errors

- **Status:** Open | ✅ Confirmed by second reviewer
- **Severity:** Medium
- **Perspective:** Architecture / Error Handling
- **Location:** `src/features/app-shell/startupFreshnessService.ts` (lines 270-352), `src/graph/graphClient.ts` (lines 70-140)
- **Description:** The `startupFreshnessService` uses `graphClient.getFileMetadata()` and `snapshotService.downloadAndCacheSnapshot()`, both of which can fail due to auth errors (expired tokens, `interaction_required`) or Graph API errors (network, forbidden, not_found). The service's retry logic correctly distinguishes `network_error` as retryable, but auth-related errors (e.g., `interaction_required` thrown by `acquireTokenSilent` inside `getAccessToken`) are wrapped by the Graph client into a `GraphClientError` with code `unauthorized` or rethrown as-is. The startup service then treats these identically to other non-retryable errors, showing a generic "Failed to refresh the selected OneDrive database metadata" message. The user sees no indication that the issue is authentication-related and that signing out/in would resolve it.
- **Impact:** Medium. This directly contributes to the user-reported post-deployment startup recovery issue. Users cannot distinguish between a genuine Graph API failure and an expired auth session, leading to confusion and unnecessary manual recovery.
- **Recommendation:** Introduce an `auth_expired` or `interaction_required` error code at the `startupFreshnessService` level. When the underlying error cause is an auth error, surface a specific message like "Your session has expired. Please sign in again to sync with OneDrive." Consider adding a dedicated `StartupFreshnessBranch` (e.g., `online_auth_expired`) that the `startupSyncStateController` can handle differently — potentially offering a "Sign in again" action button in the sync status banner.
- **Second reviewer notes:** Confirmed. The `normalizeAuthError` function in `graphClient.ts` at line 192 maps `interaction_required`, `no_active_account`, and `not_initialized` to `GraphClientError` with code `unauthorized`. The `isRetryableStartupSyncError` check in `startupFreshnessService.ts` at line 171 only retries `network_error`. So an `unauthorized` error from an expired token immediately falls through to the outer catch at line 328, producing a generic `metadata_fetch_failed` failure. The error code distinguishes from network issues internally but the user-facing message does not.
  Reviewed by: Codex, Antigravity

#### M-02: Persisted bindings restored after interactive sign-in do not trigger a fresh sync until reload

- **Status:** Open | ✅ Confirmed by second reviewer
- **Severity:** Medium
- **Perspective:** Next Milestone Readiness / Bug Hunting
- **Location:** `src/features/app-shell/AppShell.svelte` (lines 54-61, 159-185), `src/features/app-shell/routes/SettingsRoute.svelte` (lines 125-137)
- **Description:** `AppShell.svelte` runs the startup freshness resolution exactly once during initial mount using the binding value available at that moment. Later binding changes only call `syncStateStore.reset()` through the binding-store subscription. When a user signs in after startup and `SettingsRoute.svelte` rehydrates a previously persisted binding for the now-active account, the app updates the selected binding but never reruns metadata refresh or snapshot download for that restored DB selection.
- **Impact:** Medium. Today this mainly shows up as confusing state after re-authentication; once M5 starts reading from the cached snapshot, a signed-in session can still require a full page reload before the newly restored binding actually has fresh DB bytes available.
- **Recommendation:** Move startup freshness orchestration behind an account/binding-driven effect instead of a one-shot mount task. When the active account or selected binding changes from `null` to a concrete value, cancel any stale in-flight resolution and start a fresh metadata/cache sync for the new binding. Add an e2e scenario that signs in after initial unauthenticated load and verifies the restored binding triggers sync without reload.
- **Second reviewer notes:** Confirmed. The `onMount` in `AppShell.svelte` at line 143 calls `startupFreshnessService.resolve(...)` once with the binding from `get(appSelectedDriveItemBindingStore)` at that point. The `unsubscribeSelectedBinding` at line 54 resets sync state on binding changes but does not trigger a re-resolve. The `SettingsRoute.svelte` at line 134 calls `appSelectedDriveItemBindingStore.setActiveAccountId(nextAccountId)` after sign-in, which loads the persisted binding but does not kick off sync.
  Reviewed by: Codex, Antigravity

---

### Effort: Large

Findings that require more than 60 minutes, involving architectural changes, cross-cutting concerns, or significant refactoring.

#### L-01: M4-08 is only partially implemented because upload progress never reaches a user-facing save flow

- **Status:** Open | ✅ Confirmed by second reviewer
- **Severity:** Medium
- **Perspective:** Feature Completeness / Testing
- **Location:** `src/graph/graphClient.ts` (lines 323-409), `src/features/app-shell/AppShell.svelte` (lines 255-275), `src/features/app-shell/routes/AddRoute.svelte` (entire file), `tests/e2e/app-shell.spec.ts` (M4 sync progress coverage only)
- **Description:** GitHub issue `#54` requires two user-visible outcomes: download progress during startup sync and upload progress when saving a new transfer. The repository satisfies the first half through `syncStateStore` and the `<progress>` UI in `AppShell.svelte`. The second half is not delivered: `uploadFile()` exposes an `onProgress` callback at the Graph-client layer, but there is no transfer-save flow yet, `AddRoute.svelte` is still a placeholder, and no integration or E2E test verifies upload progress surfacing in the UI.
- **Impact:** Medium. Milestone accounting currently overstates completion of `M4-08`, and the codebase does not yet provide the user-visible upload-progress behavior promised by the issue acceptance criteria.
- **Recommendation:** Either reopen/re-scope `#54` so it explicitly covers only the transport-layer groundwork shipped in M4, or carry the missing acceptance criteria forward as an explicit M6 prerequisite and wire upload progress into the transfer-save UX with integration and E2E coverage before calling the issue fully complete.
- **Second reviewer notes:** Confirmed. `AddRoute.svelte` is a 5-line placeholder (confirmed at lines 1-5). The `uploadFile` method in `graphClient.ts` (lines 495-602) is fully implemented with XHR progress tracking when `onProgress` is provided. However, no existing code outside of tests ever calls `uploadFile`. The `DbClient` interface in `src/db/index.ts` defines `createTransfer` and `exportBytes` but has no implementation — confirming that the write-back flow is not yet built.
  Reviewed by: Codex, Antigravity

---

## Next Milestone Readiness

### Ready

The codebase is well-prepared for **M5 (Accounts + Transfers Read UX)**.

- The `CacheStore` and `startupFreshnessService` provide a reliable local DB snapshot that M5 features can consume.
- The `GraphClient` already supports `downloadFile` and `uploadFile`, covering future write-back scenarios.
- The sync state machine (`syncStateStore`) provides global visibility into data freshness, which M5 UI components can subscribe to for conditional rendering (e.g., showing stale data indicators).
- The `selectedDriveItemBindingStore` provides the necessary binding context for identifying which database file to read.
- The modular architecture (strict `@cache`, `@graph`, `@shared`, `@features` boundaries) means M5 can introduce a new `@db` module for SQLite parsing without impacting existing modules.

### Blockers or Risks

- **Risk (M-01 / M-02):** Startup and post-sign-in recovery still lack a targeted re-auth/sync path. Once M5 starts depending on cached DB bytes for actual account and transfer queries, users can end up signed in but without a freshly synchronized snapshot until they reload or manually recover.
- **Risk:** M5 will need to parse SQLite `.db` bytes from the cached snapshot. The current `CachedDatabaseSnapshot` stores raw `Uint8Array` bytes. A SQLite WASM parser (e.g., `sql.js`) will need to be integrated, and its bundle size impact should be evaluated. The CSP `script-src 'self'` directive in `index.html` may need `'wasm-unsafe-eval'` to allow WASM execution.
- **Risk (L-01):** The milestone tracker currently treats `M4-08` as complete even though user-visible upload progress is not available yet. That should be corrected before downstream milestone status is used as a planning dependency.
- **Risk:** The `@db` module alias is already registered in `vite.config.ts` (line 133) but the `src/db/` directory doesn't contain M5-relevant code yet. Ensure the module barrel export convention is followed when adding SQLite logic.

---

## Test Coverage Assessment

### Unit Tests

| Module / File                      | Test File                               | Coverage Quality |
| ---------------------------------- | --------------------------------------- | ---------------- |
| `src/cache/dexieCacheStore.ts`     | `dexieCacheStore.test.ts`               | ✅ Excellent     |
| `src/graph/graphClient.ts`         | `graphClient.test.ts`                   | ✅ Excellent     |
| `src/graph/index.ts` (barrel)      | `index.test.ts`                         | ✅ Good          |
| `startupFreshnessService.ts`       | `startupFreshnessService.test.ts`       | ✅ Excellent     |
| `startupSyncStateController.ts`    | `startupSyncStateController.test.ts`    | ✅ Good          |
| `cachedDatabaseSnapshotService.ts` | `cachedDatabaseSnapshotService.test.ts` | ✅ Good          |
| `syncStateStore.ts`                | `syncStateStore.test.ts`                | ✅ Excellent     |
| `selectedDriveItemBindingStore.ts` | `selectedDriveItemBindingStore.test.ts` | ✅ Excellent     |
| `startupBindingSync.ts`            | `startupBindingSync.test.ts`            | ✅ Good          |
| `hashRouting.ts`                   | `hashRouting.test.ts`                   | ✅ Excellent     |
| `AppShell.svelte`                  | `AppShell.test.ts`                      | ✅ Good          |
| `settingsAuthController.ts`        | `settingsAuthController.test.ts`        | ✅ Excellent     |
| `settingsFileBindingController.ts` | `settingsFileBindingController.test.ts` | ✅ Excellent     |
| `settingsLocalDataController.ts`   | `settingsLocalDataController.test.ts`   | ✅ Good          |
| `settingsCacheStoreResolver.ts`    | `settingsCacheStoreResolver.test.ts`    | ✅ Good          |
| `src/auth/msalAuthClient.ts`       | `msalAuthClient.test.ts`                | ✅ Excellent     |
| `src/auth/scopes.ts`               | `scopes.test.ts`                        | ✅ Excellent     |
| `src/shared/config/buildInfo.ts`   | `buildInfo.test.ts`                     | ✅ Good          |
| `src/shared/config/runtimeEnv.ts`  | `runtimeEnv.test.ts`                    | ✅ Good          |
| `src/shared/utils/sumCents.ts`     | `sumCents.test.ts`                      | ✅ Good          |

### E2E Tests

The `tests/e2e/app-shell.spec.ts` (1611 lines, 30+ test cases) provides comprehensive browser-level coverage of M4 features:

- ✅ Cached DB reuse when OneDrive eTag is unchanged (`online_unchanged`)
- ✅ Fresh DB download when eTag changed (`online_changed`)
- ✅ Offline mode with cached DB (`offline_cached`)
- ✅ Offline error when no cached DB exists (`offline_missing_cache`)
- ✅ Syncing state and toast feedback while startup freshness check is running
- ✅ Transient metadata retry with successful recovery
- ✅ Transient metadata retry exhaustion with cached fallback (`stale`)
- ✅ Transient metadata retry exhaustion without cache (`error`)
- ✅ Non-retryable metadata error fast-fail
- ✅ Transient download retry with successful recovery
- ✅ Transient download retry exhaustion with cached fallback
- ✅ Transient download retry exhaustion without cache
- ✅ Deployment footer visibility on short pages
- ✅ Deployment footer revealed on scroll to bottom of long pages
- ✅ Sync status cleared after new DB file selection
- ✅ PWA manifest, service worker registration, and scope validation

### Assessment

Test coverage for M4 features is **excellent**. The `startupFreshnessService.test.ts` alone covers all 9 decision branches with deterministic assertions on `kind`, `branch`, `syncState`, `snapshot`, and `failure` fields. The retry tests verify exact backoff delay sequences and call counts. The e2e suite mirrors every unit-tested branch in a real browser context with full mock infrastructure for auth, graph, cache, and network state.

---

## Architecture Compliance

| Criterion                      | Status       | Notes                                                                                                                                                        |
| ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Module boundary enforcement    | ✅ Compliant | All imports use declared aliases (`@auth`, `@graph`, `@shared`, `@cache`, `@features`). No cross-module boundary violations found.                           |
| Dependency direction           | ✅ Compliant | `@cache` depends only on `@graph` types. `@graph` depends on `@auth`. `@shared` is a leaf dependency. `@features` consumes all lower modules via their APIs. |
| Separation of concerns         | ✅ Compliant | Startup logic cleanly separated: `startupFreshnessService` (pure decisions) → `startupSyncStateController` (UI mapping) → `AppShell.svelte` (orchestration). |
| Factory + DI pattern           | ✅ Compliant | All services use injectable factory functions (`createStartupFreshnessService`, `createCachedDatabaseSnapshotService`, `createDexieCacheStore`).             |
| Security: HTTPS-only           | ✅ Compliant | All Graph API calls target `https://graph.microsoft.com/v1.0`. CSP enforces `connect-src` whitelist.                                                         |
| Security: No secrets in client | ✅ Compliant | Only the Azure client ID is embedded (public, non-secret). MSAL uses PKCE for token exchange. No client secrets.                                             |
| Security: CSP                  | ✅ Compliant | Strict CSP in `index.html` with `object-src 'none'`, `script-src 'self'`, scoped `connect-src` and `frame-src` for MSAL.                                     |
| Error normalization            | ✅ Compliant | `@graph` normalizes all fetch/XHR errors into typed `GraphClientError`. `startupFreshnessService` normalizes into typed `StartupFreshnessFailure`.           |
| DI / Testability               | ✅ Compliant | All services accept `Pick<>` typed subsets of dependencies. E2E tests inject mocks via `window.__CONSPECTUS_*__` globals with localhost-only guards.         |
| Deterministic behavior         | ✅ Compliant | `startupFreshnessService.resolve` returns a discriminated union — every code path returns a typed decision, never throws to the caller.                      |
| Idempotent startup             | ✅ Compliant | `syncStateStore.reset()` called on mount and on binding change. Auth initialization deduplicates via `initializationPromise`.                                |

---

## Summary

| Effort    | Count | Critical | High | Medium | Low | Invalidated |
| --------- | ----- | -------- | ---- | ------ | --- | ----------- |
| Small     | 7     | 0        | 1    | 1      | 5   | 6           |
| Medium    | 2     | 0        | 0    | 2      | 0   | 0           |
| Large     | 1     | 0        | 0    | 1      | 0   | 0           |
| **Total** | 10    | 0        | 1    | 4      | 5   | 6           |
