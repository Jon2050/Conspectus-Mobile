# `src/openrouter`

Responsibility:

- Encapsulate authenticated OpenRouter HTTP requests and response parsing.
- Normalize provider failures without exposing API keys or provider response bodies.
- Catalog and intelligence-benchmark GETs share a 30-second whole-load deadline, accept caller cancellation and never retry
  automatically. Receipt analysis maps catalog deadlines to its existing timeout recovery; Settings
  offers its existing explicit catalog retry. Completion deadlines remain separate.
- Derive current free receipt-vision and text model options from the authenticated live catalog and
  OpenRouter's `GET /api/v1/benchmarks?source=artificial-analysis&task_type=intelligence` endpoint.
  Join `canonical_slug` to `model_permaslug` exactly and require a finite Intelligence Index >= 20
  for both roles. Missing, malformed or ambiguous scores are excluded; benchmark-load failures
  fail the whole load. No external AA service, guessed name match, or bundled score list is used.
- Send non-streaming text and ephemeral local-JPEG chat completions with provider fallback disabled.
- Completions use a 90-second timeout and accept explicit reasoning controls. Live catalog reasoning
  capabilities determine supported efforts and whether off is permitted; no model-name guessing.
  Receipt production requests explicitly enable the lowest positive supported effort, or enable
  the binary switch. The benchmark-only off mode is never selected by production.
- Exclude the two confirmed harness-only Inkling free variants. Current model/endpoint metadata
  lack a machine-readable harness-access filter, so this narrow exclusion supplements live filtering.
- JSON shape is requested in the app-owned prompts and validated locally. Completions do not send
  `response_format` or require structured-output provider support.

Dependency boundaries:

- May depend on `@shared` when shared provider-neutral utilities are needed.
- Must not depend on authentication, Graph, database, cache, or feature code.

The module does not own Microsoft-account configuration, receipt prompts, receipt validation,
two-stage orchestration, or UI state. Those concerns remain in `src/features`.
