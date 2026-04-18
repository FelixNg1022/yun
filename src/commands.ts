import type { Db, Lang, UserRow } from './db.ts'
import { computeBazi } from './divination/bazi.ts'

export interface CommandDeps {
  db: Db
}

const PALACES_EN = 'meihua (default) / liuren (say "小六壬" or "liuren")'

export function handleCommand(text: string, user: UserRow, deps: CommandDeps): string {
  const parts = text.trim().split(/\s+/)
  const cmd = parts[0]?.toLowerCase() ?? ''
  const args = parts.slice(1)
  switch (cmd) {
    case '/help':
      return help(user.preferred_lang)
    case '/history':
      return history(user, deps.db)
    case '/stats':
      return stats(user, deps.db)
    case '/methods':
      return methods(user.preferred_lang)
    case '/lang':
      return setLang(user, args, deps.db)
    case '/setup':
      return setup(user, args.join(' '), deps.db)
    default:
      return unknown(user.preferred_lang)
  }
}

function help(lang: Lang): string {
  if (lang === 'zh') {
    return [
      '运 — 命令一览',
      '/help        这条帮助',
      '/history     最近 5 次卦',
      '/stats       总次数 + 应验率',
      '/methods     三种方法简介',
      '/lang en|zh  切换语言',
      '/setup <ISO 出生日期>  更新八字',
      '',
      '直接发问题即可 — 默认梅花易数；含「小六壬 / liuren」切到小六壬。',
    ].join('\n')
  }
  return [
    '运 — commands',
    '/help        this message',
    '/history     last 5 readings',
    '/stats       total count + hit rate',
    '/methods     short intro to each method',
    '/lang en|zh  switch language',
    '/setup <ISO birth>   update your 八字',
    '',
    `just text a question — method: ${PALACES_EN}.`,
  ].join('\n')
}

function history(user: UserRow, db: Db): string {
  const recent = db.getRecentReadings(user.phone, 5)
  if (recent.length === 0) {
    return user.preferred_lang === 'zh' ? '还没有卦。问一个吧。' : 'no readings yet. ask one.'
  }
  const lines = recent.map((r, i) => {
    const date = new Date(r.cast_at).toISOString().slice(0, 10)
    const kernel = safeParse(r.kernel_json)
    const shorthand = shortKernel(kernel)
    const q = r.question.length > 48 ? r.question.slice(0, 45) + '…' : r.question
    return `${i + 1}. [${date}] ${r.method} · ${shorthand} · "${q}"`
  })
  return lines.join('\n')
}

function stats(user: UserRow, db: Db): string {
  const s = db.getStats(user.phone)
  const zh = user.preferred_lang === 'zh'
  if (s.total === 0) {
    return zh ? '还没有卦。问一个吧。' : 'no readings yet. ask one.'
  }
  const decided = s.yes + s.no
  const hitRate = decided > 0 ? Math.round((s.yes / decided) * 100) : null
  const hitLine =
    hitRate === null
      ? zh
        ? '应验率：还没有明确结果的记录'
        : 'hit rate: no decided outcomes yet'
      : zh
        ? `应验率：${hitRate}% （准 ${s.yes} / 不准 ${s.no} / 一半 ${s.mixed}）`
        : `hit rate: ${hitRate}% (yes ${s.yes} / no ${s.no} / mixed ${s.mixed})`
  if (zh) {
    return [`总卦数：${s.total}`, `有结果：${s.with_outcome} / ${s.total}`, hitLine].join('\n')
  }
  return [`total readings: ${s.total}`, `with outcome: ${s.with_outcome} / ${s.total}`, hitLine].join('\n')
}

function methods(lang: Lang): string {
  if (lang === 'zh') {
    return [
      '三法简介：',
      '• 梅花易数（默认）：根据你发问的那一刻的阴历年月日时，推出上下卦与动爻。',
      '• 小六壬：以六个宫位（大安/留连/速喜/赤口/小吉/空亡）推月、日、时三宫。含「小六壬」或「liuren」则切到此法。',
      '• 八字：入门时算一次，作为所有卦的解读背景（日主、五行强弱）。',
    ].join('\n')
  }
  return [
    'methods:',
    '• 梅花易数 (default): hexagram + changing line from the lunar year/month/day/hour of your message.',
    '• 小六壬: three-palace cast over month, day, and hour. Include "小六壬" or "liuren" in your message.',
    '• 八字: your four pillars, computed once from birth data — used as context in every interpretation.',
  ].join('\n')
}

function setLang(user: UserRow, args: string[], db: Db): string {
  const arg = args[0]?.toLowerCase()
  if (arg !== 'en' && arg !== 'zh') {
    return user.preferred_lang === 'zh' ? '用法：/lang en 或 /lang zh' : 'usage: /lang en | /lang zh'
  }
  db.setUserLang(user.phone, arg)
  return arg === 'zh' ? '已切换为中文。' : 'switched to English.'
}

function setup(user: UserRow, raw: string, db: Db): string {
  const zh = user.preferred_lang === 'zh'
  if (!raw.trim()) {
    return zh ? '用法：/setup 2002-10-22T18:00:00+08:00' : 'usage: /setup 2002-10-22T18:00:00+08:00'
  }
  try {
    const bazi = computeBazi(raw.trim())
    db.setUserBirth(user.phone, {
      name: user.name,
      birth_iso: raw.trim(),
      bazi_json: JSON.stringify(bazi),
    })
    const pillars = `${bazi.year_pillar.gan_zhi} ${bazi.month_pillar.gan_zhi} ${bazi.day_pillar.gan_zhi} ${bazi.hour_pillar.gan_zhi}`
    return zh
      ? `已更新：${pillars}（日主 ${bazi.day_master} · ${bazi.day_master_element}）`
      : `updated: ${pillars} (day master ${bazi.day_master} · ${bazi.day_master_element})`
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return zh ? `更新失败：${msg}` : `could not parse: ${msg}`
  }
}

function unknown(lang: Lang): string {
  return lang === 'zh' ? '不认识这个命令。试试 /help。' : "unknown command. try /help."
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

function shortKernel(k: unknown): string {
  if (!k || typeof k !== 'object') return '?'
  const rec = k as Record<string, unknown>
  if (rec.method === 'meihua') {
    const primary = (rec.primary as { name_zh?: string })?.name_zh ?? '?'
    const changed = (rec.changed as { name_zh?: string })?.name_zh ?? '?'
    return `${primary}→${changed}`
  }
  if (rec.method === 'liuren') {
    const mp = (rec.month_palace as { name?: string })?.name
    const dp = (rec.day_palace as { name?: string })?.name
    const hp = (rec.hour_palace as { name?: string })?.name
    return `${mp}/${dp}/${hp}`
  }
  return '?'
}
