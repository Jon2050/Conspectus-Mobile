# `src/auth`

Responsibility:
- Own user authentication flow and account session lifecycle.
- Provide token acquisition helpers for Graph requests.
- Normalize auth errors for UI handling.

Dependency boundaries:
- May depend on `@shared`.
- Must not depend on `@graph`, `@db`, `@cache`, or `@features`.
