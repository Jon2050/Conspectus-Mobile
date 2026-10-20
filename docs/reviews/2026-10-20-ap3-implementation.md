# AP3 implementation and verification

Base: `5ebc5a4` (AP1 and AP2 included). Scope: audit S1–S6, U6, session/rule ownership
from A2, and lifecycle coordination with D6/K2. No offline viewing or schema migration.

## Plan

1. Add regression coverage for slow bootstrap, unchanged foreground refresh, cache failure,
   invalid SQLite schemas/references, cancellation, request deadlines and controlled retries.
2. Extend `app-shell/databaseSession.ts` and extract refresh orchestration from AppShell into
   a session controller. Preserve AP1 write provenance and serialize refresh against commits.
   Coalesce equal requests; abort superseded work. Keep the existing verified runtime when its
   original identity, generation and remote eTag still match. Remove timer-based readiness.
3. Bound Graph reads/downloads and OpenRouter catalog requests, including body consumption.
   Pass cancellation through recovery and retry waits; respect bounded Retry-After.
4. Separate cache, network and invalid-database errors. Force download bypasses cache reads.
   Clear only the affected cache entry after validation failure; do not erase bindings/settings.
   Cache unavailability fails closed with retry rather than enabling uncached writes.
5. Move SQLite compatibility checks into `db`, covering required columns, primary account
   topology, lookup rows and foreign keys before snapshot adoption. Move shared transfer rules
   and their models/helpers out of individual routes into `features/transfers`.
6. Localize error classes and recovery actions; silence unchanged-check success toasts. Preserve
   in-progress receipt state for unchanged refresh; invalidate it on actual context replacement.
7. Measure representative synthetic SQLite sizes, phase durations, copying and synchronous DB
   work; record bundle sizes and a justified worker/lazy-loading decision. No mobile timing claims
   from desktop measurements. Update canonical architecture contracts.
8. Run formatting, lint, typecheck, dead-code, unit/script tests, production build, bundle gate and
   browser coverage. Independently inspect the final diff, then use the agy-review skill in a
   verified disposable snapshot, fix accepted findings, revalidate and commit locally.

## Evidence

Implemented on `codex/ap3-database-session`, based on `5ebc5a41e0c162398c8ddc4f8bb5220a2985d0c4`.

- S1: removed the 160 ms readiness timer and redundant initial/runtime-ready flags. Browser coverage
  holds auth behind an explicit gate and proves no premature financial/empty route is rendered.
- S2: deadlines cover fetch and body consumption. Session invalidation aborts Graph metadata,
  path recovery, download, retry waits and validation workers. Catalog cancellation is propagated;
  catalog timeout is redacted and has no implicit retry. Startup retries at most three times and
  honors bounded Retry-After. Deadlines are conservative operational bounds, not mobile measurements.
- S3: forced download never reads cache. A corrupt matching snapshot is cleared by file identity
  and redownloaded. Cache write failures have their own localized recovery and withhold the runtime;
  retry preserves bindings and receipt settings. No uncached/offline mode was introduced.
- S4: actual SQLite tests reject foreign/column-incomplete/corrupt databases, missing or duplicate
  primary accounts, missing transfer types, declared FK violations and logical orphan references
  even without FK declarations. Required ID columns must be integer primary keys. No migration.
- S5/U6: unchanged refresh performs zero snapshot reads/byte copies/runtime opens and no success
  toast. Matching calls coalesce; refresh waits for an upload; original AP1 identity/eTag/generation
  constraints remain. Metadata reads also replace full-byte reads in Settings and upload handoff.
  Metadata-provided download URLs avoid the separate URL lookup; a post-download metadata read
  detects concurrent version changes before cache promotion. This is consistent with Microsoft's
  [documented download URL property](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0).
- S6: startup, Settings auth/binding/reset and route query/options errors use localized failure
  classes instead of raw provider/SQLite messages. Auth/binding failures have one primary status
  surface. Existing remote-commit/reconciliation ownership remains in AP1's common controller.
