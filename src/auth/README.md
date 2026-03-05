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
- `createAuthClient`: factory that hides MSAL details behind the `AuthClient` interface.
- `AuthErrorCode` and `AuthError`: normalized, provider-agnostic auth failure model.

M3 implementation target:

- Keep MSAL-specific details behind `AuthClient`.
- Use silent-first token acquisition (`acquireTokenSilent`) and return `interaction_required` when user re-auth is needed.
- Restore active account in deterministic order: redirect result account, current active account, then cached account fallback.
- Return stable session and error shapes so feature code does not depend on MSAL internals.
