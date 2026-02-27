# `src/features`

Responsibility:
- Implement user-facing feature flows and screen-level behavior.
- Compose services from `@auth`, `@graph`, `@db`, `@cache`, and `@shared`.
- Keep feature-specific UI state close to each feature.

Dependency boundaries:
- May depend on all lower-level modules.
- Must not be imported by infrastructure modules.
