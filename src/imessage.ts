import { IMessageSDK } from '@photon-ai/imessage-kit'

export type InboundMessage = {
  id: string
  text: string
  sender: string
  chatId: string
  receivedAt: Date
}

type InboundHandler = (msg: InboundMessage) => void | Promise<void>

export type IMessageClient = {
  sdk: IMessageSDK
  reply: (phone: string, text: string) => Promise<void>
  watch: (handler: InboundHandler) => Promise<void>
  shutdown: () => Promise<void>
}

export function createImessageClient(options: { debug?: boolean } = {}): IMessageClient {
  const sdk = new IMessageSDK({ debug: options.debug ?? false })

  const reply = async (phone: string, text: string): Promise<void> => {
    await sdk.send(phone, text)
  }

  const watch = async (handler: InboundHandler): Promise<void> => {
    await sdk.startWatching({
      onDirectMessage: (msg) => {
        if (msg.isFromMe) return
        if (msg.isReaction) return
        if (!msg.text || !msg.sender) return
        const inbound: InboundMessage = {
          id: msg.id,
          text: msg.text,
          sender: msg.sender,
          chatId: msg.chatId,
          receivedAt: msg.date,
        }
        void Promise.resolve(handler(inbound)).catch((err: unknown) => {
          console.error('[imessage] handler error:', err)
        })
      },
      onError: (err) => {
        console.error('[imessage] sdk error:', err)
      },
    })
  }

  const shutdown = async (): Promise<void> => {
    sdk.stopWatching()
    await sdk.close()
  }

  return { sdk, reply, watch, shutdown }
}
