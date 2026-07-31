# `src/openrouter`

Responsibility:

- Encapsulate authenticated OpenRouter HTTP requests and response parsing.
- Normalize provider failures without exposing API keys or provider response bodies.
- Derive current free receipt-vision and structured-text model options from live catalog metadata.

Dependency boundaries:

- May depend on `@shared` when shared provider-neutral utilities are needed.
- Must not depend on authentication, Graph, database, cache, or feature code.

The module does not own Microsoft-account configuration, receipt prompts, completion calls, or UI
state. Those concerns remain in `src/features`.
