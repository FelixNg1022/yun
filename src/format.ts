import type { MeihuaResult } from './divination/meihua.ts'
import type { LiurenResult } from './divination/liuren.ts'

export function formatMeihuaHeader(r: MeihuaResult): string {
  const castLocal = formatLocalDate(new Date(r.cast_at_iso))
  const m = r.math
  return [
    `🎴 梅花易数 · ${castLocal}`,
    `lunar: ${r.lunar.year_gz}年 月${r.lunar.month} 日${r.lunar.day} ${r.lunar.hour_zhi}时`,
    `upper: (${m.year_zhi_num}+${m.lunar_month}+${m.lunar_day}) mod 8 = ${m.upper_mod} → ${m.upper_trigram}`,
    `lower: (+${m.hour_zhi_num}) mod 8 = ${m.lower_mod} → ${m.lower_trigram}`,
    `line:  ${m.changing_sum} mod 6 = ${m.changing_line} → line ${m.changing_line} changing`,
    `→ ${r.primary.name_zh} (${r.primary.num}), changing to ${r.changed.name_zh} (${r.changed.num})`,
  ].join('\n')
}

export function formatLiurenHeader(r: LiurenResult): string {
  const castLocal = formatLocalDate(new Date(r.cast_at_iso))
  return [
    `🀄 小六壬 · ${castLocal}`,
    `lunar: 月${r.lunar.month} 日${r.lunar.day} ${r.lunar.hour_zhi}时`,
    `月 → ${r.month_palace.name}`,
    `日 → ${r.day_palace.name}`,
    `时 → ${r.hour_palace.name}`,
  ].join('\n')
}

export function formatReply(header: string, interpretation: string, followUpNote: string): string {
  return `${header}\n\n${interpretation}\n\n${followUpNote}`
}

function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const tz = tzAbbrev(d)
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} ${tz}`
}

function tzAbbrev(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(d)
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
}
