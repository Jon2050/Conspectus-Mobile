# Conspectus Desktop Info (for PWA Implementation)

This file summarizes the current desktop Conspectus app in this repository and captures the information needed to implement the mobile PWA in a separate repo.

Scope of this document:
- What the desktop app is and how it behaves.
- Database schema and data conventions relevant for PWA MVP.
- Business rules to mirror for read/write parity.
- Known inconsistencies/risks in repo artifacts.

---

## 1. Desktop App Snapshot

- Name: **Conspectus**
- Type: Java desktop app (JavaFX UI + SQLite DB)
- Build: Maven (`pom.xml`)
- Main class: `conspectus.Main`
- DB access: JDBC via `org.xerial:sqlite-jdbc`

Current feature set (desktop):
- Accounts and balances
- Transfers (income/expense/internal)
- Categories (up to 3 per transfer)
- Standing orders (recurring transfer generation)
- Account/category groups
- Monthly stats/balance views

Key source entry points:
- `src/main/java/conspectus/Main.java`
- `src/main/java/conspectus/database/Database.java`
- `src/main/java/conspectus/database/loader/*`
- `src/main/java/conspectus/database/persistance/*`
- `resources/conspectusDB.schema.sql`

---

## 2. Data Conventions (Important for PWA)

## 2.1 Amount encoding

- Monetary values are stored as **integer cents** (`long` in Java, `INTEGER` in SQLite).
- Formatting converts cents to currency string (`amount / 100.0`).
- Negative/positive semantics depend on context:
  - `transfer.amount` is stored as absolute positive amount in practice.
  - Expense/income meaning comes from transfer type and account roles.

References:
- `tools/MoneyFormat.java`
- `conspectus/ui/framework/element/MoneyField.java`

## 2.2 Date encoding

- Dates in DB are stored as **epoch day** (`LocalDate.toEpochDay()`), not unix seconds.
- Month filters use inclusive range `[firstDayEpoch, lastDayEpoch]`.

References:
- `DBInserts.insertTransfer(...)` stores epoch day.
- `TransferLoader.loadTransfersByMonth(...)` uses inclusive epoch-day range.

## 2.3 Transfer type mapping

Enum and IDs:
- `STD_EXPENSE` = `1`
- `STD_EARNING` = `2`
- `INTERN_TRANSFER` = `3`

Desktop determination logic:
- If receiving account is primary -> `STD_EXPENSE`
- Else if spending account is primary -> `STD_EARNING`
- Else -> `INTERN_TRANSFER`

Reference:
- `conspectus/data/entity/Transfer.java` (`TransferType.getTransferType`)

## 2.4 Primary accounts

Primary account types:
- `PRIMARY_INCOME` (type ID `1`)
- `PRIMARY_SPENDINGS` (type ID `2`)

These are system accounts used to classify income/expense flows.

---

## 3. Database Schema (PWA-Relevant)

The most complete schema snapshot in repo is:
- `resources/conspectusDB.schema.sql`

Core tables for MVP:

1. `account`
- `account_id INTEGER PRIMARY KEY`
- `name TEXT NOT NULL`
- `amount INTEGER NOT NULL` (cents)
- `ac_order INTEGER NOT NULL`
- `ac_type_id INTEGER` (FK -> `account_type.ac_type_id`)
- `visible BOOLEAN DEFAULT TRUE`

2. `account_type`
- `ac_type_id INTEGER PRIMARY KEY`
- `account_type_name TEXT`
- Expected values include primary and standard account kinds.

3. `transfer`
- `transfer_id INTEGER PRIMARY KEY`
- `name TEXT NOT NULL`
- `from_account INTEGER` (FK -> `account.account_id`)
- `to_account INTEGER` (FK -> `account.account_id`)
- `amount INTEGER` (cents)
- `transfer_type_id INTEGER` (FK -> `transfer_type.transfer_type_id`)
- `category_1_id INTEGER NULL`
- `category_2_id INTEGER NULL`
- `category_3_id INTEGER NULL`
- `date INTEGER` (epoch day)
- `buyplace TEXT NULL`

