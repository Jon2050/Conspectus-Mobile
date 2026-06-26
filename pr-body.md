Resolves M6-10.

Added comprehensive write-path tests for the Add Transfer feature, validating:

- Unit tests for validation, derivation, and UI phase transitions.
- Integration coverage for SQLite transaction bounds, upload handoff orchestration, metadata updates, and fallback behavior for synchronization conflicts.
- E2E flows simulating local successful saves, retrying transient API failures, enforcing online prerequisites, surfacing offline warnings, capturing proper transfer progress, and reporting UI synchronization outcomes with visual toasts.
