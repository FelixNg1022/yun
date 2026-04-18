import { env } from './env.ts'
import { createImessageClient, type InboundMessage } from './imessage.ts'

async function main(): Promise<void> {
  const ownerPhone = env.ownerPhone()
  const client = createImessageClient({ debug: false })

  const onMessage = async (msg: InboundMessage): Promise<void> => {
    console.log(`[${msg.receivedAt.toISOString()}] ${msg.sender}: ${msg.text}`)
    await client.reply(msg.sender, `pong: ${msg.text}`)
  }

  await client.watch(onMessage)
  console.log(`运 watcher online. Owner: ${ownerPhone}. Waiting for messages…`)

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nReceived ${signal}, shutting down…`)
    await client.shutdown()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err: unknown) => {
  console.error('fatal:', err)
  process.exit(1)
})
