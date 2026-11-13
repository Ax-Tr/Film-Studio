export type BridgeCommand = {
  type: 'command'
  id: string
  name: 'init' | 'getDocument' | 'setDocument' | 'focus' | 'setEditable'
  payload?: unknown
}

export type BridgeResponse = {
  type: 'response'
  id: string
  ok: boolean
  result?: unknown
  error?: { code: string; message: string }
}

export type BridgeEvent = {
  type: 'event'
  name: 'ready' | 'documentChanged' | 'selectionChanged' | 'focusChanged'
  payload?: unknown
}

export type BridgeMessage = BridgeCommand | BridgeResponse | BridgeEvent

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export class MobileEditorBridge {
  readonly #pending = new Map<string, Pending>()
  readonly #listeners = new Set<(event: BridgeEvent) => void>()

  constructor(
    private readonly sendRaw: (message: string) => void,
    private readonly timeoutMs = 5_000,
  ) {}

  send(command: Omit<BridgeCommand, 'type' | 'id'>): Promise<unknown> {
    const id = crypto.randomUUID()
    const message: BridgeCommand = { type: 'command', id, ...command }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`Bridge command timed out: ${command.name}`))
      }, this.timeoutMs)

      this.#pending.set(id, { resolve, reject, timeout })
      this.sendRaw(JSON.stringify(message))
    })
  }

  onEvent(listener: (event: BridgeEvent) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  receive(raw: string): void {
    const message = parseBridgeMessage(raw)
    if (message.type === 'event') {
      for (const listener of this.#listeners) listener(message)
      return
    }
    if (message.type !== 'response') return

    const pending = this.#pending.get(message.id)
    if (!pending) return
    clearTimeout(pending.timeout)
    this.#pending.delete(message.id)

    if (message.ok) pending.resolve(message.result)
    else pending.reject(new Error(message.error?.message ?? 'Unknown editor bridge error'))
  }

  dispose(): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Editor bridge disposed'))
    }
    this.#pending.clear()
    this.#listeners.clear()
  }
}

export function parseBridgeMessage(raw: string): BridgeMessage {
  const value: unknown = JSON.parse(raw)
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    throw new Error('Invalid bridge message')
  }
  const type = (value as { type?: unknown }).type
  if (type !== 'command' && type !== 'response' && type !== 'event') {
    throw new Error('Unknown bridge message type')
  }
  return value as BridgeMessage
}
