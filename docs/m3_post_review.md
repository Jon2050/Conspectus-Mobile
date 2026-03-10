# M3 Post-Implementation Review

Date: 2026-03-10
Repository: `Jon2050/Conspectus-Mobile`

---

## Review Scope

- **Primary focus:** Milestone 3 — Auth + OneDrive Binding
- **Secondary:** Regression spot-check of Milestones 1 through 2
- **Review type:** Static analysis and code reading (no commands executed, all quality gates confirmed green prior to review)

---

## Issue Coverage Matrix (M3)

| Issue | Title                                         | Status               | Notes                                                                                       |
| ----- | --------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| #29   | M3-01 Create Microsoft Entra app registration | ✅ Fully implemented | Docs updated in `docs/auth/Entra-App-Registration.md`.                                      |
| #31   | M3-02 Configure Graph scopes and consent      | ✅ Fully implemented | Scopes (`Files.ReadWrite`) correctly isolated in `src/auth/scopes.ts`.                      |
| #33   | M3-03 Implement MSAL bootstrap module         | ✅ Fully implemented | Implemented robustly via `@azure/msal-browser` wrapper in `src/auth/msalAuthClient.ts`.     |
| #35   | M3-04 Build sign-in/sign-out UX               | ✅ Fully implemented | View and logic separated smoothly (`SettingsRoute.svelte` and `settingsAuthController.ts`). |
| #37   | M3-05 Implement Graph client wrapper          | ✅ Fully implemented | Minimal, strict wrapper over `fetch` created in `src/graph/graphClient.ts`.                 |
| #39   | M3-06 Implement OneDrive file selection flow  | ✅ Fully implemented | Functional tree-browser with robust folder traversal.                                       |
| #41   | M3-07 Persist binding in local storage layer  | ✅ Fully implemented | Schema-versioned `localStorage` binding persistence mapped by Account ID.                   |
| #43   | M3-08 Add settings actions for rebind/reset   | ✅ Fully implemented | Reset workflows protected by destructive confirmation dialog.                               |
| #45   | M3-09 Add auth and binding integration tests  | ✅ Fully implemented | E2E mock harness covers complex success, reload, and failure matrices.                      |

---

## Prior Milestone Spot-Check

| Milestone | Spot-Check Result | Notes                                                                           |
| --------- | ----------------- | ------------------------------------------------------------------------------- |
| M1        | ✅ No regressions | Svelte scaffolding, aliases, and environment variables are strictly maintained. |
| M2        | ✅ No regressions | Playwright baseline and deployment constants remain structurally sound.         |

---

## Findings

### Effort: Small

Findings that can be resolved in under 20 minutes with isolated, localized changes.

#### S-01: `SettingsAuthController` silently drops `signIn`/`signOut` requests if initialization is in-flight

- **Status:** Fixed on 2026-03-10 in commit `e6e1d19` (`fix: queue settings auth actions behind initialization`).

- **Severity:** Low
- **Perspective:** Bug Hunting / Maintainability
- **Location:** `src/features/app-shell/routes/settingsAuthController.ts` (lines 104-106, 126, 155)
- **Description:** The `ensureInitialized()` helper in `SettingsAuthController` awaits `controller.initialize()` and then checks `isInitialized`. However, if an initialization is already in progress, `initialize()` synchronously returns early instead of returning the pending Promise. Consequently, `ensureInitialized()` resolves immediately as `false`, causing `signIn()` or `signOut()` to silently abort. While currently mitigated in the UI because the "Sign in" button is correctly disabled during the `initializing` state, this represents a fragile controller pattern that could lead to dropped actions if programmatically invoked differently in the future.
- **Impact:** Low. The UI prevents user interaction during initialization, so this does not manifest as a user-facing bug, but it represents fragile state logic within the controller contract.
- **Recommendation:** Store the `Promise` returned by `authClient.initialize()` in a private variable during the initialization phase. If `initialize()` is called while an operation is pending, return the stored `Promise` so that callers correctly await the completion instead of returning synchronously.
  Reviewed by: Gemini

#### S-02: Unhandled `URIError` in `normalizeParentPath` leaks raw exceptions

- **Status:** Fixed on 2026-03-10 in commit `3899fcd` (`fix: harden graph parent path decoding`).

- **Severity:** Low
- **Perspective:** Bug Hunting / Stability
- **Location:** `src/graph/graphClient.ts` (inside `normalizeParentPath`, line 81)
- **Description:** The `normalizeParentPath` helper function uses `decodeURIComponent` on the path string returned by Microsoft Graph. If the path contains a malformed percent-encoding sequence (e.g., an isolated `%` character in the folder name), `decodeURIComponent` will throw a native `URIError`. Because there is no `try...catch` block around this call or inside the upstream payload normalizers (`normalizeDriveItem` / `normalizeChildrenPayload`), this raw `URIError` leaks out of the `listChildren` method, violating the contract that the module only throws `GraphClientError`.
- **Impact:** In the rare event that a OneDrive folder name yields a malformed URI string from the Graph API, the app will crash or display an unhandled exception rather than the standardized file selection error UI.
- **Recommendation:** Wrap the `decodeURIComponent` call in a `try...catch` block. If a `URIError` is thrown, gracefully fall back to returning the un-decoded string, or safely replace invalid sequences before decoding.
  Reviewed by: Gemini

