Closes #72

**Implementation:**

- Creates a `networkStateStore` to reactively track `navigator.onLine`.
- Modifies `AddRoute.svelte` to show an offline warning and disable submit/retry buttons.
- Blocks offline submission at the logic layer in `addTransferSaveController.ts` by passing `isOffline` from UI.
- Updates the backlog status for `M6-09` to done.

**Validation:**

- Local checks passed (`npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run test:e2e`).
- Code review subagent approved changes after refactoring to remove global window coupling.
