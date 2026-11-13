import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

function newScene(sceneId: string): Y.Doc {
  return new Y.Doc({ guid: sceneId })
}

describe('one Yjs document per scene', () => {
  it('converges after concurrent offline Telugu edits, reversed delivery, and duplicates', () => {
    const left = newScene('scene-001')
    const right = newScene('scene-001')
    const initial = new TextEncoder().encode('')
    expect(initial.byteLength).toBe(0)

    left.getText('screenplay').insert(0, 'రవి: నేను రేపు వస్తాను. ')
    right.getText('screenplay').insert(0, 'సీత: తప్పకుండా రా. ')

    const leftUpdate = Y.encodeStateAsUpdate(left)
    const rightUpdate = Y.encodeStateAsUpdate(right)
    Y.applyUpdate(left, rightUpdate)
    Y.applyUpdate(right, leftUpdate)
    Y.applyUpdate(right, leftUpdate)

    expect(right.getText('screenplay').toString()).toBe(left.getText('screenplay').toString())
    expect(left.getText('screenplay').toString()).toContain('రవి')
    expect(left.getText('screenplay').toString()).toContain('సీత')
  })

  it('uses a state vector to send only the missing scene update', () => {
    const source = newScene('scene-002')
    const target = newScene('scene-002')
    source.getText('screenplay').insert(0, 'INT. ఇల్లు — రాత్రి')

    const missing = Y.encodeStateAsUpdate(source, Y.encodeStateVector(target))
    Y.applyUpdate(target, missing)

    expect(target.getText('screenplay').toString()).toBe('INT. ఇల్లు — రాత్రి')
    expect(Y.encodeStateAsUpdate(source, Y.encodeStateVector(target)).byteLength).toBeLessThanOrEqual(2)
  })

  it('does not leak updates between different scene documents', () => {
    const sceneA = newScene('scene-a')
    const sceneB = newScene('scene-b')
    sceneA.getText('screenplay').insert(0, 'Scene A private text')

    expect(sceneB.getText('screenplay').toString()).toBe('')
  })
})
