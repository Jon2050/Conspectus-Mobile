# `src/openrouter`

Responsibility:

- Encapsulate authenticated OpenRouter HTTP requests and response parsing.
- Normalize provider failures without exposing API keys or provider response bodies.
- Settings fetches the authenticated live catalog with a 30-second whole-load deadline, accepts caller
  cancellation and never retries automatically. Settings offers an explicit catalog retry.
  Receipt analysis never invokes the catalog GET. Completion deadlines remain separate.
- Derive current free receipt-vision and text model options from the account-filtered catalog's
  prices and image/text capabilities. Dynamic options require the catalog's explicit `:free`
  variant and exclusively text output: models
  also generating audio, images or other modalities are excluded even with zero text-token prices.
  No intelligence benchmark or canonical-version match is required.
  A successful catalog also appends the explicitly supported paid model
  `meta/muse-spark-1.3-contributor` to both roles, once and after the dynamic free options.
  The UI marks it paid in both selections.
  Live reasoning metadata takes precedence; if absent, the verified minimum `minimal` is available.
  The manual option does not bypass catalog authentication/errors and is never auto-selected.
- Classify missing model/endpoint failures at the completion boundary, separately from auth,
  rate limits, network, timeouts, malformed responses and generic provider failures.
- Send non-streaming text and ephemeral local-JPEG chat completions with provider fallback disabled.
- Completions use a 90-second timeout and accept explicit reasoning controls. Live catalog reasoning
  capabilities saved by Settings determine supported efforts and whether off is permitted; no model-name guessing.
  Receipt production requests explicitly enable the lowest positive supported effort. Without
  advertised active efforts they disable optional reasoning and retain fixed mandatory reasoning.
  `enabled: true` alone selects provider defaults, not a guaranteed low effort. Token-budget support
  alone does not declare a minimum active effort/budget. Unknown/legacy capabilities leave the
  provider default untouched, without a guaranteed minimum until a successful Settings refresh.
- Exclude the two confirmed harness-only Inkling free variants. Current model/endpoint metadata
  lack a machine-readable harness-access filter, so this narrow exclusion supplements live filtering.
- JSON shape is requested in the app-owned prompts and validated locally. Completions do not send
  `response_format` or require structured-output provider support.

Dependency boundaries:

- May depend on `@shared` when shared provider-neutral utilities are needed.
- Must not depend on authentication, Graph, database, cache, or feature code.

The module does not own Microsoft-account configuration, receipt prompts, receipt validation,
two-stage orchestration, or UI state. Those concerns remain in `src/features`.
