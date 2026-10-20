# AP5 — Quality gates and qualification

Scope: Q1–Q3 and A3 from [the project audit](2026-10-20-project-audit.md), consolidating
AP1–AP4 at base `23ae169`. Implementation acceptance and production qualification are separate.
The original audit remains a historical diagnosis.

## Implementation plan and regression targets

1. Reproduce the old WebKit offline navigation failure before changing runner/browser versions.
   In `tests/e2e/receipt-capture.spec.ts`, control the provider response while asserting extraction
   UI, remove the global mock sleep and the obsolete August-only navigation workaround. Keep the
   test clock fixed to the receipt month and assert that month explicitly.
2. Update Playwright and its matching browser binaries together. Include iPhone WebKit by default
   in `playwright.config.ts` and in the Quality matrix on branches and main. Preserve the offline
   reload assertions and retry policy. Separate browser caches by project so a Chromium-only cache
   cannot cause WebKit installation to be skipped.
3. Inspect current advisories and dependency paths, apply compatible patches, and deliberately
   upgrade Lighthouse to remove its vulnerable downloader chain. Validate the actual report
   contract and Node requirement; do not use force/downgrade or broad overrides to silence audit.
4. Extend real-SQLite receipt batch integration coverage across byte-only retry, changed cache
   version/binding, export failure and post-acceptance cache failure on both first upload and retry.
   Reuse the existing AP1 session/services/fixture; do not introduce a second persistence owner.
5. Extend `Manual-Device-QA.md`, align CI/release documentation, and map every audit finding to
   evidence or an explicit remaining gate here. Run all relevant local checks, inspect architecture
   and source independently, then use the isolated read-only agy review and fix accepted findings.

Changed files are limited to the following areas:

- Browser gate: `playwright.config.ts`, `.github/workflows/quality.yml`,
  `scripts/deploy-utils.test.ts`, `tests/e2e/receipt-capture.spec.ts`.
- SQLite regressions: `src/features/app-shell/writeSafety.integration.test.ts`.
- Dependency/report compatibility: `package.json`, `package-lock.json`, `lighthouse-budgets.json`,
  `scripts/run-lighthouse-ci.mjs`, `scripts/run-lighthouse-ci.test.ts`.
- Canonical guidance/evidence: `README.md`, `docs/CI-CD-Pipelines.md`, `docs/Manual-Device-QA.md`,
  `docs/Release-Process.md` and this report.

## Q1: reproducible browser gate

The baseline Playwright **1.58.2 / WebKit 26.0, revision 2248**, Windows, one worker and zero retries,
failed the existing `app-shell.spec.ts` manifest/service-worker test at offline `page.reload()` with
`WebKit encountered an internal error`. Four other selected offline tests passed. This reproduces
the audit and AP2–AP4 reports before the update.

Playwright **1.64.1 / WebKit 27.2, revision 2370** passes that same test without changing its
navigation, offline, response-security-header or app-shell assertions. Both targeted receipt
cases pass too. This bounds the automated failure to the old runner/browser combination; it is
not proof of a specific upstream root cause or proof of physical Safari/PWA behavior. Chromium
is updated with the same locked runner (156.0.8078.4, revision 1248).

WebKit now runs the full suite locally by default and in an isolated Quality job on both branches
and main. Main retains Chromium critical journeys; non-main retains full Chromium and Pixel 5.
No failure is hidden by a new skip, catch, expected-failure annotation or extra retry. The existing
Chromium-only service-worker update and CDP touch tests retain their platform-specific skips.
Physical offline startup/reload remains **NOT RUN**, covered by QA-06/QA-11.

The first full updated run passed 302 cases, skipped the three existing platform-specific cases
and exposed one further WebKit test race: the picker-return case gated Graph metadata before
bootstrap completed, leaving the route at the bootstrap placeholder. It now waits for the usable
capture action before simulating foreground return. Both foreground variants then passed three
times each in WebKit (six passes), without sleeps, retries or changing application behavior.

