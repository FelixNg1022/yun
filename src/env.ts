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
  ownerPhone: () => required('OWNER_PHONE'),
  ownerBirth: () => required('OWNER_BIRTH'),
  ownerBirthCity: () => optional('OWNER_BIRTH_CITY', 'Unknown'),
  followUpDays: () => Number(optional('FOLLOW_UP_DAYS', '5')),
}
