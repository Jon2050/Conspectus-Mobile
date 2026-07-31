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

Receipt AI settings:

- `receipt/` owns versioned prompt defaults and the schema-versioned per-Microsoft-account settings
  record containing the user-owned OpenRouter key, two independent model IDs, and only a custom
  transfer-prompt override.
- `app-shell/routes/settingsOpenRouterController.ts` validates that record against a fresh
  authenticated catalog on every Settings entry and never exposes the key in public UI state.
- `receipt/receiptImageNormalization.ts` owns the testable capture limits and normalized JPEG
  contract: at most 20 MiB input, a 2560-pixel long edge without upscaling, JPEG quality `0.85`, and
  at most 4 MiB output.
- `receipt/browserReceiptImageCodec.ts` decodes browser-supported camera formats with their applied
  orientation and canvas-re-encodes pixels so source EXIF/GPS/device metadata is not copied.
- `receipt/receiptCaptureController.ts` owns a single in-memory capture while
  `receipt/receiptAnalysisController.ts` orchestrates the two OpenRouter stages. The analysis
  controller revalidates each selected model immediately before use, releases image bytes after
  stage 1, parses the active prompt's canonical transfer/category declarations, and retains only a
  structurally, arithmetically, and mapping-validated transient derivation for the later
  local-transfer workflow. Cancellation and supersession clear every transient result and never
  expose raw or normalized bytes through public UI state.
