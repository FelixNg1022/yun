import { describe, expect, test } from 'bun:test'
import { openDb } from '../src/db.ts'
import { buildFollowUpDm, createScheduler } from '../src/scheduler.ts'

function seededDb() {
  const db = openDb(':memory:')
  db.upsertUser({
    phone: '+10000000000',
    name: null,
    birth_iso: null,
    birth_lat: null,
    birth_lon: null,
    bazi_json: null,
    preferred_lang: 'en',
  })
  return db
}

describe('buildFollowUpDm', () => {
  test('English phrasing includes the days and quoted question', () => {
    const dm = buildFollowUpDm('should I take the offer?', 'en', 5)
    expect(dm).toContain('5 days ago you asked')
    expect(dm).toContain('should I take the offer?')
    expect(dm.toLowerCase()).toContain('yes')
    expect(dm.toLowerCase()).toContain('mixed')
  })

  test('Chinese phrasing uses 天', () => {
    const dm = buildFollowUpDm('我该搬去纽约吗？', 'zh', 5)
    expect(dm).toContain('5 天前')
    expect(dm).toContain('我该搬去纽约吗？')
  })

  test('very long questions are truncated', () => {
    const long = 'x'.repeat(500)
    const dm = buildFollowUpDm(long, 'en', 5)
    expect(dm.length).toBeLessThan(200)
    expect(dm).toContain('…')
  })
})

describe('scheduler tick', () => {
  test('picks readings whose follow_up_at has passed, DMs them, marks followed_up', async () => {
    const db = seededDb()
    const phone = '+10000000000'
    const past = Date.now() - 1000
    const future = Date.now() + 60_000

    const pastId = db.recordReading({
      phone,
      question: 'past one',
      method: 'meihua',
      kernel_json: '{}',
      interpretation: '',
      lang: 'en',
      cast_at: past - 100,
      follow_up_at: past,
    })
    const futureId = db.recordReading({
      phone,
      question: 'future one',
      method: 'meihua',
      kernel_json: '{}',
      interpretation: '',
      lang: 'en',
      cast_at: past - 100,
      follow_up_at: future,
    })

    const sent: Array<{ phone: string; text: string }> = []
    const scheduler = createScheduler({
      db,
      reply: async (p, t) => {
        sent.push({ phone: p, text: t })
      },
      intervalMs: 60_000,
      followUpDays: 5,
    })
    await scheduler.tick()

    expect(sent).toHaveLength(1)
    expect(sent[0]!.phone).toBe(phone)
    expect(sent[0]!.text).toContain('past one')

    // past reading now marked followed_up; future one untouched
    const stillPending = db.getPendingFollowUps(Date.now())
    expect(stillPending.map((r) => r.id)).toEqual([])
    const futureRow = db.getRecentReadings(phone, 10).find((r) => r.id === futureId)
    expect(futureRow?.followed_up).toBe(0)
    expect(db.getRecentReadings(phone, 10).find((r) => r.id === pastId)?.followed_up).toBe(1)
    db.close()
  })

  test('reply failure does not mark followed_up (retry next tick)', async () => {
    const db = seededDb()
    const phone = '+10000000000'
    const past = Date.now() - 1000
    const id = db.recordReading({
      phone,
      question: 'q',
      method: 'meihua',
      kernel_json: '{}',
      interpretation: '',
      lang: 'en',
      cast_at: past - 100,
      follow_up_at: past,
    })

    const scheduler = createScheduler({
      db,
      reply: async () => {
        throw new Error('send failure')
      },
      intervalMs: 60_000,
      followUpDays: 5,
    })
    await scheduler.tick()

    expect(db.getRecentReadings(phone, 10).find((r) => r.id === id)?.followed_up).toBe(0)
    expect(db.getPendingFollowUps(Date.now())).toHaveLength(1)
    db.close()
  })

  test('uses the user preferred_lang for the DM, not the reading lang', async () => {
    const db = seededDb()
    db.setUserLang('+10000000000', 'zh')
    const phone = '+10000000000'
    const past = Date.now() - 1000

    db.recordReading({
      phone,
      question: 'question',
      method: 'meihua',
      kernel_json: '{}',
      interpretation: '',
      lang: 'en', // reading was in English; user has since switched to zh
      cast_at: past - 100,
      follow_up_at: past,
    })

    const sent: string[] = []
    const scheduler = createScheduler({
      db,
      reply: async (_, t) => {
        sent.push(t)
      },
      intervalMs: 60_000,
      followUpDays: 5,
    })
    await scheduler.tick()

    expect(sent[0]!).toContain('天前')
    db.close()
  })
})
