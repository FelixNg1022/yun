import type { Db, Lang } from './db.ts'

export interface Scheduler {
  start: () => void
  stop: () => void
  tick: () => Promise<void>
}

export interface SchedulerDeps {
  db: Db
  reply: (phone: string, text: string) => Promise<void>
  intervalMs: number
  followUpDays: number
}

export function createScheduler(deps: SchedulerDeps): Scheduler {
  const { db, reply, intervalMs, followUpDays } = deps
  let handle: ReturnType<typeof setInterval> | null = null

  const tick = async (): Promise<void> => {
    const now = Date.now()
    const pending = db.getPendingFollowUps(now)
    for (const reading of pending) {
      const user = db.getUser(reading.phone)
      const lang: Lang = user?.preferred_lang ?? reading.lang
      const dm = buildFollowUpDm(reading.question, lang, followUpDays)
      try {
        await reply(reading.phone, dm)
        db.markFollowedUp(reading.id)
      } catch (err: unknown) {
        console.error(`[scheduler] failed to DM reading ${reading.id}:`, err)
      }
    }
  }

  return {
    tick,
    start: () => {
      if (handle) return
      handle = setInterval(() => {
        void tick().catch((err) => console.error('[scheduler] tick error:', err))
      }, intervalMs)
    },
    stop: () => {
      if (handle) {
        clearInterval(handle)
        handle = null
      }
    },
  }
}

export function buildFollowUpDm(question: string, lang: Lang, days: number): string {
  const q = question.length > 80 ? question.slice(0, 77) + '…' : question
  if (lang === 'zh') {
    return `${days} 天前你问：「${q}」——后来怎么样？回 yes / no / mixed（可加一句备注）。`
  }
  return `${days} days ago you asked: "${q}" — how did it play out? reply: yes / no / mixed (feel free to add a note).`
}
