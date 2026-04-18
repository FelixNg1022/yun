function required(key: string): string {
  const value = process.env[key]
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env var: ${key}`)
  }
  return value
}

function optional(key: string, fallback: string): string {
  const value = process.env[key]
  return value && value.trim() !== '' ? value : fallback
}

export const env = {
  anthropicApiKey: () => required('ANTHROPIC_API_KEY'),
  // Primary owner phone (E.164). Used as the default reply target + user row.
  ownerPhone: () => required('OWNER_PHONE').split(',')[0]!.trim(),
  // All trusted sender phones (comma-separated). OWNER_PHONE + optional extras.
  trustedPhones: (): string[] => {
    const owners = required('OWNER_PHONE')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const extra = (process.env.TRUSTED_PHONES ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return [...new Set([...owners, ...extra])]
  },
  ownerBirth: () => required('OWNER_BIRTH'),
  ownerBirthCity: () => optional('OWNER_BIRTH_CITY', 'Unknown'),
  followUpDays: () => Number(optional('FOLLOW_UP_DAYS', '5')),
  schedulerIntervalSeconds: () => Number(optional('SCHEDULER_INTERVAL_SECONDS', '60')),
}
