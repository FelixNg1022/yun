import { env } from './env.ts'
import { createImessageClient, type InboundMessage } from './imessage.ts'
import { openDb, type Db, type UserRow } from './db.ts'
import { createLlm } from './llm.ts'
import { createRateLimiter } from './ratelimit.ts'
import { route } from './router.ts'
import { createScheduler } from './scheduler.ts'
import { computeBazi } from './divination/bazi.ts'
import { detectLang } from './lang.ts'

const DB_PATH = process.env.YUN_DB_PATH ?? './yun.db'

async function main(): Promise<void> {
  const ownerPhone = env.ownerPhone()
  const trusted = new Set(env.trustedPhones().map(normalize))
  const ownerBirth = env.ownerBirth()
  const anthropicKey = env.anthropicApiKey()
  const followUpDays = env.followUpDays()

  const db = openDb(DB_PATH)
  const llm = createLlm(anthropicKey)
  const client = createImessageClient({ debug: false })
  const limiter = createRateLimiter(5, 10_000)

  ensureOwnerUser(db, ownerPhone, ownerBirth)

  const onMessage = async (msg: InboundMessage): Promise<void> => {
    const sender = normalize(msg.sender)
    if (!trusted.has(sender)) {
      console.log(`[skip] untrusted sender: ${msg.sender}`)
      return
    }

    if (!limiter.check(msg.sender)) {
      await client.reply(msg.sender, 'slow down 🙏')
      return
    }

    console.log(`[${msg.receivedAt.toISOString()}] ${msg.sender}: ${msg.text}`)

    try {
      const reply = await route(
        { phone: msg.sender, text: msg.text, receivedAt: msg.receivedAt },
        {
          db,
          llm,
          followUpDays,
          ensureUser: (phone) => ensureOwnerUser(db, phone, ownerBirth),
        },
      )
      await client.reply(msg.sender, reply)
    } catch (err: unknown) {
      console.error('[route] error:', err)
      await client.reply(msg.sender, apologize(err))
    }
  }

  await client.watch(onMessage)

  const intervalMs = env.schedulerIntervalSeconds() * 1000
  const scheduler = createScheduler({
    db,
    reply: client.reply,
    intervalMs,
    followUpDays,
  })
  scheduler.start()

  console.log(
    `运 online. Owner: ${ownerPhone}. DB: ${DB_PATH}. Scheduler: ${intervalMs / 1000}s. Ready.`,
  )

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} received, shutting down…`)
    scheduler.stop()
    await client.shutdown()
    db.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

function ensureOwnerUser(db: Db, phone: string, birthIso: string): UserRow {
  const existing = db.getUser(phone)
  if (existing) return existing
  const bazi = computeBazi(birthIso)
  const lang = detectLang('')
  db.upsertUser({
    phone,
    name: null,
    birth_iso: birthIso,
    birth_lat: null,
    birth_lon: null,
    bazi_json: JSON.stringify(bazi),
    preferred_lang: lang,
  })
  const created = db.getUser(phone)
  if (!created) throw new Error(`Failed to create user for ${phone}`)
  return created
}

function normalize(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}

function apologize(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return `hm. something went wrong reading your question: ${msg}`
}

main().catch((err: unknown) => {
  console.error('fatal:', err)
  process.exit(1)
})
