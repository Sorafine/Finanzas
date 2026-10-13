-- Compatible con SQLite3. FastAPI ejecuta este esquema automáticamente.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS gmail_reviews (
  gmail_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('dismissed','reviewed'))
);
CREATE TABLE IF NOT EXISTS calendar_events (
  scheduled_id INTEGER PRIMARY KEY REFERENCES scheduled_payments(id),
  event_id TEXT NOT NULL
);
