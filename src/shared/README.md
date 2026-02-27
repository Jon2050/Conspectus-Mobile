# `src/shared`

Responsibility:
- Hold shared utilities, primitives, and reusable state stores.
- Provide cross-cutting helpers with no feature-specific knowledge.
- Offer stable public exports through module barrels.

Dependency boundaries:
- May be imported by all modules.
- Must not import from `@features`.
