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
