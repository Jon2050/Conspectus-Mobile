# M5 pre-review notes (focus: maintainability vs. implementation size)

## Context

The month selector implementation in M5-04 added substantial code because it included not only UI controls, but also swipe-gesture logic, date/time stability handling, and multi-layer regression tests (unit + route + e2e).

## M5-04 (month navigation): concerns and recommendations

- **Concern:** The feature scope is small, but implementation includes extra complexity (custom swipe intent thresholds, animated month-label transitions, touch-event simulation helpers in e2e), which inflates LOC.
- **Argument:** Some complexity is justified for mobile UX and DST/timezone correctness, but parts can be simplified without losing reliability.
- **Recommendation:**
  1. Keep the dedicated month-navigation helper module and core tests.
  2. Move verbose swipe/touch e2e helpers into shared `tests/e2e/helpers`.
  3. Consider simplifying/removing nonessential animation logic in `TransfersRoute` until M5-06 list UI is complete.
  4. Keep fallback Previous/Next controls for accessibility and non-gesture devices.

## Similar patterns in M5-01 to M5-03

### M5-01 (sql.js runtime + startup sync)

- **Potential overkill:** Very defensive runtime lifecycle and error taxonomy (`DbRuntimeError` codes, header checks, pragma verification, superseded-run guarding) add significant surface area.
- **Why it may still be justified:** This is core infrastructure; failures here are high impact. Deterministic startup behavior and fail-closed errors improve long-term operability.
- **Trim option:** Consolidate guard patterns where possible and reduce duplicate test scaffolding; preserve strict error boundaries.

### M5-02 (account query service)

- **Potential overkill:** Strict column-name and row-shape/type validation plus many malformed-result tests is heavier than a basic read query.
- **Why it may still be justified:** The fail-closed mapping protects UI from schema drift and keeps DB contracts explicit.
- **Trim option:** Keep strict mapping, but reduce repetitive negative-case tests by using table-driven test helpers.

### M5-03 (transfer-by-month query service)

- **Potential overkill:** Similar strict mapping + extensive malformed-case tests + fixture usage can appear large for a single query service.
- **Why it may still be justified:** Month-boundary logic (inclusive range, leap-year behavior, deterministic ordering) is correctness-critical and regression-prone.
- **Trim option:** Keep month-bound tests and one malformed-contract test per failure class; collapse duplicate invalid-shape/type scenarios.

## Overall recommendation for M5 maintenance

- Prefer **small, reusable helpers** over large inline logic.
- Keep **one strong test per risk category** instead of many near-duplicate negative tests.
- Preserve strict DB-contract boundaries in services (good long-term maintainability), but reduce per-feature ceremony in UI where it does not protect correctness.