4. `transfer_type`
- `transfer_type_id INTEGER PRIMARY KEY`
- `transfer_type_name TEXT`

5. `category`
- `category_id INTEGER PRIMARY KEY`
- `name TEXT NOT NULL UNIQUE`

6. `constants`
- `name TEXT PRIMARY KEY`
- `text_value TEXT`
- `numeric_value NUMERIC`
- Includes `datamodel_version`

Additional tables present but not needed for MVP read/write:
- `standing_order`
- `standing_order__transfer`
- `account_group`
- `account__account_group`
- `category_group`
- `category__category_group`

---

## 4. Desktop Behavior to Mirror in PWA MVP

## 4.1 Accounts view behavior

Desktop accounts table shows:
- **visible, non-primary accounts** (`getVisibleAccountsList()`)
- sorted by account comparator (for non-primary effectively `ac_order`, then name)

Reference:
- `AccountViewerController.loadInitData()`
- `AccountLoader.getVisibleAccountsList()`

Suggested equivalent SQL for PWA display:
```sql
SELECT account_id, name, amount, ac_order, ac_type_id, visible
FROM account
WHERE visible = 1
  AND ac_type_id NOT IN (1, 2)
ORDER BY ac_order ASC, LOWER(name) ASC;
```

## 4.2 Transfers-by-month behavior

Desktop default transfer base:
- current month
- month chosen via month list
- data source: transfer rows in chosen month range

Desktop sort:
- by date ascending, tie-break by transfer ID

Suggested SQL:
```sql
SELECT transfer_id, name, from_account, to_account, amount, transfer_type_id,
       category_1_id, category_2_id, category_3_id, date, buyplace
FROM transfer
WHERE date >= ? AND date <= ?
ORDER BY date ASC, transfer_id ASC;
```

## 4.3 Add transfer behavior (must match desktop semantics)

Desktop add action does:
1. Validate input.
2. Insert `transfer` row.
3. Update source account amount (`-amount`).
4. Update destination account amount (`+amount`).

References:
- `TransferCreatorController.handleAddTransferBTAction(...)`
- `TransferExecute.addTransfer(..., true)`
- `DBInserts.insertTransfer(...)`
- `AccountExecute.updateAccountAmount(...)`

### Validation rules used by desktop

Transfer name:
- length > 2

Transfer amount:
- amount > 0

Account combination:
- `from != to`
- `from != PRIMARY_SPENDINGS`
- `to != PRIMARY_INCOME`
- not `(from == PRIMARY_INCOME && to == PRIMARY_SPENDINGS)`

References:
- `FieldValidator.validateTransferName/Amount/Accounts`

### Transfer type determination

Use the same logic as desktop:
- if `to` is a primary account -> expense (`1`)
- else if `from` is a primary account -> earning (`2`)
- else internal (`3`)

### Recommended SQL transaction for PWA add-transfer

```sql
BEGIN IMMEDIATE TRANSACTION;

INSERT INTO transfer (
  name, from_account, to_account, amount, transfer_type_id,
  category_1_id, category_2_id, category_3_id, date, buyplace
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

UPDATE account SET amount = amount - ? WHERE account_id = ?;
UPDATE account SET amount = amount + ? WHERE account_id = ?;

COMMIT;
```

Rollback on any error.

---

## 5. OneDrive/PWA Relevant Operational Notes

- Desktop opens DB directly via JDBC path from `properties.txt` (`dbPath`).
- Desktop keeps DB connection open during runtime.
- Standing orders can auto-create transfers on desktop startup.

Implication:
- PWA and desktop should not be used concurrently on same DB file.
- The user rule ("do not use PWA while desktop open") is consistent with desktop behavior.

References:
- `Database.java`
- `Main.loadData()` + `StandingOrderExecute.performStandingOrderUpdates()`

---

## 6. Version Compatibility Gate

PWA should enforce strict DB model compatibility:

Check:
```sql
SELECT numeric_value
FROM constants
WHERE name = 'datamodel_version';
```

If table/row missing or value mismatch:
- Block app features.
- Show explicit unsupported-version message.

Reason:
- Desktop schema artifacts in repo are not fully consistent (see section 8).

---

## 7. Query Recipes Needed by PWA MVP

