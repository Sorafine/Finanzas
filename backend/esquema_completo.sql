-- Esquema FinanzasApp SQLite
PRAGMA foreign_keys=ON;
BEGIN TRANSACTION;
CREATE TABLE accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                kind TEXT NOT NULL CHECK(kind IN ('bank','cash','wallet')),
                balance_cents INTEGER NOT NULL DEFAULT 0
            );
INSERT INTO "accounts" VALUES(1,'Mi banco','bank',0);
INSERT INTO "accounts" VALUES(2,'Mi efectivo','cash',0);
CREATE TABLE calendar_events (scheduled_id INTEGER PRIMARY KEY REFERENCES scheduled_payments(id),event_id TEXT NOT NULL);
CREATE TABLE cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL REFERENCES accounts(id),
            name TEXT NOT NULL,
            card_type TEXT NOT NULL CHECK(card_type IN ('debit','credit')),
            last_four TEXT NOT NULL CHECK(length(last_four)=4),
            brand TEXT NOT NULL DEFAULT 'Otra',
            credit_limit_cents INTEGER NOT NULL DEFAULT 0,
            debt_cents INTEGER NOT NULL DEFAULT 0,
            closing_day INTEGER,
            due_day INTEGER
        );
CREATE TABLE gmail_reviews (gmail_id TEXT PRIMARY KEY,status TEXT NOT NULL CHECK(status IN ('dismissed','reviewed')));
CREATE TABLE movements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL CHECK(kind IN ('income','expense','withdrawal')),
                amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
                concept TEXT NOT NULL,
                account_id INTEGER NOT NULL REFERENCES accounts(id),
                destination_id INTEGER REFERENCES accounts(id),
                fee_cents INTEGER NOT NULL DEFAULT 0,
                frequency TEXT,
                classification TEXT,
                category TEXT,
                created_at TEXT NOT NULL
            );
CREATE TABLE savings_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            target_cents INTEGER NOT NULL CHECK(target_cents > 0),
            saved_cents INTEGER NOT NULL DEFAULT 0 CHECK(saved_cents >= 0),
            target_date TEXT,
            created_at TEXT NOT NULL
        );
CREATE TABLE scheduled_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
            due_date TEXT NOT NULL,
            frequency TEXT NOT NULL CHECK(frequency IN ('once','weekly','monthly','yearly')),
            account_id INTEGER NOT NULL REFERENCES accounts(id),
            category TEXT NOT NULL DEFAULT 'Otros',
            active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
            created_at TEXT NOT NULL
        );
CREATE INDEX idx_movements_date ON movements(created_at);
CREATE INDEX idx_movements_category ON movements(category);
CREATE INDEX idx_movements_account ON movements(account_id);
DELETE FROM "sqlite_sequence";
INSERT INTO "sqlite_sequence" VALUES('accounts',2);
COMMIT;
