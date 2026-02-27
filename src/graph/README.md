# `src/graph`

Responsibility:
- Provide typed Microsoft Graph API access used by the app.
- Handle request/response mapping for OneDrive file operations.
- Map Graph failures to stable app-level error categories.

Dependency boundaries:
- May depend on `@auth` and `@shared`.
- Must not depend on `@features`.
