import { describe, expect, it, vi } from 'vitest'
import { MobileEditorBridge } from '../src/mobile-bridge-protocol.js'

describe('mobile editor bridge protocol', () => {
  it('correlates asynchronous command responses', async () => {
    let outbound = ''
    const bridge = new MobileEditorBridge((message) => { outbound = message })
    const resultPromise = bridge.send({ name: 'getDocument' })
    const command = JSON.parse(outbound) as { id: string }

    bridge.receive(JSON.stringify({ type: 'response', id: command.id, ok: true, result: { type: 'doc' } }))

    await expect(resultPromise).resolves.toEqual({ type: 'doc' })
    bridge.dispose()
  })

  it('forwards editor events without creating response promises', () => {
    const listener = vi.fn()
    const bridge = new MobileEditorBridge(() => undefined)
    bridge.onEvent(listener)
    bridge.receive(JSON.stringify({ type: 'event', name: 'documentChanged', payload: { revision: 2 } }))

    expect(listener).toHaveBeenCalledWith({ type: 'event', name: 'documentChanged', payload: { revision: 2 } })
    bridge.dispose()
  })

  it('fails a command instead of hanging when the WebView does not answer', async () => {
    vi.useFakeTimers()
    const bridge = new MobileEditorBridge(() => undefined, 100)
    const resultPromise = bridge.send({ name: 'focus' })
    const assertion = expect(resultPromise).rejects.toThrow('timed out')

    await vi.advanceTimersByTimeAsync(100)
    await assertion
    bridge.dispose()
    vi.useRealTimers()
  })
})
