import { describe, expect, test } from 'bun:test'
import { parseOutcome } from '../src/router.ts'
import { detectMethod } from '../src/query.ts'
import { detectLang } from '../src/lang.ts'

describe('detectMethod', () => {
  test('default = meihua for plain questions', () => {
    expect(detectMethod('should I take the offer?')).toBe('meihua')
    expect(detectMethod('我该不该搬去纽约？')).toBe('meihua')
  })

  test('六壬 keyword switches to liuren', () => {
    expect(detectMethod('用小六壬帮我看看')).toBe('liuren')
    expect(detectMethod('六壬: should I call her?')).toBe('liuren')
    expect(detectMethod('can you do a liuren cast')).toBe('liuren')
  })
})

describe('detectLang', () => {
  test('empty string → en', () => {
    expect(detectLang('')).toBe('en')
  })

  test('pure English → en', () => {
    expect(detectLang('should I take the Boomi offer')).toBe('en')
  })

  test('pure Chinese → zh', () => {
    expect(detectLang('我该不该搬去纽约')).toBe('zh')
  })

  test('mostly English with one CJK char → en', () => {
    expect(detectLang('hey, I want to learn 中文 this year')).toBe('en')
  })

  test('mostly Chinese with some English → zh', () => {
    expect(detectLang('我想问 Boomi 这个 offer 要不要接')).toBe('zh')
  })
})

describe('parseOutcome', () => {
  test('plain yes/no/mixed', () => {
    expect(parseOutcome('yes')).toEqual({ played_out: 1, note: null })
    expect(parseOutcome('no')).toEqual({ played_out: 0, note: null })
    expect(parseOutcome('mixed')).toEqual({ played_out: -1, note: null })
  })

  test('with trailing note', () => {
    expect(parseOutcome('yes it totally played out')).toEqual({
      played_out: 1,
      note: 'it totally played out',
    })
    expect(parseOutcome("no it didn't happen")).toEqual({
      played_out: 0,
      note: "it didn't happen",
    })
  })

  test('Chinese yes/no/mixed', () => {
    expect(parseOutcome('是的')).toEqual({ played_out: 1, note: null })
    expect(parseOutcome('没中')).toEqual({ played_out: 0, note: null })
    expect(parseOutcome('不确定')).toEqual({ played_out: -1, note: null })
  })

  test('unrelated text → null (treat as new query)', () => {
    expect(parseOutcome('hmm not sure what you mean')).toBeNull()
    expect(parseOutcome('random thought about work')).toBeNull()
  })
})
