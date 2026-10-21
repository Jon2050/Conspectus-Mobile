# Architecture

This document is the active architecture source for Conspectus-Mobile. It records durable product
constraints, module ownership, runtime flows, and safety invariants. The completed MVP plan and its
milestone-by-milestone implementation history are preserved in
[`archive/releases/mvp/Architecture-and-Implementation-Plan.md`](archive/releases/mvp/Architecture-and-Implementation-Plan.md).

Use the repository [`README.md`](../README.md) for setup and commands, and
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the contribution and delivery workflow. Operational
details belong to the specialized documents linked under
[Documentation ownership](#documentation-ownership).

## Product boundaries

Conspectus-Mobile is a static, installable PWA that provides mobile access to a personal Conspectus
SQLite database stored in OneDrive.

Durable constraints:

- The application has no backend server and no frontend client secret.
- Microsoft personal accounts are the supported identity type.
- OneDrive is the authoritative file store; the browser cache is not an independent data source.
- The PWA reads and writes the existing desktop-compatible SQLite schema but does not migrate it.
- Offline database viewing and transfer creation are not supported.
- Desktop Conspectus and Conspectus-Mobile must not use the same database concurrently.
- The mobile application and desktop application remain separate repositories and deployments.

## Technology

- Svelte, TypeScript, and Vite provide the application and build system.
- `vite-plugin-pwa` provides the manifest and service worker.
- `@azure/msal-browser` implements OAuth 2.0 Authorization Code flow with PKCE.
- Microsoft Graph provides OneDrive file discovery, metadata, download, and upload operations.
- `sql.js` opens and modifies SQLite bytes in the browser.
- Dexie persists database snapshots and sync metadata in IndexedDB.
- OpenRouter supplies the user-funded live model catalog and, in later receipt-processing flows,
  the two remote AI stages.
- Vitest and Playwright provide unit, integration, component, and browser coverage.

The production artifact is static and is deployed below `/conspectus/` on `jon2050.de`.

## Module structure

Source code is divided into architecture-aligned roots under `src/`:

| Module       | Ownership                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------- |
| `auth`       | MSAL lifecycle, account session state, token acquisition, and reauthentication              |
| `graph`      | Typed Microsoft Graph and OneDrive requests plus provider-error normalization               |
| `db`         | sql.js lifecycle, schema-compatible queries, transactions, and database-byte export         |
| `cache`      | IndexedDB/Dexie persistence for database snapshots and sync metadata                        |
| `openrouter` | Authenticated OpenRouter catalog requests, parsing, filtering, and safe error normalization |
| `features`   | Screens, user workflows, and orchestration across lower-level modules                       |
| `shared`     | Cross-cutting configuration, state, formatting, utilities, and reusable UI primitives       |

Each module exposes its public surface through `index.ts`. Cross-module imports use the aliases
`@auth`, `@graph`, `@db`, `@cache`, `@openrouter`, `@features`, and `@shared`; relative imports are
reserved for files inside the same module.

Dependency rules are enforced by ESLint:

- `features` is the composition layer and may consume all lower-level modules.
- `auth` may depend on `shared`, but not on Graph, database, cache, or feature code.
- `graph` may depend on `auth` and `shared`, but not on database, cache, or feature code.
- `db` and `cache` may depend on `shared`, but not on feature code or unrelated infrastructure.
- `openrouter` may depend on `shared`, but not on authentication, Graph, database, cache, or
  feature code.
- `shared` must not depend on `features` and must not contain feature-specific behavior.
- Infrastructure modules must never import feature UI.

The module-local README files describe their current public contracts. ESLint configuration is the
enforceable source when prose and import rules disagree.

## Runtime composition

`AppShell` is the application composition root. It resolves the concrete authentication, Graph,
cache, and database services and owns cross-route operations whose lifetime must survive route or
bottom-sheet navigation.

Important ownership rules:

- Provider details stay behind typed module interfaces.
- UI components do not issue raw Graph requests or SQL statements.
- Database queries and writes stay in `db`; multi-service orchestration stays in `features`.
- OpenRouter HTTP details and provider errors stay in `openrouter`; account-scoped receipt settings,
  prompts, readiness, and UI orchestration stay in `features`.
- App-wide auth, binding, sync, toast, network, and update state use shared stores.
- Pending transfer upload and conflict-recovery state is owned above the Add Transfer sheet so
  navigation cannot accidentally repeat the local SQL write.

## Authentication and file binding

The SPA uses MSAL with personal-account authority and exact redirect URIs for local, preview, and
production environments. The active registration and delegated-scope contract is maintained in
[`auth/Entra-App-Registration.md`](auth/Entra-App-Registration.md).

Authentication behavior:

1. Initialize MSAL and process any redirect result before route handling can discard it.
2. Restore the active account deterministically from the redirect result, current active account,
   or cached accounts.
3. When MSAL has no cached account, use a token-free account hint retained for up to 30 days to
   attempt one promptless Microsoft session restoration per browser session.
4. Acquire Graph tokens silently first. If Microsoft requires interaction after an active session
   expires, attempt one promptless redirect recovery while preserving the requesting route.
5. Keep the existing explicit sign-in or reauthentication action as the fallback when Microsoft
   cannot restore the session without user interaction.

The app-owned restoration record contains only the MSAL home-account ID, login hint, and expiry;
access, refresh, and ID tokens remain owned by MSAL and are never copied into app storage. Explicit
sign-out clears the record. The 30-day window controls only whether Conspectus attempts restoration:
Microsoft can still require interaction earlier because of account, browser, or tenant policy.

The selected OneDrive database binding contains `driveId`, `itemId`, filename, and parent path. It
is persisted per Microsoft account so switching accounts cannot reuse another account's binding.
The path and filename are fallback recovery data; the stable Graph item ID remains the primary
identity.

## Receipt AI configuration and privacy

Receipt AI uses a user-owned OpenRouter API key stored only in the browser. The configuration record
is schema-versioned and keyed by the active Microsoft `homeAccountId`; it contains the key, an
independent model ID for each AI role, and only a user override of the receipt-item grouping rules.
It is never synchronized to OneDrive. Both complete stage prompts and the current default grouping
rules remain versioned application assets instead of persisted user data.

The Settings catalog contract is:

1. Send the key only in the `Authorization` header of a bodyless, no-store request to OpenRouter's
   authenticated `/api/v1/models/user` endpoint. This account-filtered endpoint keeps the user's
   OpenRouter provider preferences, privacy settings, and guardrails effective.
2. Also fetch `/api/v1/benchmarks?source=artificial-analysis&task_type=intelligence` from OpenRouter
   with the same key and no-store settings. Both GETs share one 30-second whole-load deadline.
   Treat the visit as validated only after both responses are parseable. Never use a bundled or
   previously fetched model list or an external AA service. Join the model's `canonical_slug`
   exactly to the benchmark's `model_permaslug`; both roles require a finite Intelligence Index
   of at least 20. Missing, invalid or duplicate benchmark identities are excluded. A failed
   benchmark request fails the complete load without invalidating saved selections.
3. Offer receipt extraction only from current models with image input, text output, zero prompt and
   completion prices, and no nonzero request or image surcharge.
4. Offer transfer derivation only from current models with text input/output, zero prompt and
   completion prices and no nonzero request surcharge. Structured-output support is not required.
   Exclude the confirmed harness-restricted `thinkingmachines/inkling:free` and
   `thinkingmachines/inkling-small:free` variants. Current catalog/endpoint metadata do not expose
   that restriction as a capability, so this is a narrow explicit exclusion based on their 403s.
5. Keep the two selections independent and allow the same eligible model in both roles. A successful
   refresh removes a saved role selection that is no longer eligible without choosing a replacement.
   Authentication, network, parse, and provider failures disable the controls but do not prove the
   saved selection invalid.

The key is write-only in the UI after successful validation: the app displays only a fixed configured
state and does not put it in URLs, logs, telemetry, provider error text, service-worker caches, or
diagnostics. Browser storage is not equivalent to a server-held secret; code running in or people
controlling the same browser profile may be able to access it. Confirmed local reset removes the
record, and explicit OpenRouter deletion removes the complete record for the active account.

Receipt capture uses one native file input with `accept="image/*"` and `capture="environment"` so
supported mobile operating systems own the camera/picker UI. The app does not create a camera stream,
preview, shutter, or separate gallery flow. Selected images are decoded with their browser-applied
orientation, limited to a 20 MiB source, resized without upscaling to a maximum 2560-pixel long edge,
and canvas-encoded once as JPEG at quality `0.85`; encoded output above 4 MiB is rejected. Canvas
re-encoding transfers raster pixels instead of original EXIF, GPS, camera, or device metadata.

Raw files, decoded surfaces, normalized bytes, and temporary object URLs remain ephemeral. The
normalization owner releases decoder/canvas resources on every outcome, and the receipt-run owner
zeroes its normalized byte buffer after the stage-1 consumer finishes or when navigation, database
binding, account, reset, sign-out, cancellation, or supersession abandons the run. No receipt image is
written to IndexedDB, SQLite, OneDrive, service-worker caches, logs, diagnostics, or application
backups. Browser and operating-system internals may still use implementation-defined temporary file
storage for native `File` and canvas APIs; the application neither requests nor retains such storage.

Receipt analysis is an abortable, two-stage feature workflow behind typed OpenRouter interfaces:

Both stages choose the lowest positive reasoning effort advertised in the freshly loaded model
metadata and explicitly enable reasoning. Models with only an on/off control use on; a model
without reasoning capabilities receives no invented reasoning parameter. Production never selects
`none` or the benchmark's optional off mode.

1. Immediately before stage 1, fetch the authenticated account-specific model catalog and verify
   together with live OpenRouter benchmarks and verify that the configured vision model is still
   free, image/text compatible and has an Intelligence Index >= 20. Only then send the
   versioned app-owned extraction prompt and normalized JPEG to that exact model.
2. Parse bounded non-streaming JSON. A successful extraction requires complete EUR fields and exact
   integer-cent line arithmetic. An error response retains typed readable metadata and items;
   unknown fields may be null. Preserve these suggestions for manual review without treating them
   as a successful extraction. Release image bytes as soon as stage one finishes.
3. Immediately before stage 2, fetch the catalog again and verify that the independently configured
   text model remains free, text-compatible and has an Intelligence Index >= 20. Send the typed
   extraction (possibly partial when readable items exist) and the app-owned derivation prompt.
   Its visible `{{CUSTOM_PROMPT}}` slot is replaced once with the opaque user rules in the system
   message; extraction JSON is a separate user message. Never send the image or Microsoft
   account, Conspectus account, balance,
   transfer-history, category-table, database, or OneDrive data.
4. Request the app-owned JSON format in the versioned prompt without `response_format` or
   `require_parameters`. Validate the returned JSON locally. The editable grouping
   rules are opaque prompt text: the app inserts them verbatim and does not parse, interpret,
   or validate their transfer/category mapping. The second model creates the transfer names and
   category arrays and one shared `buyplace`, allowing merchant-name normalization according to
   the user's rules. Stage 2 returns neither `receiptDate` nor `receiptTotalCents`; the parser copies
   the validated extraction date to every local transfer and retains the extraction total locally.
   The shared purchase location is expanded into each local transfer command. Both prompts require
   German model-declared error reasons for display. Local validation proves bounded output structure, positive integer-cent transfer
   amounts, exact once-only source-line coverage, per-group arithmetic, and an exact receipt-total
   match. Model-declared errors retain bounded partial groups and metadata. A model's incorrect
   "ok" remains rejected, but typed fields can still seed the manual draft after local validation fails.
5. While processing, animate the active step marker and show a localized waiting message without
   invented percentages. Respect reduced-motion preferences and stop the activity indicator when
   waiting for review or after a failure. Show the valid source accounts without preselection, then one shared date and purchase location,
   followed by editable transfer names, up to three categories and amounts. Users can add/remove
   rows. All data is transient and cleared on route/context replacement; ordinary options refresh
   and offline transitions preserve the review draft. Stage 2 never receives the source selection.
   Display both the entered sum and any extracted receipt total. A difference is informational:
   the user may be correcting an OCR mistake, so the manual batch is validated against entered
   amounts rather than the old OCR coverage proof. Known non-EUR results cannot be booked as EUR.
6. Only an explicit Save (including deliberate form submission) validates the reviewed inputs,
   resolves category names uniquely against current local options and targets the sole primary
   spendings account. It reuses Add Transfer validation and type derivation, freezes the resulting
   batch, and claims it once. Neither analysis completion nor account selection writes anything.
   Revalidate the batch against the authenticated verified-current
   runtime, and apply all transfer inserts and balance changes in one SQLite transaction. Export one
   full snapshot and send it through the existing eTag/`If-Match` upload boundary. The final progress
   step remains active until OneDrive acceptance and required cache reconciliation; only then is the
   exact singular/plural created count shown.

After command handoff, image, extraction, raw response, and derivation state is released. A retryable
pre-commit upload failure retains only the already exported database bytes and the eTag against
which they were produced, so retry repeats neither the AI stages, local validation, transaction,
nor export and cannot attach stale bytes to newer cached metadata. An eTag conflict instead discards those
stale bytes, refreshes the authoritative runtime, retains only the immutable commands, revalidates
them, and waits for an explicit save-again action without adding a review screen. When OneDrive
accepts the upload but local cache persistence fails, the remote commit is final: all write retries
are disabled and the app forces verified reconciliation. A remaining reconciliation failure says
that OneDrive is already updated and cannot resume the batch. If the local transaction commits but
the subsequent SQLite export fails or is empty, the app closes that runtime and restores the
verified OneDrive snapshot before enabling another write, preventing an unreported local batch from
entering a later upload.

Both calls use the explicitly selected model without model or provider fallback and a 90-second
completion deadline. Use the lowest positive reasoning effort declared by the current catalog;
models exposing only a binary switch use enabled reasoning. Unknown capabilities leave the provider
default untouched. Mandatory reasoning is never disabled. The opt-in benchmark compares these
settings with `enabled: false` where allowed. Both calls add no app
owned ZDR or data-collection routing restriction, so stricter OpenRouter account preferences and
guardrails remain effective. Any catalog, transport, model, parsing, validation, cancellation, or
supersession failure performs no SQLite, cache, Graph, or OneDrive mutation. Provider and analysis
errors preserve known typed data for manual review; cancellation or context replacement clears it.
A completed
older run cannot publish over a newer run or changed application context.

These validations prove structural and arithmetic consistency, not that the model classified every
receipt line into the semantically correct user-defined group. The capture UI discloses this residual
risk before analysis; users maintain the grouping and category rules in Settings.

Receipt derivation may simplify the merchant name according to the user's rules. The shipped
default rules classify abbreviated or ambiguous items by plausibility using receipt context;
unsupported items without a plausible matching rule are rejected. Grocery deposits/returns belong to normal
food, and the whole-receipt restaurant rule takes precedence. Discounts/returns reduce only their
identifiable group. Nonpositive receipts or groups fail closed. Custom rules remain opaque prompt
text. Before capture and again on picker return, local preflight requires valid account topology;
the default rules additionally require all five referenced category names to exist uniquely.
Temporary same-context options loading suspends saving. Options errors disable Save while keeping
the draft; session replacement invalidates it. Catalog and completion failures never retry models
automatically; known data remains available for manual review or a deliberate fresh capture.

Saving requires the explicit review Save action. A transient post-save summary shows
the booked fields and directs corrections to Desktop with Mobile closed. A visible warning asks
users to check existing transfers before a repeated photo; no cross-run duplicate detector or
persistent receipt fingerprint is claimed. The image limits bound source/output bytes and output
dimensions, not peak decoder memory or OCR legibility. Provider and physical-device qualification
are tracked separately in [the AP4 evidence record](reviews/2026-10-20-ap4-receipt-qualification.md).

M9-01 performs only catalog requests and sends no receipt, extracted result, database content,
account/category data, balance, or transfer history. The receipt workflow privacy boundary disclosed
before later use is that stage 1 sends the image to OpenRouter and a routed vision provider, while
stage 2 sends only the extracted receipt data to OpenRouter and a routed text provider. Provider
logging, retention, and training policies vary. The app does not force ZDR or no-data-collection
routing because that would remove eligible free endpoints; stricter OpenRouter account settings and
guardrails still apply.

## Verified-online read flow

OneDrive is authoritative. Cached bytes may be opened only after the current remote metadata proves
they are fresh.

Startup and forced-refresh orchestration follows this sequence:

1. Resolve the authenticated account and its stored file binding. Bootstrap stays in a loading
   state until authentication and the first database decision complete; no timer declares readiness.
2. Require online connectivity and fetch current Graph metadata, including the eTag and, when
   supplied, its download URL. `databaseRefreshController` coalesces requests for the same session.
3. Reuse an already open, clean runtime only when its own account/file/version/generation still
   matches the remote version. This path reads no cached bytes, reopens no SQLite connection,
   preserves active forms/receipt analysis, and emits no success toast.
4. Otherwise, inspect cache metadata separately, validate a matching cached snapshot or download
   the current file. Forced refresh skips cache reads. Downloads recheck remote metadata before
   promotion so a concurrent replacement cannot attach newer metadata to older bytes.
5. Validate size, SQLite signature, integrity, required columns and integer primary keys, unique
   primary income/spendings accounts, transfer types, and declared/logical references. The DB module
   owns validation and performs no schema migration. Snapshots at least 1 MiB are validated in a
   disposable worker; smaller files use the cached WASM runtime directly. Cancellation terminates
   workers. Cache persistence must succeed before opening an imported snapshot for use.
6. Close or withhold the database runtime when authentication, metadata, download, validation, or
   connectivity fails.

Consequences:

- Cached financial data is never shown as current without a successful online freshness check.
- Invalid cached snapshots are cleared by file identity and downloaded again. An unavailable cache
  fails closed with a targeted retry; bindings and receipt settings are retained. There is no
  uncached write mode and no automatic whole-app reset.
- Transient Graph network failures use a small capped retry policy; authentication, permission,
  binding, conflict, and validation failures fail fast into explicit recovery states.
- Settings remains accessible when financial routes are unavailable.
- Session invalidation aborts superseded Graph/worker work as well as guarding result publication.
  Graph reads include body-consumption deadlines (30 seconds for metadata/browse/URLs, 120 seconds
  for database download); catalog requests have a 30-second deadline and no automatic retry.
  Startup uses at most three transient attempts, exponential backoff and Retry-After capped at
  60 seconds. These conservative bounds are not claims about measured mobile network latency.
- `failurePresentation` supplies localized failure classes and recovery actions. Startup uses one
  primary recovery surface; technical diagnostics remain available to local code/logging, rather
  than being presented as the primary UI message. Remote-commit failures retain AP1 reconciliation.
- Local Performance API entries named `conspectus:*` measure auth, metadata, cache, download,
  validation, runtime open and the first data decision. No content, identity, or key is recorded
  or transmitted. Settings is loaded on demand; receipt owners remain above the route lifecycle.

## Transfer write flow

Creating one manual transfer or an automatic validated receipt batch mirrors the desktop
application's business and database behavior:

1. Require online state and a ready, current database runtime.
2. Validate the date, name, positive integer-cent amount, available account selections, category
   selections, and primary-account combination rules.
3. Derive the desktop-compatible transfer type from the selected account types.
4. In one SQLite transaction, insert the transfer or every transfer in the batch and apply every
   matching source/destination balance change. Any statement failure rolls back the entire action.
5. Export a new full SQLite byte snapshot.
6. Upload the full file to OneDrive with `If-Match` using the opened runtime's original eTag.
7. After remote success, persist the uploaded bytes and returned eTag and refresh visible data.

Safety invariants:

- Manual input and receipt command preparation consume the same form/amount/date/account/type
  rules from `features/transfers`. The receipt feature does not import route-owned validation.

- Manual entry and receipt batches use `transferCommitController`; their adapters own input
  validation and presentation, while the common controller owns commit, retry and recovery.
- `databaseSession` binds a verified runtime to an immutable account, drive, item, base eTag and
  generation. A new transaction requires a verified, clean session; byte-only retry requires the
  original session. Identity is checked again after asynchronous cache and token work, before PUT.
- A write owns the session until its upload attempt finishes. Refresh is deferred during that
  interval; starting refresh revokes write permission until a matching snapshot is opened.
  Failed replacement opens cannot leave the previous runtime authorized for writing. Reset and
  sign-out revoke the session before their asynchronous work begins.
- Tabs keep independent runtime provenance even though IndexedDB is shared. Each PUT retains its
  own base eTag; a newer cached eTag causes a conflict before PUT, and `If-Match` arbitrates
  concurrent server writes. Cache metadata never advances an older runtime's base version.
- Every sql.js export restores and checks required connection PRAGMAs, including on export
  failure. If restoration fails, the runtime closes and loses its generation.
- A failed SQL statement rolls back the entire local transaction.
- Success is not shown before OneDrive accepts the upload.
- A retryable transport failure retries the already exported bytes; it does not repeat the local
  SQL transaction. The retry remains bound to its original eTag and becomes a conflict if cached
  authoritative metadata has advanced.
- A post-transaction export failure closes the locally changed runtime and restores the verified
  OneDrive snapshot before another write is allowed.
- Missing or otherwise untrustworthy cached upload metadata after a local commit uses the same
  authoritative restore path; the locally changed runtime is never left available for a later
  unrelated export.
- A cache failure after remote success is a reconciliation problem, not a retryable remote write.
- A lost response or server failure can leave the remote outcome unknown. The UI identifies that
  uncertainty; only the original bytes and eTag may be retried. A subsequent conflict discards
  those bytes and refreshes without replaying commands or claiming the transfer was not saved.
- An eTag conflict discards stale pending bytes, closes the current sql.js runtime, downloads and
  validates the latest OneDrive snapshot, and reopens the runtime. Manual entry then allows review
  and resubmission of its draft; receipt creation revalidates immutable commands and requires an
  explicit save-again action without exposing a review surface or rerunning either model.
- The application never silently overwrites a remotely changed database.

## Data compatibility

Monetary amounts are integer cents. Dates are SQLite integer epoch days. Month queries use inclusive
UTC-safe epoch-day bounds. Transfer creation follows the desktop account-role and transfer-type
rules.

The tracked schema contract is
[`reference/conspectus-live-schema.sql`](reference/conspectus-live-schema.sql). Query and write
changes must remain compatible with that snapshot and its schema contract tests. The desktop parity
reference and known source caveats are documented in
[`Conspectus-Desktop-Info.md`](Conspectus-Desktop-Info.md).

## Local persistence and reset

Local persistence contains only the data needed for account-specific binding, verified-online cache
reuse, and application operation:

- schema-versioned selected-file bindings;
- schema-versioned per-account OpenRouter receipt settings containing the user-owned API key, two
  model IDs, and an optional grouping-rules override;
- cached database bytes and their matching eTag/sync metadata;
- MSAL-managed authentication state;
- the token-free authentication restoration hint described above;
- PWA/service-worker caches and short-lived UI state.

Confirmed local reset clears app-owned bindings, database snapshots, and app cache data after
closing active Dexie connections. It also clears OpenRouter receipt settings and their in-memory UI
state. It intentionally preserves the Microsoft authentication session and restoration hint so the
user can rebind without an unnecessary sign-in. Sign-out remains a separate explicit action.

## PWA lifecycle and deployment

The service worker uses prompt-based updates. A waiting version must not automatically reload an
open transfer form; the user explicitly activates the update, after which the app reloads once the
new worker is active.
Update discovery runs on registration, when the app returns to the foreground or comes online,
and hourly while active. Concurrent checks are coalesced; discovery never activates the update.
After confirmation the app sends `SKIP_WAITING`, observes the waiting worker's activation directly,
and reloads the accepting page. It does not depend on Workbox's `isUpdate` flag or a
`controllerchange` event, which can be absent after a hard refresh bypassed service-worker control.
An already activated worker from another tab is handled by reloading. A 15-second watchdog aborts
stalled activation and returns a visible, retryable error if activation or navigation does not
complete; update notifications cannot re-enable duplicate activation while a request is applying.
Updates that activate immediately on an uncontrolled page are also offered visibly instead of
leaving the old in-memory bundle running without a prompt.

Footer and Settings identify the running JavaScript bundle using immutable build-time metadata.
The displayed version combines the package release version and the first eight characters of the
checked-out Git commit (for example, `1.0.1-dev+8c81c40a`). The UTC timestamp records the actual build,
not commit or deployment time. The app never overwrites these values with separately fetched server
metadata, which could belong to another build while a PWA update is waiting for confirmation.

Deployment uses two isolated channels:

- fixed GitHub Pages preview slots for `main` and non-`main` work;
- a manually approved production build scoped to `/conspectus/`, handed to the website repository
  as an immutable artifact with deployment identity metadata.

The website repository owns staged publication and atomic promotion of the production subtree. This
repository owns build qualification, artifact identity, dispatch, live identity verification,
rollback target validation, and post-deploy monitoring. Detailed workflow behavior belongs in
[`CI-CD-Pipelines.md`](CI-CD-Pipelines.md); release and rollback execution belong in the runbooks
listed below.

## Security and privacy

- OAuth uses PKCE and delegated permissions; no client secret is shipped.
- Graph access is limited to the scopes in the Entra registration contract.
- The app stores no telemetry by default and no server-side copy of the financial database.
- Production requires HTTPS; localhost HTTP is used only for the registered development callback.
- Downloaded and uploaded content is treated as untrusted external data until validated.
- The deployment CSP permits OpenRouter only as an explicit `connect-src`; catalog requests use
  `cache: no-store`, omit browser credentials, reject redirects, and never expose provider response
  bodies as user-facing errors.
- SQL values are parameterized and database mutations are transactional.
- Dependency advisories, CSP behavior, build output, and deployment identity are checked in CI and
  deployment workflows.
- Temporary high/critical dependency exceptions require an explicit, time-bounded entry in
  [`security/Dependency-Vulnerability-Exceptions.md`](security/Dependency-Vulnerability-Exceptions.md).

The current production-host security limitation and any release-specific risk acceptance belong in
release evidence, not in this architecture document.

## Quality boundaries

Changes should be verified in proportion to their risk. The normal code gate is formatting, lint,
type checking, unit/integration tests, production build, bundle budgets, and Playwright coverage
when browser behavior is affected.

Tests are layered by responsibility:

- unit tests protect pure rules, state transitions, validation, mappings, and error normalization;
- sql.js and fixture-backed integration tests protect schema and transaction behavior;
- component tests protect view states and accessibility contracts;
- Playwright protects cohesive user journeys and PWA behavior;
- physical-device QA protects platform behavior that desktop automation cannot establish.

## Documentation ownership

Use one canonical document per topic:

| Topic                                                      | Canonical source                                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Setup, commands, aliases, and module entry point           | [`README.md`](../README.md)                                                                          |
| Contribution and delivery workflow                         | [`CONTRIBUTING.md`](CONTRIBUTING.md)                                                                 |
| Active GitHub issue backlog and status                     | [`GitHub-Issues-Backlog.md`](GitHub-Issues-Backlog.md)                                               |
| Durable architecture, runtime flows, and safety invariants | This document                                                                                        |
| Entra redirects and Graph delegated scopes                 | [`auth/Entra-App-Registration.md`](auth/Entra-App-Registration.md)                                   |
| Desktop parity and business-rule reference                 | [`Conspectus-Desktop-Info.md`](Conspectus-Desktop-Info.md)                                           |
| Tracked SQLite schema                                      | [`reference/conspectus-live-schema.sql`](reference/conspectus-live-schema.sql)                       |
| CI/CD workflows and artifact contracts                     | [`CI-CD-Pipelines.md`](CI-CD-Pipelines.md)                                                           |
| Release execution                                          | [`Release-Process.md`](Release-Process.md)                                                           |
| Physical-device release gate                               | [`Manual-Device-QA.md`](Manual-Device-QA.md)                                                         |
| Production rollback                                        | [`Production-Rollback.md`](Production-Rollback.md)                                                   |
| Dependency vulnerability exceptions                        | [`security/Dependency-Vulnerability-Exceptions.md`](security/Dependency-Vulnerability-Exceptions.md) |

Do not append issue completion notes or release evidence to this file. Implementation history
belongs in GitHub issues, pull requests, Git history, or the archive.
