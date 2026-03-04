# `src/auth`

Responsibility:

- Own user authentication flow and account session lifecycle.
- Provide token acquisition helpers for Graph requests.
- Normalize auth errors for UI handling.

Dependency boundaries:

- May depend on `@shared`.
- Must not depend on `@graph`, `@db`, `@cache`, or `@features`.

Expected public interfaces (`src/auth/index.ts`):

- `AuthAccount`: signed-in account identity surfaced to UI/state layers.
- `AuthSession`: deterministic auth state snapshot (`isAuthenticated` + account).
- `AuthClient`: bootstrap/login/logout/token API used by higher-level modules.
- `AuthErrorCode` and `AuthError`: normalized, provider-agnostic auth failure model.

M3 implementation target:

- Keep MSAL-specific details behind `AuthClient`.
- Return stable session and error shapes so feature code does not depend on MSAL internals.
