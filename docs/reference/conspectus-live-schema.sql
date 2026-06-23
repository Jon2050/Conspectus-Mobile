-- Reference SQLite schema snapshot for Conspectus-Mobile PWA SQL validation.
-- Source command: SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name;
-- Source database for this repository snapshot: tests/fixtures/test.db.
-- Captured for issue M5-09 on 2026-06-23.

CREATE TABLE account (
    account_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    ac_order INTEGER NOT NULL,
    ac_type_id INTEGER,
    visible BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (ac_type_id) REFERENCES account_type(ac_type_id)
  );

CREATE TABLE account_type (
    ac_type_id INTEGER PRIMARY KEY,
    account_type_name TEXT NOT NULL
  );

CREATE TABLE category (
    category_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  );

CREATE TABLE transfer (
    transfer_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    from_account INTEGER NOT NULL,
    to_account INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    transfer_type_id INTEGER NOT NULL,
    category_1_id INTEGER,
    category_2_id INTEGER,
    category_3_id INTEGER,
    date INTEGER NOT NULL,
    buyplace TEXT,
    FOREIGN KEY (from_account) REFERENCES account(account_id),
    FOREIGN KEY (to_account) REFERENCES account(account_id),
    FOREIGN KEY (transfer_type_id) REFERENCES transfer_type(transfer_type_id),
    FOREIGN KEY (category_1_id) REFERENCES category(category_id),
    FOREIGN KEY (category_2_id) REFERENCES category(category_id),
    FOREIGN KEY (category_3_id) REFERENCES category(category_id)
  );

CREATE TABLE transfer_type (
    transfer_type_id INTEGER PRIMARY KEY,
    transfer_type_name TEXT NOT NULL
  );
