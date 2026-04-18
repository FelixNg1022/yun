import { describe, expect, test } from 'bun:test'
import { openDb } from '../src/db.ts'
import { handleCommand } from '../src/commands.ts'
import type { UserRow } from '../src/db.ts'

function seed(lang: 'en' | 'zh' = 'en'): { db: ReturnType<typeof openDb>; user: UserRow } {
  const db = openDb(':memory:')
  db.upsertUser({
    phone: '+10000000000',
    name: null,
    birth_iso: null,
    birth_lat: null,
    birth_lon: null,
    bazi_json: null,
    preferred_lang: lang,
  })
  const user = db.getUser('+10000000000')!
  return { db, user }
}

describe('/help', () => {
  test('English help mentions all commands', () => {
    const { db, user } = seed('en')
    const out = handleCommand('/help', user, { db })
    expect(out).toContain('/help')
    expect(out).toContain('/history')
    expect(out).toContain('/stats')
    expect(out).toContain('/methods')
    expect(out).toContain('/lang')
    expect(out).toContain('/setup')
    db.close()
  })

  test('Chinese help when preferred_lang=zh', () => {
    const { db, user } = seed('zh')
    const out = handleCommand('/help', user, { db })
    expect(out).toContain('命令一览')
    db.close()
  })
})

describe('/lang', () => {
  test('switches preferred language and persists', () => {
    const { db, user } = seed('en')
    const out = handleCommand('/lang zh', user, { db })
    expect(out).toBe('已切换为中文。')
    expect(db.getUser(user.phone)?.preferred_lang).toBe('zh')
    db.close()
  })

  test('rejects invalid args', () => {
    const { db, user } = seed('en')
    expect(handleCommand('/lang fr', user, { db })).toMatch(/usage/i)
    expect(db.getUser(user.phone)?.preferred_lang).toBe('en')
    db.close()
  })
})

describe('/setup', () => {
  test('accepts ISO and stores 八字', () => {
    const { db, user } = seed('en')
    const out = handleCommand('/setup 2002-10-22T18:00:00+08:00', user, { db })
    expect(out).toContain('壬午')
    expect(out).toContain('癸亥')
    const row = db.getUser(user.phone)!
    expect(row.birth_iso).toBe('2002-10-22T18:00:00+08:00')
    expect(row.bazi_json).toBeTruthy()
    db.close()
  })

  test('rejects invalid ISO', () => {
    const { db, user } = seed('en')
    const out = handleCommand('/setup nonsense', user, { db })
    expect(out).toMatch(/could not parse|updated/i)
    // should be the error path, not updated path
    expect(out).not.toContain('壬午')
    db.close()
  })
})

describe('/history and /stats', () => {
  test('empty states', () => {
    const { db, user } = seed('en')
    expect(handleCommand('/history', user, { db })).toMatch(/no readings/i)
    expect(handleCommand('/stats', user, { db })).toMatch(/no readings/i)
    db.close()
  })

  test('history renders stored readings with hexagram shorthand', () => {
    const { db, user } = seed('en')
    db.recordReading({
      phone: user.phone,
      question: 'test q',
      method: 'meihua',
      kernel_json: JSON.stringify({
        method: 'meihua',
        primary: { name_zh: '恆' },
        changed: { name_zh: '解' },
      }),
      interpretation: '',
      lang: 'en',
      cast_at: Date.now(),
      follow_up_at: null,
    })
    const out = handleCommand('/history', user, { db })
    expect(out).toContain('恆→解')
    expect(out).toContain('test q')
    db.close()
  })

  test('stats computes hit rate from recorded outcomes', () => {
    const { db, user } = seed('en')
    const now = Date.now()
    const ids = [0, 1, 2].map((i) =>
      db.recordReading({
        phone: user.phone,
        question: `q${i}`,
        method: 'meihua',
        kernel_json: '{}',
        interpretation: '',
        lang: 'en',
        cast_at: now - i * 1000,
        follow_up_at: now,
      }),
    )
    for (const id of ids) db.markFollowedUp(id)
    db.recordOutcome({ reading_id: ids[0]!, played_out: 1, user_note: null, recorded_at: now })
    db.recordOutcome({ reading_id: ids[1]!, played_out: 0, user_note: null, recorded_at: now })
    // ids[2] has no outcome

    const out = handleCommand('/stats', user, { db })
    expect(out).toContain('total readings: 3')
    expect(out).toContain('with outcome: 2 / 3')
    expect(out).toContain('50%')
    db.close()
  })
})

describe('/methods and unknown', () => {
  test('/methods describes all three', () => {
    const { db, user } = seed('en')
    const out = handleCommand('/methods', user, { db })
    expect(out).toContain('梅花易数')
    expect(out).toContain('小六壬')
    expect(out).toContain('八字')
    db.close()
  })

  test('unknown command points to /help', () => {
    const { db, user } = seed('en')
    const out = handleCommand('/nonsense', user, { db })
    expect(out).toContain('/help')
    db.close()
  })
})
