import type { Lang } from './db.ts'

const CJK_REGEX = /[\u3400-\u9fff\uf900-\ufaff]/

export function detectLang(text: string): Lang {
  if (!text) return 'en'
  const chars = Array.from(text)
  const cjkCount = chars.filter((c) => CJK_REGEX.test(c)).length
  const ratio = cjkCount / chars.length
  return ratio > 0.3 ? 'zh' : 'en'
}
