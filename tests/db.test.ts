import { describe, expect, test } from 'bun:test'
import { openDb } from '../src/db.ts'

function freshDb() {
  return openDb(':memory:')
}

describe('db — users', () => {
  test('getUser returns null for unknown phone', () => {
    const db = freshDb()
    expect(db.getUser('+10000000000')).toBeNull()
    db.close()
  })

  test('upsertUser creates then updates', () => {
    const db = freshDb()
    const now = Date.now()
    db.upsertUser({
      phone: '+16045551234',
      name: null,
      birth_iso: '2002-10-22T18:00:00+08:00',
      birth_lat: null,
      birth_lon: null,
      bazi_json: '{"year":"壬午"}',
      preferred_lang: 'en',
      created_at: now,
    })
    const row = db.getUser('+16045551234')
    expect(row?.preferred_lang).toBe('en')

    db.setUserLang('+16045551234', 'zh')
    expect(db.getUser('+16045551234')?.preferred_lang).toBe('zh')
    db.close()
  })
})

describe('db — readings + outcomes', () => {
  const phone = '+16045551234'

  function seeded() {
    const db = freshDb()
    db.upsertUser({
      phone,
      name: null,
      birth_iso: null,
      birth_lat: null,
      birth_lon: null,
      bazi_json: null,
      preferred_lang: 'en',
    })
    return db
  }

  test('recordReading returns id, getRecentReadings returns it', () => {
    const db = seeded()
    const id = db.recordReading({
      phone,
      question: 'test q',
      method: 'meihua',
      kernel_json: '{}',
      interpretation: 'interp',
      lang: 'en',
      cast_at: 1000,
      follow_up_at: 2000,
    })
    expect(id).toBeGreaterThan(0)

    const recent = db.getRecentReadings(phone, 5)
    expect(recent).toHaveLength(1)
    expect(recent[0]?.question).toBe('test q')
    db.close()
  })

  test('getPendingFollowUps picks readings whose follow_up_at has passed and not yet followed up', () => {
    const db = seeded()
    const past = Date.now() - 10_000
    const future = Date.now() + 10_000
    const idPast = db.recordReading({
      phone,
      question: 'past',
      method: 'meihua',
      kernel_json: '{}',
      interpretation: '',
      lang: 'en',
      cast_at: past,
      follow_up_at: past + 1,
    })
    db.recordReading({
      phone,
      question: 'future',
      method: 'meihua',
      kernel_json: '{}',
      interpretation: '',
      lang: 'en',
      cast_at: past,
      follow_up_at: future,
    })

    const pending = db.getPendingFollowUps(Date.now())
    expect(pending.map((p) => p.id)).toEqual([idPast])

    db.markFollowedUp(idPast)
    expect(db.getPendingFollowUps(Date.now())).toHaveLength(0)
    db.close()
  })

  test('getMostRecentPendingOutcome returns only followed-up readings without an outcome', () => {
    const db = seeded()
    const now = Date.now()
    const followedUpNoOutcome = db.recordReading({
      phone,
      question: 'q1',
      method: 'meihua',
      kernel_json: '{}',
      interpretation: '',
      lang: 'en',
      cast_at: now - 7 * 24 * 3600 * 1000,
      follow_up_at: now - 1 * 60 * 60 * 1000, // 1h ago
    })
    db.markFollowedUp(followedUpNoOutcome)

    const latest = db.getMostRecentPendingOutcome(phone, 48 * 60 * 60 * 1000)
    expect(latest?.id).toBe(followedUpNoOutcome)

    db.recordOutcome({
      reading_id: followedUpNoOutcome,
      played_out: 1,
      user_note: null,
      recorded_at: now,
    })
    expect(db.getMostRecentPendingOutcome(phone, 48 * 60 * 60 * 1000)).toBeNull()
    db.close()
  })

  test('getStats aggregates counts and hit rate inputs', () => {
    const db = seeded()
    const now = Date.now()
    const ids = [0, 1, 2, 3].map((i) =>
      db.recordReading({
        phone,
        question: `q${i}`,
        method: 'meihua',
        kernel_json: '{}',
        interpretation: '',
        lang: 'en',
        cast_at: now - i * 1000,
        follow_up_at: now,
      }),
    )
    db.markFollowedUp(ids[0]!)
    db.markFollowedUp(ids[1]!)
    db.markFollowedUp(ids[2]!)
    db.recordOutcome({ reading_id: ids[0]!, played_out: 1, user_note: null, recorded_at: now })
    db.recordOutcome({ reading_id: ids[1]!, played_out: 0, user_note: null, recorded_at: now })
    db.recordOutcome({ reading_id: ids[2]!, played_out: -1, user_note: null, recorded_at: now })

    const stats = db.getStats(phone)
    expect(stats.total).toBe(4)
    expect(stats.with_outcome).toBe(3)
    expect(stats.yes).toBe(1)
    expect(stats.no).toBe(1)
    expect(stats.mixed).toBe(1)
    db.close()
  })
})
