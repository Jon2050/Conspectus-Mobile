-- Reference SQLite schema snapshot for Conspectus-Mobile PWA SQL validation.
-- Source command: SELECT sql FROM sqlite_master WHERE sql IS NOT NULL;
-- Source database for this repository snapshot: local private tests/fixtures/conspectusDB.db.
-- The source database is ignored by Git; this SQL snapshot is the tracked repository reference.
-- Captured for issue M5-09 on 2026-06-23.

CREATE TABLE account (
    account_id INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL
                       DEFAULT 'default_name',
    amount     INTEGER NOT NULL
                       DEFAULT (0),
    ac_order   INTEGER NOT NULL
                       DEFAULT (0),
    ac_type_id INTEGER REFERENCES account_type (ac_type_id),
    visible    BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (
        ac_type_id
    )
    REFERENCES account_type (ac_type_id) ON DELETE NO ACTION
                                         ON UPDATE NO ACTION
);

CREATE TABLE account__account_group (
    account_id       INTEGER REFERENCES account (account_id) ON DELETE CASCADE
                                                             ON UPDATE CASCADE,
    account_group_id INTEGER REFERENCES account_group (account_group_id) ON DELETE CASCADE
                                                                         ON UPDATE CASCADE,
    PRIMARY KEY (
        account_id,
        account_group_id
    )
);

CREATE TABLE account_group (
    account_group_id INTEGER PRIMARY KEY,
    group_name       TEXT
);

CREATE TABLE account_type (ac_type_id INTEGER PRIMARY KEY ,account_type_name       TEXT);

CREATE TABLE category (category_id   INTEGER  PRIMARY KEY,name          TEXT     UNIQUE NOT NULL);

CREATE TABLE category__category_group (
    category_id       INTEGER REFERENCES category (category_id) ON DELETE CASCADE
                                                             ON UPDATE CASCADE,
    category_group_id INTEGER REFERENCES category_group (category_group_id) ON DELETE CASCADE
                                                                         ON UPDATE CASCADE,
    PRIMARY KEY (
        category_id,
        category_group_id
    )
);

CREATE TABLE category_group (
    category_group_id INTEGER PRIMARY KEY,
    group_name       TEXT
);

CREATE TABLE standing_order (
    standing_order_id   INTEGER PRIMARY KEY,
    timespan_type       INTEGER,
    timespan_number     INTEGER,
    standing_order_name TEXT,
    start_date          INTEGER,
    last_update         INTEGER,
    is_active           BOOLEAN,
    order_amount        INTEGER,
    transfer_names      TEXT,
    category_1_id       INTEGER REFERENCES category (category_id),
    category_2_id       INTEGER REFERENCES category (category_id),
    category_3_id       INTEGER REFERENCES category (category_id),
    from_account        INTEGER REFERENCES account (account_id),
    to_account          INTEGER REFERENCES account (account_id),
    amount              INTEGER,
    buyplace            TEXT
);

CREATE TABLE standing_order__transfer (standing_order_id INTEGER REFERENCES standing_order (standing_order_id) ON DELETE CASCADE, transfer_id INTEGER UNIQUE REFERENCES transfer (transfer_id) ON DELETE CASCADE, PRIMARY KEY (standing_order_id, transfer_id));

CREATE TABLE transfer(transfer_id       INTEGER     PRIMARY KEY,          name              TEXT                     NOT NULL,from_account      INTEGER,to_account        INTEGER,amount            INTEGER,transfer_type_id  INTEGER,category_1_id     INTEGER,category_2_id     INTEGER,category_3_id     INTEGER,date              INTEGER,buyplace          TEXT   ,FOREIGN KEY (from_account)     REFERENCES account(account_id)             ON DELETE NO ACTION ON UPDATE NO ACTION,FOREIGN KEY (to_account)       REFERENCES account(account_id)             ON DELETE NO ACTION ON UPDATE NO ACTION,FOREIGN KEY (transfer_type_id) REFERENCES transfer_type(transfer_type_id) ON DELETE NO ACTION ON UPDATE NO ACTION,FOREIGN KEY (category_1_id)    REFERENCES category(category_id)           ON DELETE NO ACTION ON UPDATE NO ACTION,FOREIGN KEY (category_2_id)    REFERENCES category(category_id)           ON DELETE NO ACTION ON UPDATE NO ACTION,FOREIGN KEY (category_3_id)    REFERENCES category(category_id)           ON DELETE NO ACTION ON UPDATE NO ACTION);

CREATE TABLE transfer_type (transfer_type_id INTEGER PRIMARY KEY,transfer_type_name             TEXT);

CREATE INDEX transfer_date_idx ON transfer (date ASC);