- A2/D6/K2: the session owns identity/provenance, read/write availability and refresh generation;
  `databaseRefreshController` owns refresh concurrency/runtime adoption. UI callbacks do not own
  infrastructure retry logic. Shared transfer models/helpers/validation now live in
  `features/transfers`, consumed by manual and receipt workflows. Existing AP2 UI component splits
  remain. A controlled two-gate browser regression proves completed receipt analysis waits for an
  unchanged in-flight freshness check before committing exactly once.

### Measurements and decisions

All measurements are local desktop observations with synthetic data, not physical-phone latency,
network throughput or peak resident-memory claims. Reproduce the SQLite probe with
`$env:AP3_MEASURE='1'; node node_modules/vitest/vitest.mjs run src/db/snapshotValidation.test.ts`.
Ignored output is `output/ap3/database-measurements.json`.

| Transfers | SQLite bytes | Copy ms | Open ms | Full validation ms | Month query ms | Export ms |
| --------- | -----------: | ------: | ------: | -----------------: | -------------: | --------: |
| 1,000     |      155,648 |   0.054 |   0.167 |               1.75 |           1.88 |      0.27 |
| 10,000    |      802,816 |   0.140 |   0.251 |               6.49 |           1.88 |      0.27 |
| 100,000   |    7,643,136 |   1.116 |   1.290 |              70.89 |           9.94 |      1.24 |

The opt-in test's sql.js loads were already warm; its sub-millisecond loader numbers are **not**
cold-WASM measurements. Browser Performance API entries separately instrument WASM initialization.
A real large SQLite import in Chromium measured approximately: auth 18 ms, mock metadata 0.5 ms,
mock download 0.7 ms, worker validation including its startup 36 ms, cache/mock serialization 18 ms,
active runtime open 21 ms (including main-thread WASM initialization 15 ms), first data frame 111 ms.
The mock network/cache figures are harness overhead, not service performance. The worker browser
case uses real SQLite/WASM and a synthetic padded database above 1 MiB; it observes an actual
Worker before accepting the account data. Pixel/WebKit run the same behavioral case.

Before AP3, unchanged refresh read the full cache envelope/bytes and reopened SQLite. After AP3,
controlled unit/browser counters prove zero reads/opens and retain both the draft and receipt run.
For a 7,643,136-byte snapshot, this removes a full-cache byte read and at least the explicit
7.3 MiB cache clone plus the runtime input copy per unchanged refresh. The isolated copy probe
measures one copy; it does not measure all browser/IndexedDB internal allocations or WASM heap size.

The >50 ms synchronous validation scan justifies moving validation of snapshots >=1 MiB into a
cancellable worker. Below that boundary, the measured 0.8 MiB scan was about 6.5 ms. Ordinary DB
queries/transactions stay in the existing runtime: measured queries/exports do not justify moving
all DB ownership/commit logic across threads in this package. Physical-device profiling may justify
further work. No claim is made that every mobile workload is free of long tasks.

Settings is loaded on demand. Receipt UI/controllers remain with the existing shell-owned workflow;
late-loading these owners would change in-flight commit/capture lifecycle ownership, while Settings
provides a clean isolated split. Further AI chunking is deferred, with this concrete tradeoff recorded.

The exact AP2 base was rebuilt from `git archive HEAD` using the same installed dependencies and
production channel, outside the source diff. Baseline aggregate JS: 725,625 B raw / 219,537 B gzip;
initial main chunk: 703,017 B raw / 210,988 B gzip. AP3 measured aggregate JS approximately
782,755 B / 240,362 B; initial main chunk approximately 678,404 B / 204,857 B. The main chunk shrinks
about 24 KiB; the separate validation worker adds about 44 KiB raw / 16 KiB gzip and Settings adds
its own lazy chunk. Aggregate CSS changes from 30,199 B / 5,657 B to 30,245 B / 6,203 B because
separate gzip streams lose shared compression. New aggregate limits are 776/240 KiB JS and 32/6.25
KiB CSS. This intentional worker/safety cost is included in review; no artifact is excluded from the gate.

Local lint initially also scanned ignored AP1/AP2 output snapshots and found competing tsconfig
roots. The scoped tooling correction ignores `output/**` and explicitly sets the parser root, keeping
existing diagnostic/user output intact. No dependency or CI workflow change is included.

