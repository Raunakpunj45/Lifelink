const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DB_FILE || path.join(__dirname, 'lifelink.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS donors (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL UNIQUE,
  email         TEXT,
  age           INTEGER NOT NULL CHECK (age BETWEEN 18 AND 65),
  gender        TEXT NOT NULL CHECK (gender IN ('Male','Female','Other')),
  blood_group   TEXT NOT NULL CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  city          TEXT NOT NULL,
  area          TEXT,
  last_donation TEXT,
  available     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_name TEXT NOT NULL,
  blood_group  TEXT NOT NULL CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  units        INTEGER NOT NULL CHECK (units BETWEEN 1 AND 10),
  hospital     TEXT NOT NULL,
  city         TEXT NOT NULL,
  contact      TEXT NOT NULL,
  urgency      TEXT NOT NULL CHECK (urgency IN ('Normal','Urgent','Critical')),
  status       TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Fulfilled','Cancelled')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_donor_search ON donors(city, blood_group);
CREATE INDEX IF NOT EXISTS idx_req_status ON requests(status);
`);

module.exports = db;
