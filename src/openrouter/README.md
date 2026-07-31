# `src/openrouter`

Responsibility:

- Encapsulate authenticated OpenRouter HTTP requests and response parsing.
- Normalize provider failures without exposing API keys or provider response bodies.
- Derive current free receipt-vision and structured-text model options from live catalog metadata.
- Send non-streaming text and ephemeral local-JPEG chat completions with provider fallback disabled.
- Enforce strict JSON Schema routing for structured completions without adding privacy-routing flags.

Dependency boundaries:

- May depend on `@shared` when shared provider-neutral utilities are needed.
- Must not depend on authentication, Graph, database, cache, or feature code.

The module does not own Microsoft-account configuration, receipt prompts, receipt validation,
two-stage orchestration, or UI state. Those concerns remain in `src/features`.
