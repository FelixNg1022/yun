type Level = 'info' | 'warn' | 'error'

export interface Logger {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string, err?: unknown) => void
}

export function createLogger(logFilePath: string): Logger {
  const file = Bun.file(logFilePath)
  // Open an append-mode writer once; Bun will create the file if missing.
  const writer = file.writer()

  const write = (level: Level, line: string): void => {
    const ts = new Date().toISOString()
    const row = `${ts} ${level.toUpperCase()} ${line}\n`
    writer.write(row)
    writer.flush()
    const stream = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    stream(row.trimEnd())
  }

  return {
    info: (msg) => write('info', msg),
    warn: (msg) => write('warn', msg),
    error: (msg, err) => {
      const detail = err ? ` :: ${errorMessage(err)}` : ''
      write('error', msg + detail)
    },
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}