## Q2: dependency decisions and exposure

The live pre-update audit reported **27 entries: 18 high, 9 moderate**, no critical findings.
These include propagated dependency-chain entries, not 27 independent vulnerabilities.

- Compatible patches update devalue to 5.9.4, Vite to 7.3.7, Vitest to 4.1.12, lint-staged to 16.4.0
  and the affected humanfs, source-map, TOML, URI, selector, brace, nanoid and browserslist packages.
- devalue is pulled in by Svelte, but the app does not call its serialization/revival APIs or use
  SvelteKit server hydration. Fixing it still removes the vulnerable dependency rather than relying
  on reachability alone. Vite/Vitest/lint-staged and parser findings concern development/build/test
  tooling, so they remain included in the complete audit gate.
- Lighthouse 12.6.1 pulled Puppeteer 24 → browser downloader 2 → extract-zip and proxy/PAC/FTP
  packages. The ZIP extractor has no patched release in that line. Lighthouse **13.5.0** pulls
  Puppeteer 25 / downloader 3, removing the vulnerable ZIP/proxy/FTP chain instead of applying npm's
  suggested downgrade to Lighthouse 10. This tooling is invoked by deployed-route checks, not
  shipped to the PWA. [Lighthouse 13 release notes](https://github.com/GoogleChrome/lighthouse/releases/tag/v13.0.0)
  require Node >=22.19 and replace the legacy `viewport` audit with `viewport-insight`; the runner,
  budget and tests use the replacement with the same 100% requirement. Category thresholds stay
  unchanged. Setup/engines now match; CI's Node 22 selector resolves a current patch.
- The remaining **two moderate entries** are one advisory propagated through
  `svelte-i18n@4.0.1 → esbuild@0.19.12`:
  [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99).
  The affected surface is esbuild's development HTTP server. The installed i18n runtime and CLI
  do not import esbuild; application scripts serve through Vite 7's patched esbuild instead.
  No application command starts the nested server. The nested native executable is not emitted into the
  browser artifact. npm's suggested i18n downgrade to 3.7.1 is intentionally rejected; no broad
  pre-1.0 esbuild override is introduced for an unused server API. Reassess on dependency/release
  updates; the finding remains visible below the repository's high/critical threshold.

There is **no high/critical exception**, scanner suppression or change to the exception ledger.
The existing fail-closed ledger contract remains intact. Audit results are dated observations,
not a guarantee about subsequently published advisories.

## Q3/A3: joined acceptance and ownership evidence

`writeSafety.integration.test.ts` uses actual sql.js fixture bytes, both public producer adapters,
the common commit service, session, cache handoff and authoritative recovery with controlled Graph
responses. AP5 adds six receipt-path cases to the existing manual/session cases. The receipt retry
compares actual PUT bytes/eTag, persisted transfer counts, account balances and foreign-key validity.
It does not substitute a mocked save service for SQL. No application runtime/API/schema change is
needed in AP5. The common controller retains commit/recovery ownership; the session retains version
and identity ownership; tests exercise those boundaries rather than adding orchestration to UI.

The table records implementation evidence and outstanding qualification separately. “Automated”
means local reproducible coverage, not live Microsoft/OneDrive or physical-device verification.
The AP1–AP4 reports record their regression-first plans, bounded changes and reviews. AP5 reruns
their current regression coverage; it cannot retroactively claim every test existed before those
commits. A3 is a continuing workflow obligation, not an application feature or a passed test count.

| Finding | Evidence / disposition                                                                                                                                                                                           | Remaining qualification                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| D1      | Real SQLite manual/receipt retry retains original bytes/eTag; newer cache version blocks PUT.                                                                                                                    | Real service network interruption.                                                                     |
| D2      | Account/drive/file/reset/sign-out integration boundaries and receipt binding retry.                                                                                                                              | Physical switching during native capture.                                                              |
| D3      | `browserDbRuntime.test.ts` and `transferWriteService.test.ts`: actual exports, PRAGMA restoration, invalid FK writes.                                                                                            | None specific to this code boundary.                                                                   |
| D4      | Manual and receipt export failures restore authoritative bytes; failed restore blocks writes.                                                                                                                    | Real service recovery remains supplemental.                                                            |
| D5      | Manual/receipt first/retry acceptance + cache failure allow recovery without another PUT.                                                                                                                        | Device/service fault injection in QA-10.                                                               |
| D6      | Real two-runtime shared-cache/server-If-Match tests; actual two-tab browser case in `write-safety.spec.ts`; refresh exclusion.                                                                                   | Hardware/service concurrency smoke.                                                                    |
| U1      | `mobile-sheet.spec.ts`: grip threshold, cancellation, draft retention, scrolling and busy dismissal.                                                                                                             | QA-03 physical touch.                                                                                  |
| U2      | Three viewport geometries, header focus and initial scroll independent of options loading.                                                                                                                       | QA-03 keyboard/safe-area checks.                                                                       |
| U3      | Common dialog close path; no delayed transition owner; repeated close/reopen tests.                                                                                                                              | QA-03 native modal behavior.                                                                           |
| U4      | Emulated narrow/rotated/large-text layouts are supplemental only.                                                                                                                                                | **OPEN:** physical Safari/PWA and Android/PWA, QA-03.                                                  |
| U5      | Compact manual form, receipt disclosure, summary and processing guidance browser tests.                                                                                                                          | QA-09/10 usability/correction.                                                                         |
| U6      | `database-session.spec.ts`: unchanged foreground checks keep runtime/draft with no success toast.                                                                                                                | Device foreground behavior.                                                                            |
| U7      | Simplified footer/viewport ownership, long-page/short-height geometry tests.                                                                                                                                     | QA-03 keyboard and installed mode.                                                                     |
| U8      | System font, blocked font endpoints, large-text/rotation browser test.                                                                                                                                           | Physical text-size behavior.                                                                           |
| S1      | Controlled delayed auth in `database-session.spec.ts`; no premature binding/read surface.                                                                                                                        | Real sign-in/expired-session QA-02/07.                                                                 |
| S2      | Graph/OpenRouter deadline, abort, retry and body-timeout tests; controlled cancellation.                                                                                                                         | Live provider availability/latency.                                                                    |
| S3      | Cache-specific recovery tests, including real large-SQLite browser startup and preserved binding.                                                                                                                | Device storage pressure.                                                                               |
| S4      | `snapshotValidation.test.ts`: actual corrupt/schema/FK/logical-reference fixtures rejected before adoption.                                                                                                      | None specific to the local validation boundary.                                                        |
| S5      | [AP3 measurements](2026-10-20-ap3-implementation.md#measurements-and-decisions): worker >=1 MiB, Settings lazy loading, zero-copy unchanged refresh. Further AI chunking/full DB worker deferred with rationale. | Physical timings/peak memory; no P3 optimization is claimed implemented.                               |
| S6      | Localized failure mapping and bootstrap/route/receipt recovery tests; remote outcome stays with common commit owner.                                                                                             | QA-05/06/10 service messages.                                                                          |
| K1      | Shipped prompt examples pass shipped parsers; exact merchant identity contract.                                                                                                                                  | Real OCR gold comparison.                                                                              |
| K2      | Independently controlled provider/freshness browser gates; unchanged runtime preserves work.                                                                                                                     | QA-09 native picker/app-switch/lock.                                                                   |
| K3      | [AP4 decisions](2026-10-20-ap4-receipt-qualification.md): auto-save, desktop correction, duplicate warning and unknown outcome specified/tested.                                                                 | **OPEN:** independent photographed corpus, real model-pair evaluation and QA-10 correction round-trip. |
| K4      | Versioned category/deposit/discount/return rules, 13-image gold corpus, limits/HEIC rejection and evaluator contracts.                                                                                           | **OPEN:** live model pairs, HEIC/orientation/large/long photos and memory pressure on phones.          |
| Q1      | Controlled receipt UI/time and compatible WebKit gate; unchanged offline regression passes.                                                                                                                      | **OPEN:** required physical offline/reload evidence.                                                   |
| Q2      | High/critical gate satisfied; remaining moderate exposure explained above, no exception.                                                                                                                         | Fresh audit on release candidate.                                                                      |
| Q3      | Joined real SQL/byte/identity tests, browser geometry/bootstrap, independent synthetic gold plus recorded-provider evaluator.                                                                                    | **OPEN:** real provider/photographed-gold and physical QA.                                             |
| A1      | One `transferCommitController` for manual/receipt SQL/export/upload/retry/reconciliation.                                                                                                                        | No duplicate recovery owner found.                                                                     |
| A2      | `databaseSession`/refresh owner, shared `features/transfers` rules, AP2 views and Settings split; aliases/lint.                                                                                                  | Physical behavior does not establish architecture ownership.                                           |
| A3      | Regression targets, smallest corrections, ownership review, rerun invalidated checks; AP1–AP4 evidence retained.                                                                                                 | Continue per package and after any candidate fix.                                                      |

## Execution and review record

Checks below use bundled Node **24.19.0** and npm **11.18.0**; the system Node 22.14.0 is below
the new minimum and is not the verification runtime. npm 10's optional-peer resolution failed
internally during the Vitest update; the current npm 11 completed it without peer/force bypasses.

| Check                                                             | Result                                                                                                                                  |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --prefer-offline --no-audit`                              | PASS, fresh install from final lockfile; no engine mismatch.                                                                            |
| `npm run format`                                                  | PASS.                                                                                                                                   |
| `npm run lint`                                                    | PASS, zero warnings.                                                                                                                    |
| `npm run typecheck`                                               | PASS, zero errors/warnings.                                                                                                             |
| `npm run check:dead-code`                                         | PASS.                                                                                                                                   |
| `npm run test`                                                    | PASS, 724 app/integration tests + 129 script tests. The measurement and recorded-provider cases remain deliberately opt-in (two skips). |
| `npm run build`                                                   | PASS, production channel, synthetic client ID. Existing >500 KiB main-chunk advisory remains.                                           |
| `npm run check:bundle-size`                                       | PASS, JS 787,881 B raw / 241,925 B gzip; CSS 30,306 B / 6,225 B. Existing budgets unchanged.                                            |
| `npm run audit:dependencies`                                      | PASS at the existing high/critical threshold; two moderate entries remain as described.                                                 |
| Quality YAML parse / relative document links / `git diff --check` | PASS; 35 relative references checked.                                                                                                   |

Final E2E on the clean installation and checked production build:
`PLAYWRIGHT_WEB_SERVER_BUILD=0 node node_modules/@playwright/test/cli.js test --workers=1`:
**303 passed, 3 existing platform-specific skips, zero failures**, in 5.1 minutes. This covers all
three projects with zero local retries, including unchanged offline reload, both picker/freshness
variants, dialog geometry/gesture and real two-tab SQLite. The two receipt variants additionally
passed six focused WebKit repetitions after the synchronization fix. Production output contract
verification also passed for `/conspectus/` with `scripts/verify-build-channel.mjs`.

Generated logs/reports live under ignored `output/`, `reports/`, `test-results/` and
`playwright-report/`; none are deliverables. External review results are recorded below.

The local Lighthouse 13.5 CLI produced a real mobile report with all configured category/audit IDs,
HTTPS/viewport scores 1, accessibility 0.94 and best practices 0.96. A Windows chrome-launcher
temporary-profile cleanup attempt first ended with EPERM after writing its report. A repeat using
a Playwright-owned Chrome attached through its debugging port exited successfully and confirmed
the same report contract. Neither test changes the release runner or skips a gate. The local HTTP
smoke's performance score was 0.71 (the earlier concurrent run was 0.67), **below** the unchanged
0.80 release threshold. This is not a passed release-performance gate or a deployed-route result;
run the canonical three-run HTTPS median gate on the exact candidate. No threshold is relaxed.

## Qualification status

**Full AP5 acceptance and production release: BLOCKED.** No exact deployed release candidate,
physical iPhone/Android or live QA provider/account was used for this work. QA-01–QA-11 in browser
and installed mode are **NOT RUN** on both required platforms, not waived. The extended device
runbook provides the execution/evidence contract, not substitute results. Real provider corpus
evaluation and independent photographed-gold evidence remain open as recorded in AP4.

A local implementation review/commit does not close these gates, mark all audit findings fixed,
approve release, or authorize deployment. Complete the canonical release checklist on an exact
candidate, retain original/rerun results per device and mode, and rerun every check invalidated by
any resulting fix. No GitHub issue/backlog status or historical audit conclusion is changed here.

## Independent source review

Own review, completed before invoking agy: no actionable local implementation finding remains.
The most complex affected flow is receipt commit/export/upload/reconciliation. AP5 exercises the
existing AP1 owner end-to-end instead of creating more production state or a parallel recovery
implementation. Test-specific Graph/cache failure controls remain in the existing fixture harness;
assertions inspect actual SQLite, bytes, counts and balances. The CI selection remains a small
explicit matrix with matching browser installation/cache identities. Lighthouse uses its real
replacement audit rather than an alias/fallback that could hide a missing score. These choices
keep the change bounded and maintainable; the open hardware/provider/performance qualification
is documented independently of code approval.

## External agy code review

- Local read-only code review in an independent temporary clone without remote/alternates; all
  relevant sources and the new report were included, while private/runtime/generated data were
  excluded. Base and head: `23ae169703f02b2466f913bf844e9bce4b5e913c` plus the AP5 working tree.
- Available models were discovered live. Selected `gemini-3.8-flash-high`, `--mode plan`,
  `--effort high`; conversation `35fbfc68-3b10-439b-a28a-e62df3c85635`.
- Round 1: **APPROVED**, no actionable findings. No findings require acceptance, partial acceptance
  or rejection, and no implementation correction was requested. All 372 source hashes and Git
  status remained unchanged. The reviewer independently confirmed the matrix/cache installation,
  provider gate and real-SQLite recovery coverage; its maintainability assessment found the
  necessary complexity bounded by the existing owners.
- The external response's explanatory prose loosely attributes the fixed receipt clock to AP5;
  that clock was already introduced in AP4 and retained here. Its bundle-budget link also names
  the Lighthouse budget file; actual JS/CSS limits remain in `bundle-size-budgets.json`. These are
  narrative inaccuracies, not implementation findings or changed acceptance evidence.
- Round 2: **APPROVED**, no actionable findings after the completed 303-pass browser evidence and
  refreshed documentation. Code/configuration/tests were identical to round 1. The same 372 hashes
  and Git status remained unchanged. Both external reviews are static and consume reported test
  evidence; they do not themselves execute tests or establish device/provider/production readiness.
- Both rounds agree with the independent own source review. No accepted fixes or unresolved code
  findings remain. Only this review-outcome record was appended after the final review.

### Findings

No actionable findings for the local implementation. No P0–P3 finding remains to triage.

### Assessment

The local AP5 changes preserve existing owners and pass the relevant automated gates. The most
complex affected flows remain bounded as assessed above. Physical devices, real services/provider
corpus and exact-candidate HTTPS Lighthouse qualification remain open; neither this verdict nor
the local commit is full AP5 acceptance or production release approval.

### Verdict — local implementation

APPROVED