## 7.1 Load primary accounts

```sql
SELECT account_id, ac_type_id, name
FROM account
WHERE ac_type_id IN (1, 2);
```

Do not hardcode account IDs. Detect by `ac_type_id`.

## 7.2 Load account options for transfer form

Spending (`from`) options (desktop equivalent intent):
- visible accounts + primary income account

```sql
SELECT account_id, name, amount, ac_order, ac_type_id, visible
FROM account
WHERE visible = 1 OR ac_type_id = 1
ORDER BY CASE WHEN ac_type_id = 1 THEN 0 ELSE 1 END, ac_order ASC, LOWER(name) ASC;
```

Income (`to`) options:
- visible accounts + primary spendings account

```sql
SELECT account_id, name, amount, ac_order, ac_type_id, visible
FROM account
WHERE visible = 1 OR ac_type_id = 2
ORDER BY CASE WHEN ac_type_id = 2 THEN 0 ELSE 1 END, ac_order ASC, LOWER(name) ASC;
```

## 7.3 Load categories

```sql
SELECT category_id, name
FROM category
ORDER BY LOWER(name) ASC;
```

Desktop UI has "No category" sentinel (`EMPTY_CAT`) that is **not** a DB row; represent this client-side.

## 7.4 Month presence list

Desktop behavior:
- derives months from transfer dates
- ensures current month is present even if empty

Simple approach in PWA:
- query distinct dates from transfer
- map to first day of month in app logic
- add current month if absent

---

## 8. Inconsistencies and Caveats in This Repo

Important for safe PWA implementation:

1. Schema artifacts differ:
- `resources/conspectusDB.schema.sql` includes `constants` and category groups.
- `DBInitialization.java` does not create `constants` or category-group tables.
- `resources/DatabaseDDL.sql` has some old column names (example: `account_type.name` vs runtime usage `account_type_name`).

2. Table constants are not universally reliable:
- Example: `AccountTypeTable.TYPE_ID` is `account_type_id`, but runtime schema uses `ac_type_id`.
- Runtime loaders typically use `ac_type_id` from `AccountTable`.

Practical rule:
- Treat live DB schema as source of truth.
- Keep SQL in PWA minimal and explicit for required MVP operations.

---

## 9. UI/Locale Notes from Desktop

- Language resources currently found in repo: German (`resources/lang/conspectus_lang_de.properties`).
- Desktop color language:
  - base gray surfaces
  - positive green
  - negative red
  - cyan/teal highlights

Useful for PWA visual continuity.

---

## 10. Suggested PWA Parity Checklist

Use this checklist during PWA implementation/testing:

1. DB opens and `PRAGMA foreign_keys = ON` is set.
2. `datamodel_version` check enforced before feature screens.
3. Accounts screen shows visible non-primary accounts and balances in cents->currency conversion.
4. Transfers screen loads current month by default.
5. Month navigation uses inclusive month bounds.
6. Add transfer validation matches desktop rules.
7. Insert + account updates happen in one SQL transaction.
8. Transfer type is derived exactly as desktop.
9. Category null handling supports 0-3 categories.
10. Upload only after successful local DB commit and export.

---

## 11. Source File Map (Quick Reference)

Business logic and rules:
- `src/main/java/conspectus/data/FieldValidator.java`
- `src/main/java/conspectus/data/entity/Transfer.java`
- `src/main/java/conspectus/database/persistance/TransferExecute.java`
- `src/main/java/conspectus/database/persistance/AccountExecute.java`
- `src/main/java/conspectus/ui/implementation/pane/TransferCreatorController.java`

Load/query behavior:
- `src/main/java/conspectus/database/loader/TransferLoader.java`
- `src/main/java/conspectus/database/loader/AccountLoader.java`
- `src/main/java/conspectus/database/loader/CategoryLoader.java`

Schema references:
- `resources/conspectusDB.schema.sql`
- `src/main/java/conspectus/database/tables/*.java`
- `src/main/java/conspectus/database/DBInitialization.java`

Formatting and encoding:
- `src/main/java/tools/MoneyFormat.java`
- `src/main/java/tools/Formatters.java`

