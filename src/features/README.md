# `src/features`

Responsibility:

- Implement user-facing feature flows and screen-level behavior.
- Compose services from `@auth`, `@graph`, `@db`, `@cache`, and `@shared`.
- Keep feature-specific UI state close to each feature.
- Own account-scoped receipt AI configuration, prompt defaults, and Settings orchestration while
  consuming provider HTTP behavior only through `@openrouter`.

Dependency boundaries:

- May depend on all lower-level modules.
- Must not be imported by infrastructure modules.

Settings presentation:

- Group settings in the reusable `app-shell/routes/SettingsSection.svelte` component. Each native
  disclosure starts collapsed on route entry; new settings areas should use their own section.
- Manual transfer entry defaults the source to the primary income account and the target to the
  primary spendings account by account type, preserving existing drafts. Receipt preparation keeps
  its separate deliberate source-account selection.

Receipt AI settings:

- `receipt/prompts/` owns the separate hidden stage prompts and versioned user-editable grouping-rule
  default. The schema-versioned per-Microsoft-account settings record contains the user-owned
  OpenRouter key, two independent model IDs, model-bound reasoning capability snapshots and a
  custom grouping-rules override. Schema 2 reads legacy schema 1 without losing selections; legacy
  unknown capabilities use provider defaults until refreshed in Settings (no guaranteed minimum).
- `app-shell/routes/settingsOpenRouterController.ts` validates that record against a fresh
  authenticated catalog on every Settings entry and never exposes the key in public UI state.
- `receipt/receiptImageNormalization.ts` owns the testable capture limits and normalized JPEG
  contract: at most 20 MiB input, a 2560-pixel long edge without upscaling, JPEG quality `0.85`, and
  at most 4 MiB output.
- `receipt/browserReceiptImageCodec.ts` decodes browser-supported camera formats with their applied
  orientation and canvas-re-encodes pixels so source EXIF/GPS/device metadata is not copied.
- `receipt/receiptCaptureController.ts` owns a single in-memory capture while
  `receipt/receiptAnalysisController.ts` orchestrates the two OpenRouter stages. The analysis
  controller directly uses each stored model without catalog/benchmark requests, releases image bytes after
  stage 1, passes the editable grouping rules verbatim to stage 2 without parsing them, and retains
  typed partial metadata/groups for manual review as well as validated complete derivations.
  Stage-two wire groups contain no amounts; the parser calculates signed cent sums from valid
  references locally, checks overflow, positive complete groups and exact source coverage.
  Settings persists reasoning capabilities on successful catalog refresh and model selection;
  production enables the lowest known positive effort after restart too. Request availability
  failures retain known drafts/settings and identify the failing role with a Settings hint.
  Mistaken model success is still rejected; readable suggestions may remain editable.
- `receipt/receiptTransferPreparationController.ts` owns the deliberate per-run source selection,
  accessible three-step progress state, editable shared metadata/group rows and explicit Save handoff.
  `app-shell/routes/ReceiptReviewForm.svelte` presents that draft with collapsible article-name lists
  and numbered move buttons. `receipt/receiptReviewDraft.ts` owns item moves and safe signed-cent
  recalculation for the two affected groups; only empty groups can be removed. Source articles
  remain ephemeral, immutable in controller state and are cleared at handoff/reset. Starting a new
  photo requires closing and reopening Add. Analysis/account selection never
  writes. Its pure command
  builder resolves exact current category names, targets the sole primary spendings account, and
  reuses Add Transfer validation and type derivation without writing SQLite or OneDrive.
- `app-shell/transferCommitController.ts` owns the common transaction/export/upload, byte-only
  retry, conflict and reconciliation state machine. The manual save adapter supplies one immutable
  command; the receipt adapter supplies its validated batch. Neither duplicates persistence recovery.
- `app-shell/databaseSession.ts` binds write permission to the opened runtime's account, file,
  original eTag and generation, excludes refresh during upload, and revokes permission on refresh,
  reset or sign-out. Shared IndexedDB metadata cannot update another tab's runtime provenance.
- `app-shell/databaseRefreshController.ts` owns coalescing, supersession and runtime application
  under that session. Same-version refresh keeps the clean runtime and active receipt workflow;
  replacement invalidates transient receipt state. Bootstrap readiness follows actual completion.
- `transfers/` owns shared form/date/amount/account validation and transfer-type rules consumed by
  manual UI and receipt commands. Receipt code no longer imports these from app-shell routes.
- `app-shell/failurePresentation.ts` maps diagnostic codes to localized classes and next actions.
  Settings loads on demand. The common commit controller retains remote-outcome ownership.
- Cancellation, account/file context changes, and supersession clear selection, coverage proof,
  derivation, and prepared commands; public UI state never exposes raw or normalized image bytes.
- `receipt/receiptSetupValidation.ts` checks topology and the known default category metadata before
  remote work without interpreting custom rules. Same-context loading and options errors suspend
  saving while retaining the editable draft; session replacement clears it. The Add route retains
  only commands for its transient post-save summary.
- The synthetic receipt gold corpus and recorded-response evaluator distinguish parser consistency
  from actual provider semantics; qualification gaps are recorded in
  `docs/reviews/2026-10-20-ap4-receipt-qualification.md`.
