import type { Db, Outcome, UserRow } from './db.ts'
import type { LlmClient } from './llm.ts'
import { runQuery } from './query.ts'
import { handleCommand } from './commands.ts'

const OUTCOME_WINDOW_MS = 48 * 60 * 60 * 1000

export type RouteKind = 'command' | 'outcome' | 'query'

export interface RouteDeps {
  db: Db
  llm: LlmClient
  followUpDays: number
  ensureUser: (phone: string) => UserRow
}

export interface IncomingMessage {
  phone: string
  text: string
  receivedAt: Date
}

export async function route(msg: IncomingMessage, deps: RouteDeps): Promise<string> {
  const { db, ensureUser } = deps
  const text = msg.text.trim()
  const user = ensureUser(msg.phone)

  if (text.startsWith('/')) {
    return handleCommand(text, user, { db })
  }

  if (looksLikeOutcomeShape(text)) {
    const pending = db.getMostRecentPendingOutcome(msg.phone, OUTCOME_WINDOW_MS)
    if (pending) {
      const parsed = parseOutcome(text)
      if (parsed !== null) {
        db.recordOutcome({
          reading_id: pending.id,
          played_out: parsed.played_out,
          user_note: parsed.note,
          recorded_at: Date.now(),
        })
        return outcomeAck(parsed.played_out, user.preferred_lang)
      }
    }
  }

  return runQuery({ phone: msg.phone, text, user, receivedAt: msg.receivedAt }, deps)
}

function looksLikeOutcomeShape(text: string): boolean {
  return text.length < 200 && !text.includes('?') && !text.includes('？')
}

interface ParsedOutcome {
  played_out: Outcome
  note: string | null
}

const YES_TOKENS = ['yes', 'y', '是', '是的', '对', '对了', '中', '中了', '准', '准了', 'played out', 'it did']
const NO_TOKENS = ['no', 'n', '否', '不', '不是', '没有', '没中', "didn't", "it didn't", 'it did not', 'did not']
const MIXED_TOKENS = ['mixed', 'maybe', 'sort of', 'kind of', '不確定', '不确定', '一半', '一半一半', '模糊', '差不多']

export function parseOutcome(text: string): ParsedOutcome | null {
  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()

  const yesMatch = matchLongest(lower, YES_TOKENS)
  if (yesMatch !== null) return { played_out: 1, note: remainderAfter(trimmed, yesMatch) }
  const noMatch = matchLongest(lower, NO_TOKENS)
  if (noMatch !== null) return { played_out: 0, note: remainderAfter(trimmed, noMatch) }
  const mixedMatch = matchLongest(lower, MIXED_TOKENS)
  if (mixedMatch !== null) return { played_out: -1, note: remainderAfter(trimmed, mixedMatch) }
  return null
}

// Returns the length of the longest prefix token that matches at the start of
// `lower`, followed by either end-of-string, whitespace, or CJK punctuation.
// Returns null if no token matches cleanly.
function matchLongest(lower: string, tokens: readonly string[]): number | null {
  let best: number | null = null
  for (const tok of tokens) {
    if (!lower.startsWith(tok)) continue
    const next = lower.charAt(tok.length)
    const isClean = next === '' || /[\s.,!?。，！？]/.test(next)
    if (!isClean) continue
    if (best === null || tok.length > best) best = tok.length
  }
  return best
}

function remainderAfter(text: string, prefixLen: number): string | null {
  const rest = text.slice(prefixLen).replace(/^[\s.,!?。，！？]+/, '').trim()
  return rest.length > 0 ? rest : null
}

function outcomeAck(v: Outcome, lang: 'en' | 'zh'): string {
  if (lang === 'zh') {
    if (v === 1) return '好，记下来了：这次准了 ✅'
    if (v === 0) return '好，记下来了：这次没准 ❌'
    return '好，记下来了：一半一半 ⚖️'
  }
  if (v === 1) return "logged: it played out ✅"
  if (v === 0) return "logged: it didn't ❌"
  return 'logged: mixed ⚖️'
}

