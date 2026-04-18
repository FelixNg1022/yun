import { Database } from 'bun:sqlite'

export type Lang = 'en' | 'zh'
export type Method = 'meihua' | 'liuren' | 'iching_manual'
export type Outcome = 1 | 0 | -1

export interface UserRow {
  phone: string
  name: string | null
  birth_iso: string | null
  birth_lat: number | null
  birth_lon: number | null
  bazi_json: string | null
  preferred_lang: Lang
  created_at: number
}

export interface ReadingRow {
  id: number
  phone: string
  question: string
  method: Method
  kernel_json: string
  interpretation: string
  lang: Lang
  cast_at: number
  follow_up_at: number | null
  followed_up: 0 | 1
}

export interface OutcomeRow {
  reading_id: number
  played_out: Outcome | null
  user_note: string | null
  recorded_at: number
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  phone TEXT PRIMARY KEY,
  name TEXT,
  birth_iso TEXT,
  birth_lat REAL,
  birth_lon REAL,
  bazi_json TEXT,
  preferred_lang TEXT NOT NULL DEFAULT 'en',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  question TEXT NOT NULL,
  method TEXT NOT NULL,
  kernel_json TEXT NOT NULL,
  interpretation TEXT NOT NULL,
  lang TEXT NOT NULL,
  cast_at INTEGER NOT NULL,
  follow_up_at INTEGER,
  followed_up INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS outcomes (
  reading_id INTEGER PRIMARY KEY,
  played_out INTEGER,
  user_note TEXT,
  recorded_at INTEGER NOT NULL,
  FOREIGN KEY(reading_id) REFERENCES readings(id)
);

CREATE INDEX IF NOT EXISTS idx_readings_phone_followup
  ON readings(phone, follow_up_at, followed_up);

CREATE INDEX IF NOT EXISTS idx_readings_phone_cast
  ON readings(phone, cast_at DESC);
`

export interface Db {
  raw: Database
  getUser: (phone: string) => UserRow | null
  upsertUser: (user: Omit<UserRow, 'created_at'> & { created_at?: number }) => void
  setUserLang: (phone: string, lang: Lang) => void
  setUserBirth: (
    phone: string,
    data: { name: string | null; birth_iso: string; bazi_json: string },
  ) => void
  recordReading: (r: Omit<ReadingRow, 'id' | 'followed_up'>) => number
  getRecentReadings: (phone: string, limit: number) => ReadingRow[]
  getPendingFollowUps: (now: number) => ReadingRow[]
  markFollowedUp: (readingId: number) => void
  getMostRecentPendingOutcome: (phone: string, within_ms: number) => ReadingRow | null
  recordOutcome: (r: OutcomeRow) => void
  getStats: (phone: string) => { total: number; with_outcome: number; yes: number; no: number; mixed: number }
  close: () => void
}

export function openDb(path: string): Db {
  const raw = new Database(path)
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  raw.exec(SCHEMA)

  const getUserStmt = raw.query<UserRow, { $phone: string }>(
    'SELECT * FROM users WHERE phone = $phone',
  )
  const upsertUserStmt = raw.query<
    void,
    {
      $phone: string
      $name: string | null
      $birth_iso: string | null
      $birth_lat: number | null
      $birth_lon: number | null
      $bazi_json: string | null
      $preferred_lang: Lang
      $created_at: number
    }
  >(`
    INSERT INTO users(phone, name, birth_iso, birth_lat, birth_lon, bazi_json, preferred_lang, created_at)
    VALUES ($phone, $name, $birth_iso, $birth_lat, $birth_lon, $bazi_json, $preferred_lang, $created_at)
    ON CONFLICT(phone) DO UPDATE SET
      name = excluded.name,
      birth_iso = excluded.birth_iso,
      birth_lat = excluded.birth_lat,
      birth_lon = excluded.birth_lon,
      bazi_json = excluded.bazi_json,
      preferred_lang = excluded.preferred_lang
  `)
  const setUserLangStmt = raw.query<void, { $phone: string; $lang: Lang }>(
    'UPDATE users SET preferred_lang = $lang WHERE phone = $phone',
  )
  const setUserBirthStmt = raw.query<
    void,
    { $phone: string; $name: string | null; $birth_iso: string; $bazi_json: string }
  >(
    'UPDATE users SET name = $name, birth_iso = $birth_iso, bazi_json = $bazi_json WHERE phone = $phone',
  )

  const insertReadingStmt = raw.query<
    void,
    {
      $phone: string
      $question: string
      $method: Method
      $kernel_json: string
      $interpretation: string
      $lang: Lang
      $cast_at: number
      $follow_up_at: number | null
    }
  >(`
    INSERT INTO readings(phone, question, method, kernel_json, interpretation, lang, cast_at, follow_up_at)
    VALUES ($phone, $question, $method, $kernel_json, $interpretation, $lang, $cast_at, $follow_up_at)
  `)

  const recentReadingsStmt = raw.query<
    ReadingRow,
    { $phone: string; $limit: number }
  >(
    'SELECT * FROM readings WHERE phone = $phone ORDER BY cast_at DESC LIMIT $limit',
  )

  const pendingFollowUpsStmt = raw.query<ReadingRow, { $now: number }>(
    'SELECT * FROM readings WHERE follow_up_at IS NOT NULL AND follow_up_at <= $now AND followed_up = 0',
  )

  const markFollowedUpStmt = raw.query<void, { $id: number }>(
    'UPDATE readings SET followed_up = 1 WHERE id = $id',
  )

  const mostRecentPendingOutcomeStmt = raw.query<
    ReadingRow,
    { $phone: string; $since: number }
  >(`
    SELECT r.* FROM readings r
    LEFT JOIN outcomes o ON o.reading_id = r.id
    WHERE r.phone = $phone
      AND r.followed_up = 1
      AND r.follow_up_at >= $since
      AND o.reading_id IS NULL
    ORDER BY r.follow_up_at DESC
    LIMIT 1
  `)

  const insertOutcomeStmt = raw.query<
    void,
    {
      $reading_id: number
      $played_out: Outcome | null
      $user_note: string | null
      $recorded_at: number
    }
  >(`
    INSERT INTO outcomes(reading_id, played_out, user_note, recorded_at)
    VALUES ($reading_id, $played_out, $user_note, $recorded_at)
    ON CONFLICT(reading_id) DO UPDATE SET
      played_out = excluded.played_out,
      user_note = excluded.user_note,
      recorded_at = excluded.recorded_at
  `)

  const statsStmt = raw.query<
    { total: number; with_outcome: number; yes: number; no: number; mixed: number },
    { $phone: string }
  >(`
    SELECT
      COUNT(r.id) AS total,
      COUNT(o.reading_id) AS with_outcome,
      COALESCE(SUM(CASE WHEN o.played_out = 1 THEN 1 ELSE 0 END), 0) AS yes,
      COALESCE(SUM(CASE WHEN o.played_out = 0 THEN 1 ELSE 0 END), 0) AS no,
      COALESCE(SUM(CASE WHEN o.played_out = -1 THEN 1 ELSE 0 END), 0) AS mixed
    FROM readings r
    LEFT JOIN outcomes o ON o.reading_id = r.id
    WHERE r.phone = $phone
  `)

  return {
    raw,
    getUser: (phone) => getUserStmt.get({ $phone: phone }),
    upsertUser: (u) =>
      upsertUserStmt.run({
        $phone: u.phone,
        $name: u.name,
        $birth_iso: u.birth_iso,
        $birth_lat: u.birth_lat,
        $birth_lon: u.birth_lon,
        $bazi_json: u.bazi_json,
        $preferred_lang: u.preferred_lang,
        $created_at: u.created_at ?? Date.now(),
      }),
    setUserLang: (phone, lang) => setUserLangStmt.run({ $phone: phone, $lang: lang }),
    setUserBirth: (phone, data) =>
      setUserBirthStmt.run({
        $phone: phone,
        $name: data.name,
        $birth_iso: data.birth_iso,
        $bazi_json: data.bazi_json,
      }),
    recordReading: (r) => {
      insertReadingStmt.run({
        $phone: r.phone,
        $question: r.question,
        $method: r.method,
        $kernel_json: r.kernel_json,
        $interpretation: r.interpretation,
        $lang: r.lang,
        $cast_at: r.cast_at,
        $follow_up_at: r.follow_up_at,
      })
      const row = raw.query<{ id: number }, []>('SELECT last_insert_rowid() AS id').get()
      return row?.id ?? 0
    },
    getRecentReadings: (phone, limit) =>
      recentReadingsStmt.all({ $phone: phone, $limit: limit }),
    getPendingFollowUps: (now) => pendingFollowUpsStmt.all({ $now: now }),
    markFollowedUp: (id) => markFollowedUpStmt.run({ $id: id }),
    getMostRecentPendingOutcome: (phone, within_ms) =>
      mostRecentPendingOutcomeStmt.get({
        $phone: phone,
        $since: Date.now() - within_ms,
      }),
    recordOutcome: (o) =>
      insertOutcomeStmt.run({
        $reading_id: o.reading_id,
        $played_out: o.played_out,
        $user_note: o.user_note,
        $recorded_at: o.recorded_at,
      }),
    getStats: (phone) => {
      const row = statsStmt.get({ $phone: phone })
      return row ?? { total: 0, with_outcome: 0, yes: 0, no: 0, mixed: 0 }
    },
    close: () => raw.close(),
  }
}
