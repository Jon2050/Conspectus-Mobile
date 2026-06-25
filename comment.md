Completed the implementation of M6-04 with the following changes:

- **Added Transfer Type Constants:** Exported the desktop-equivalent IDs for expenses (1), earnings (2), and internal transfers (3).
- **Implemented Transfer Type Derivation Logic:** Added pure utility function `deriveTransferType` that correctly identifies the transfer type ID from the selected `fromAccountTypeId` and `toAccountTypeId` matching desktop semantics.
- **Enforced Separation of Concerns:** By using Account Type IDs instead of raw account options inside the derivation, we decouple the business rule from the frontend UI data structures.
- **Test Coverage:** Added comprehensive unit test coverage for all primary/non-primary/fallback branch combinations.

**Assumptions / Notes:**

- We assume `PRIMARY_INCOME_ACCOUNT_TYPE_ID` is `1` and `PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID` is `2` as observed from desktop configurations.
- Unset/undefined/null inputs gracefully fall back to the internal transfer (`3`) behavior to prevent form state crash during incomplete user selection.
