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
independent model ID for each AI role, and only a user override of the transfer-derivation prompt.
It is never synchronized to OneDrive. The extraction prompt and current default derivation prompt
remain versioned application assets instead of persisted user data.

The Settings catalog contract is:

1. Send the key only in the `Authorization` header of a bodyless, no-store request to OpenRouter's
   authenticated `/api/v1/models/user` endpoint. This account-filtered endpoint keeps the user's
   OpenRouter provider preferences, privacy settings, and guardrails effective.
2. Treat the key as validated for the current Settings visit only after that request succeeds and
   returns a parseable catalog. Never use a bundled or previously fetched model list.
3. Offer receipt extraction only from current models with image input, text output, zero prompt and
   completion prices, and no nonzero request or image surcharge.
4. Offer transfer derivation only from current models with text input/output, zero prompt and
   completion prices, no nonzero request surcharge, and advertised `structured_outputs` support.
5. Keep the two selections independent and allow the same eligible model in both roles. A successful
   refresh removes a saved role selection that is no longer eligible without choosing a replacement.
   Authentication, network, parse, and provider failures disable the controls but do not prove the
   saved selection invalid.

The key is write-only in the UI after successful validation: the app displays only a fixed configured
state and does not put it in URLs, logs, telemetry, provider error text, service-worker caches, or
diagnostics. Browser storage is not equivalent to a server-held secret; code running in or people
controlling the same browser profile may be able to access it. Confirmed local reset removes the
record, and explicit OpenRouter deletion removes the complete record for the active account.

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

1. Resolve the authenticated account and its stored file binding.
2. Require online connectivity and fetch current Graph metadata, including the eTag.
3. If a complete cached snapshot has the same eTag, open those cached bytes.
4. Otherwise, download the current file, validate its size, SQLite signature, schema compatibility,
   and ability to open, then promote it to the cache and active database runtime.
5. Close or withhold the database runtime when authentication, metadata, download, validation, or
   connectivity fails.

Consequences:

- Cached financial data is never shown as current without a successful online freshness check.
- Losing IndexedDB data is recoverable by downloading the OneDrive file again.
- Transient Graph network failures use a small capped retry policy; authentication, permission,
  binding, conflict, and validation failures fail fast into explicit recovery states.
- Settings remains accessible when financial routes are unavailable.
- Overlapping sync operations use supersession guards so an older result cannot replace a newer
  accepted runtime.

## Transfer write flow

Creating a transfer mirrors the desktop application's business and database behavior:

1. Require online state and a ready, current database runtime.
2. Validate the date, name, positive integer-cent amount, available account selections, category
   selections, and primary-account combination rules.
3. Derive the desktop-compatible transfer type from the selected account types.
4. In one SQLite transaction, insert the transfer, decrement the source balance, and increment the
   destination balance.
5. Export a new full SQLite byte snapshot.
6. Upload the full file to OneDrive with `If-Match` using the current eTag.
7. After remote success, persist the uploaded bytes and returned eTag and refresh visible data.

Safety invariants:

- A failed SQL statement rolls back the entire local transaction.
- Success is not shown before OneDrive accepts the upload.
- A retryable transport failure retries the already exported bytes; it does not repeat the local
  SQL transaction.
- A cache failure after remote success is a reconciliation problem, not a retryable remote write.
- An eTag conflict discards stale pending bytes, closes the current sql.js runtime, downloads and
  validates the latest OneDrive snapshot, reopens the runtime, and only then allows the user to
  review and submit the preserved draft again.
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
  model IDs, and an optional derivation-prompt override;
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
open transfer form; the user explicitly activates the update, after which the app reloads when the
new worker controls the page.

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