### Verification record

- Regression first: the forced-download/cache-failure test failed on the base behavior (`error`
  instead of `ready`), then passed after the fix. Initial sandbox Vitest attempts failed before
  test discovery on cache `EPERM`; actual tests ran outside that restriction.
- App Vitest: 88 files, 695 passed, one intentionally opt-in measurement skipped in normal runs.
  The measurement case was separately executed successfully.
- Script Vitest: 15 files, 127 passed.
- Formatting, lint, Svelte/TypeScript (zero warnings/errors), dead-code checks and diff whitespace
  checks pass. Production builds and the reviewed aggregate bundle gate pass.
- Full regular Chromium/Pixel suite: 189 passed, one existing deliberate skip. Final focused
  three-browser checks: 21 passed; they additionally cover changed error assertions, worker, bootstrap, cache,
  unchanged-runtime behavior and the controlled receipt/freshness overlap.
- Expanded three-browser sweep before the last assertion corrections: 275 passed, three skipped,
  six obsolete-message assertions and the known WebKit offline-reload failure. The message
  assertions were corrected without weakening failure semantics; focused reruns cover them.
- WebKit offline reload reproduces as `WebKit encountered an internal error` on the unmodified
  AP2 base too (separate port 4174, fresh context, original test). It remains audit Q1/AP5 work,
  not an AP3 regression or a green full-WebKit claim. Traces/logs remain ignored under `output/ap3`.
- Independent source review found and fixed both pre-aborted deadline handling and the receipt
  auto-commit/freshness race. External agy-review verdict and final snapshot checks are recorded
  below after completion.

Real Microsoft sign-in, OneDrive writes, OpenRouter calls, physical Safari/PWA/Android hardware,
mobile-network timings and peak process memory were not tested. Existing physical-device evidence
and the full audit release gate remain AP2/AP4/AP5 responsibilities. No release approval is implied.
No dependency audit was repeated: no dependency/lockfile changed; audit Q2 remains separate work.

### Review and local delivery

Independent source review completed with no remaining known blocking findings. The most complex
changed path is refresh concurrency/runtime adoption: the session owns the identity/generation and
commit exclusion; one refresh controller owns active/queued requests, cancellation and adoption;
AppShell supplies UI callbacks. This separation is necessary to preserve AP1 write provenance and
K2 receipt lifecycle behavior. Controlled tests protect the boundaries rather than duplicating
only internal state assertions.

The agy-review skill was applied with `gemini-3.8-flash-high`, `--effort high` and `--mode plan`.
The exact target was base/head `5ebc5a41e0c162398c8ddc4f8bb5220a2985d0c4` plus all AP3 unstaged
changes and relevant new files; the staged layer was empty. Review ran in an independent temporary
clone created with `--no-hardlinks`, no remote, no alternates and no connection to the source Git
directory. Source diff and every relevant untracked file were verified against the original before
invocation, then status, diff and untracked-file hashes were checked again after completion.
The reviewer made no changes.

The first invocation was stopped before execution by automatic approval review, requiring explicit
source-transfer consent. Jonas then explicitly authorized sanitized source transmission and
requested that this permission persist for future agy-review use. A separate user-authorized
memory extension records that authorization. One external code-review round then completed:
conversation `b974b4c4-bb44-4957-b56c-22cfb65e167c`, verdict **APPROVED**, no actionable findings.
No further implementation fixes were needed from that review.

The external maintainability assessment confirmed that refresh coalescing/queuing/cancellation and
runtime adoption belong in the refresh controller, while identity/provenance and write exclusion
belong in the session. It accepted the measured worker cost and lazy Settings split. Its incidental
Q1/Q2 observations remain outside AP3; Q1 evidence is the actual `app-shell.spec.ts` baseline probe
described above (the external response incorrectly named a separate PWA test file). External static
review does not replace the independently executed runtime evidence or imply release acceptance.
The full response and snapshot verification manifests remain ignored under `output/ap3`.

Local delivery consists of the scoped AP3 implementation, regression coverage, architecture/module
documentation, measured bundle-budget adjustment and this evidence record. The commit uses the
required `Agent: Codex` trailer. No push or release/deployment is included.
