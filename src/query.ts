import type { Db, Lang, Method, UserRow } from './db.ts'
import { castMeihua } from './divination/meihua.ts'
import { castLiuren } from './divination/liuren.ts'
import type { LlmClient } from './llm.ts'
import { detectLang } from './lang.ts'
import { formatLiurenHeader, formatMeihuaHeader, formatReply } from './format.ts'

const LIUREN_TRIGGERS = ['小六壬', '六壬', 'liuren', 'xiaoliuren']

const FOLLOW_UP_NOTE: Record<Lang, string> = {
  en: "(reply 'yes', 'no', or 'mixed' in a few days when I check back.)",
  zh: '（过几日我来问结果，届时回 yes / no / mixed 即可。）',
}

export function detectMethod(text: string): Method {
  const lower = text.toLowerCase()
  if (LIUREN_TRIGGERS.some((k) => lower.includes(k.toLowerCase()))) return 'liuren'
  return 'meihua'
}

export interface QueryDeps {
  db: Db
  llm: LlmClient
  followUpDays: number
}

export interface QueryInput {
  phone: string
  text: string
  user: UserRow
  receivedAt: Date
}

export async function runQuery(
  input: QueryInput,
  deps: QueryDeps,
): Promise<string> {
  const { phone, text, user, receivedAt } = input
  const { db, llm, followUpDays } = deps

  const method = detectMethod(text)
  const kernel = method === 'liuren' ? castLiuren(receivedAt) : castMeihua(receivedAt)
  const lang: Lang = user.preferred_lang ?? detectLang(text)

  const recent = db.getRecentReadings(phone, 3)
  const interpretation = await llm.interpret({
    question: text,
    lang,
    kernel,
    user,
    recent,
  })

  const header =
    method === 'liuren'
      ? formatLiurenHeader(kernel as ReturnType<typeof castLiuren>)
      : formatMeihuaHeader(kernel as ReturnType<typeof castMeihua>)

  const castAt = receivedAt.getTime()
  const followUpAt = castAt + followUpDays * 24 * 60 * 60 * 1000

  db.recordReading({
    phone,
    question: text,
    method,
    kernel_json: JSON.stringify(kernel),
    interpretation,
    lang,
    cast_at: castAt,
    follow_up_at: followUpAt,
  })

  return formatReply(header, interpretation, FOLLOW_UP_NOTE[lang])
}
