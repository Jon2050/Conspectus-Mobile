# `src/graph`

Responsibility:

- Provide typed Microsoft Graph API access used by the app.
- Handle request/response mapping for OneDrive file operations.
- Map Graph failures to stable app-level error categories.

Dependency boundaries:

- May depend on `@auth` and `@shared`.
- Must not depend on `@features`.

Expected public interfaces (`src/graph/index.ts`):

- `DriveItemBinding`: stored identity for the selected OneDrive database file.
- `DriveFolderReference` and `GraphDriveItem`: typed OneDrive browse models for folder/file selection.
- `GraphFileMetadata`: eTag/size/modified metadata used by sync decisions.
- `GraphUploadResult`: post-upload metadata returned from Graph.
- `GraphClient`: browse, metadata, download, and conditional-upload operations.
- `createGraphClient`: factory that injects auth-backed bearer tokens into Graph requests.
- `GraphErrorCode` and `GraphError`: normalized failure model for UI/services.

M3 implementation target:

- Keep raw Graph REST and HTTP mapping details private to this module.
- Ensure `GraphClient` exposes the minimal operations required by M3/M4 flows.