#### S-03: Local storage binding persistence fails silently and permanently if existing data is corrupted JSON

- **Status:** Fixed on 2026-03-10 in commit `97768cb` (`fix: recover binding persistence from malformed storage`).

- **Severity:** Medium
- **Perspective:** Bug Hunting / Resilience
- **Location:** `src/shared/state/selectedDriveItemBindingStore.ts` (lines 142-167)
- **Recommendation:** Wrap the `JSON.parse` call in its own `try...catch` block that falls back to `null` on failure, allowing the persistence flow to overwrite the corrupted data with a fresh, valid payload.
  Reviewed by: Gemini

#### S-04: Lack of "Cancel" option in DB file browser traps UX

- **Status:** Fixed on 2026-03-10.

- **Severity:** Low
- **Perspective:** UX/Feature Completeness
- **Location:** `src/features/app-shell/routes/SettingsRoute.svelte` (lines 266, 360-413)
- **Description:** When a user who already has a selected DB file clicks "Change DB file", the file browser opens via `browseRoot()`, but the component does not clear the existing `selectedBinding`. There is no "Cancel" button provided to close the browser without selecting a new file. If the user decides not to change their file, they must either navigate away from the Settings route entirely or re-select the exact same file to dismiss the browser view.
- **Impact:** Low. The user can easily navigate away or re-select, but it represents a slightly frustrating UX trapping pattern within the Settings flow.
- **Recommendation:** Add a `Cancel` button next to the `Back to parent folder` button that calls `fileBindingController.hydrateSelectedBinding(bindingState.selectedBinding)` or introduces an explicit `cancelBrowse()` operation to safely dismiss the browser view without altering the existing binding.
  Reviewed by: Gemini

#### S-05: IndexedDB `databases()` exception bypasses fallback cleanup targets

- **Status:** Fixed on 2026-03-10.

- **Severity:** Low
- **Perspective:** Bug Hunting / Resilience
- **Location:** `src/features/app-shell/routes/settingsCacheStoreResolver.ts` (lines 74-82)
- **Description:** In `clearAll()`, the code attempts to dynamically resolve database names using `await window.indexedDB.databases()`. If this API call throws an unexpected error (e.g., due to restrictive security settings in older browser wrappers or privacy modes), the exception triggers the surrounding `catch` block on line 90. This inadvertently skips the fallback array `['conspectus-mobile-cache', 'conspectus-cache']` completely, leaving legacy app databases undeleted during a local data reset.
- **Impact:** Low. Most modern browsers safely support `.databases()`, but in restrictive environments, a local data reset might fail to purge all IndexedDB data, leading to inconsistent state drops.
- **Recommendation:** Wrap the `indexedDB.databases()` resolution inside its own inner `try...catch` block. If dynamic resolution throws, safely default to the statically defined fallback array so that cleanup iteration can still proceed.
  Reviewed by: Gemini

---

### Effort: Medium

Findings that require up to 60 minutes of work, potentially touching multiple files or requiring new tests.

_(No medium-effort findings identified. The feature implementation is solid, modular, and directly satisfies the architecture directives.)_

---

### Effort: Large

Findings that require more than 60 minutes, involving architectural changes, cross-cutting concerns, or significant refactoring.

_(No large-effort findings identified. The architecture is sound and well-aligned with MVP objectives.)_

---

## Next Milestone Readiness

### Ready

The codebase is exceptionally well-prepared for **M4 (Sync Engine + Cache)**.

- The `AuthClient` properly abstracts access tokens via `getAccessTokenSilent`.
- The `GraphClient` provides well-typed implementations of metadata fetch and file download.
- Local state management, notably the `selectedDriveItemBindingStore`, proves that caching infrastructure is already wired safely.

### Blockers or Risks

- **Risk:** When implementing M4 (Sync Engine + Cache) with Dexie, ensure that active IndexedDB connections are closed before executing the local reset action, or else `indexedDB.deleteDatabase` in `settingsCacheStoreResolver.ts` will emit an `onblocked` event and fail the local reset.

---

## Summary

| Effort    | Count | Critical | High | Medium | Low | Invalidated |
| --------- | ----- | -------- | ---- | ------ | --- | ----------- |
| Small     | 5     | 0        | 0    | 1      | 4   | 0           |
| Medium    | 0     | 0        | 0    | 0      | 0   | 0           |
| Large     | 0     | 0        | 0    | 0      | 0   | 0           |
| **Total** | 5     | 0        | 0    | 1      | 4   | 0           |
