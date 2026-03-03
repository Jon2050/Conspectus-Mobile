# M2 Post Implementation Review (Issue #108)

Date: 2026-03-03  
Repository: `Jon2050/Conspectus-Mobile`

## Scope and Assumptions

1. Scope is limited to this repository (no direct edits in website-repo or GitHub branch settings).
2. PM/M1/M2 issue details were read from GitHub (`gh issue list/view`) and compared against current repository state.
3. Items that require organization/repository admin settings are reported as external blockers/risks.

## Review Method

1. Read baseline docs:
   - `README.md`
   - `docs/Architecture-and-Implementation-Plan.md`
   - `docs/Conspectus-Desktop-Info.md`
   - `docs/GitHub-Issues-MVP-Backlog.md`
2. Read PM/M1/M2 GitHub issue set and current states:
   - PM: #1, #2, #3, #4
   - M1: #5-#13
   - M2: #94, #14, #15, #17, #19, #21, #23, #25, #27
   - Review/fix issue: #108
3. Performed code/infrastructure/tests/security audit and implemented in-repo fixes.

## Issue Coverage Matrix (PM/M1/M2)

| Issue | Title | Review result |
| --- | --- | --- |
| #1 | PM-01 Create milestone and label taxonomy | Verified complete (labels/milestones exist; usage rules documented). |
| #2 | PM-02 Create issue templates | Gap found and fixed in this issue: added `.github/ISSUE_TEMPLATE/{feature,bug,infra,test}.md`. |
| #3 | PM-03 Create PR template with QS checklist | Verified complete (`.github/pull_request_template.md`). |
| #4 | PM-04 Configure branch protection and required checks | External gap: `main` branch protection/rules are currently not active in GitHub settings; cannot be fixed from repo files alone. |
| #5 | M1-01 Bootstrap Svelte + TypeScript + Vite | Verified complete. |
| #6 | M1-02 Configure code quality tooling | Verified complete (ESLint/Prettier/TS strict + scripts). |
| #7 | M1-03 Add Vitest baseline | Verified complete. |
| #8 | M1-04 Add Playwright baseline | Verified complete. |
| #9 | M1-05 Configure vite-plugin-pwa and manifest | Verified complete. |
| #10 | M1-06 Prepare app architecture folders | Verified complete (module folders + aliases + README/index). |
| #11 | M1-07 Add environment handling | Verified complete (runtime validation + startup failure UI). |
| #12 | M1-08 Create baseline CI workflow | Verified complete (quality + e2e jobs). |
| #13 | M1-09 Build initial mobile-first app shell | Verified complete. |
| #94 | M2-00 Deploy architecture | Verified complete (preview + production-channel structure in workflows/docs). |
| #14 | M2-01 Cross-repo deployment architecture decision | Verified complete (`docs/Architecture-and-Implementation-Plan.md` section 8.3). |
| #15 | M2-02 Configure Vite base path | Verified complete (`vite.config.ts` channel-aware base path). |
| #17 | M2-03 PWA deploy workflow | Verified complete (`.github/workflows/deploy-channels.yml`). |
| #19 | M2-04 Consumer artifact integration | Producer-side contract verified here; consumer-side implementation remains in website repo (external to this repository). |
| #21 | M2-05 Deployment smoke checks | Verified complete (script + website smoke workflow). |
| #23 | M2-06 Early public test page/link | GitHub issue is closed; this repo cannot verify website navigation entry directly. Backlog marker mismatch fixed (`docs/GitHub-Issues-MVP-Backlog.md`). |
| #25 | M2-07 Installability verification | Verified complete (`docs/M2-07-installability-verification.md`). |
| #27 | M2-08 Two-repo runbook | Verified complete; improved with explicit artifact retention contract. |

## Implemented Fixes in This Issue (#108)

1. Workflow security hardening and least privilege:
   - Reduced top-level permissions in `.github/workflows/deploy-channels.yml` to read by default.
   - Added scoped job-level permissions where write is required.
2. Supply-chain hardening:
   - Pinned `peaceiris/actions-gh-pages` to commit SHA in deploy workflow.
3. Deployment verification hardening:
   - Enforced HTTPS-only base URLs in `scripts/verify-production-deploy-smoke.mjs`.
   - Added test coverage for HTTPS validation in `scripts/verify-production-deploy-smoke.test.ts`.
4. Artifact rollback durability:
   - Set explicit artifact retention (`retention-days: 90`) in production artifact upload.
   - Documented retention expectation in `docs/M2-08-two-repo-deployment-runbook.md`.
5. Missing PM-02 repository artifacts:
   - Added issue templates:
     - `.github/ISSUE_TEMPLATE/feature.md`
     - `.github/ISSUE_TEMPLATE/bug.md`
     - `.github/ISSUE_TEMPLATE/infra.md`
     - `.github/ISSUE_TEMPLATE/test.md`
6. Test gap closure for critical deploy gate:
   - Added dedicated tests for `scripts/verify-build-channel.mjs` in `scripts/verify-build-channel.test.ts`.
7. Additional readiness test improvement:
   - Added hash-route store lifecycle test in `src/features/app-shell/hashRouting.test.ts` (subscribe/update/unsubscribe behavior).
8. Backlog consistency:
   - Updated `M2-06` marker to done in `docs/GitHub-Issues-MVP-Backlog.md`.

## Remaining Findings (Not Fully Fixable Here or Deferred)

### High

1. GitHub branch protection/rules for `main` are not active (PM-04 expectation mismatch).
   - Requires repository admin setting changes, not source-file changes.

### Medium

1. Branch slug/base normalization logic is duplicated across workflow/script/config layers.
   - Risk: drift/regression if one implementation changes independently.
2. Website-repo-side expectations (M2-04/M2-06) cannot be fully validated from this repository alone.

### Low

1. CI quality workflow performs multiple full builds in one run (cost/time duplication, non-blocking).
2. CSP/security-header runtime validation is not yet part of smoke checks (tracked naturally by future M8 security hardening).

## Test Review and Additional Useful Tests

Current state after fixes:
1. Critical deployment scripts now have dedicated test coverage:
   - `scripts/verify-build-channel.test.ts`
   - `scripts/verify-production-handoff.test.ts`
   - `scripts/verify-production-deploy-smoke.test.ts`
2. App route-hash store lifecycle is now covered in unit tests.

Additional tests still useful (recommended follow-up):
1. E2E test for startup env-failure UI path (`VITE_AZURE_CLIENT_ID` missing).
2. More component-level tests for app shell transitions and loading/error rendering states.

## M3 Readiness Confirmation

Conclusion: **M3 can start now** from a codebase perspective.

Ready:
1. Build/test/tooling baseline is stable.
2. Module structure and aliases for `auth`, `graph`, `cache`, `db`, `features`, `shared` are in place.
3. M2 deployment and smoke infrastructure is working and hardened in this repo.

Not blocking M3 but should be tracked:
1. Enable/verify branch protection required checks in GitHub repository settings.
2. Address slug-normalization duplication by centralizing normalization logic or adding a shared helper contract test.

## Suggested Follow-Up Subissues

1. **PM/M2 Governance**: Enable and verify `main` branch protection + required checks in GitHub settings (close PM-04 parity gap).
2. **Infra**: Centralize branch slug/base-path normalization contract to remove duplication across workflows/config/scripts.
3. **Test**: Add startup configuration-failure E2E coverage.
